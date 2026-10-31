# Architecture

This document explains how Ironside Dawn is built and why. The phased plan is in
[`ROADMAP.md`](ROADMAP.md). When a decision here changes, update this file in
the same commit as the change.

---

## 1. Design pillars

Every technical decision below follows from these five pillars.

1. **Observe, don't play.** The user is a spectator. The simulation never waits
   for input. The UI only reads the world, except for meta controls like
   pause, speed, and new world.
2. **Emergence over scripting.** No quest scripts and no story beats. Stories
   come from many small, independent decisions. When something interesting
   happens, a rule caused it.
3. **Deterministic and reproducible.** The same seed and the same version give
   the same world, every time. This makes bugs reproducible, lets worlds be
   shared as seeds, and makes balancing measurable.
4. **Every happening is data.** The simulation emits structured events. Log
   text, character memories, chronicles, and statistics are all derived from
   those events. The simulation itself never builds display strings.
5. **Headless first.** The simulation core runs without a browser. It can
   simulate 100 years in a terminal and print statistics. The UI is one
   consumer of the core, not its owner.

---

## 2. Tech stack

| Concern         | Choice                                           | Notes                                                                                                                                |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Language        | **TypeScript** (strict)                          | The data model will be large and deeply connected. Types make that manageable. Pinned to 6.0.x until typescript-eslint supports 7.x. |
| Build/dev       | **Vite**                                         | Fast HMR, native Web Worker support, minimal configuration.                                                                          |
| UI              | **React**                                        | Panels, profiles, inspectors, and links between entities are ordinary UI work.                                                       |
| UI state        | **`useSyncExternalStore`** (Zustand if it grows) | The host is the store; React subscribes to its snapshots.                                                                            |
| Long lists      | **TanStack Virtual**                             | The event log will reach hundreds of thousands of lines. Only visible rows are rendered.                                             |
| Sim ↔ UI        | **Web Worker** + **Comlink**                     | Keeps the simulation off the render thread (see §5).                                                                                 |
| Map (later)     | **PixiJS** on a `<canvas>`                       | Used only where a picture helps: the world map and route overlays.                                                                   |
| Tests           | **Vitest**                                       | Same config as Vite. Also used for determinism and statistical tests.                                                                |
| Headless runner | **tsx** (Node)                                   | Runs `npm run sim -- --seed 42 --years 50` for balancing and debugging.                                                              |
| Persistence     | **IndexedDB** (via `idb`)                        | Saves are larger than `localStorage` allows.                                                                                         |
| Desktop (later) | **Tauri**                                        | Wraps the same web build as a native app for Windows, macOS, and Linux.                                                              |

### Why HTML/React rather than a non-HTML GUI?

The core experience is reading: a scrolling chronicle, character sheets, item
tooltips, and "click a name to open that character". The DOM is the best tool
for that. It handles text rendering, wrapping, selection, copy/paste,
accessibility, hyperlinks, and CSS theming with no extra work. A canvas or
game-engine UI would have to rebuild all of it.

Graphics go where they help, which is a map. The plan uses a hybrid layout:
DOM panels around a single canvas map view (Phase 9).

Alternatives considered:

- **Godot / Unity / Bevy.** Good for a game. For a text-first observer they
  cost a lot (worse text UI, a heavier toolchain, a second language) and add
  little.
- **Svelte or Solid instead of React.** Both are excellent and somewhat faster
  for high-frequency updates. React was chosen because it is familiar and has
  the largest ecosystem. Section 5 keeps update frequency low, so the speed
  difference doesn't matter here. The UI is a thin layer and could be swapped
  later.
- **A full terminal/ASCII renderer (rot.js).** This would give a nice
  roguelike look, but CSS on the DOM can produce that look without giving up
  real UI.

---

## 3. High-level shape

```
┌──────────────────────── Web Worker ────────────────────────┐
│                                                            │
│   World State  ◄────── Systems (pure-ish functions) ─────┐ │
│   (plain data)          travel, combat, ai, economy …    │ │
│        │                                                 │ │
│        ▼                                                 │ │
│   Scheduler (priority queue of "who acts next, when") ───┘ │
│        │                                                   │
│        ▼                                                   │
│   Event stream  ──►  memories, stats, chronicle (in-sim)   │
│                                                            │
└────────────┬───────────────────────────────────────────────┘
             │  batched events + throttled snapshots (Comlink)
             ▼
┌──────────────────────── Main thread ───────────────────────┐
│   SimHost (start/pause/speed/save)                         │
│   Host snapshot (useSyncExternalStore) ──► React panels   │
│      Log · Character profile · Location view · Map · Stats │
│   Text renderer: Event ──► "Rufus enters the Dungeon …"    │
└────────────────────────────────────────────────────────────┘

           (same core, no worker)
┌──────────── Node: headless runner / tests ─────────────────┐
│   run N years at max speed → metrics, CSV, event dumps     │
└────────────────────────────────────────────────────────────┘
```

### Directory layout

```
src/
  sim/                 # NO DOM, NO React. Runs in the worker, Node, and tests.
    core/              # rng, clock, scheduler, ids, event bus, world container
    model/             # types: Character, Location, Item, Creature, Event …
    systems/           # travel, combat, loot, progression, ai, social, economy …
    gen/               # world, name, creature, and item generators
    simulation.ts      # createSimulation(options), advance(until)
  content/             # data tables: species, cultures, creatures, items, spells, names
  text/                # event → prose, calendar names. No DOM; shared by UI and CLI.
  host/                # SimHost (main thread now, worker in Phase 6) + speed tiers
  ui/                  # React app
tools/
  sim-cli.ts           # headless runner
docs/
```

The rule that `src/sim/` never imports the DOM is enforced, not just agreed on.
`src/sim/`, `src/content/` and `src/text/` share a `tsconfig` without the `DOM`
lib, plus ESLint rules against UI imports, Node built-ins, `Math.random()` and
wall-clock time.

---

## 4. Simulation core

### 4.1 Randomness: seeded, forked, never `Math.random()`

`Math.random()` can't be seeded, so a world built on it can never be
reproduced. The core uses a small seedable PRNG (e.g. **sfc32** or
**xoshiro128\*\***, around 30 lines and dependency-free) behind one `Rng`
interface:

```ts
interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(entries: readonly [T, number][]): T;
  gaussian(mean: number, sd: number): number;
  roll(dice: string): number; // "2d6+1"
  fork(label: string): Rng; // independent child stream
  getState(): RngState; // for saves; restoreRng(state) resumes it
}
```

Each subsystem uses its own **forked stream**, such as `rng.fork("combat")` or
`rng.fork("worldgen")`. Without forks, a new random call added to the loot
system would shift every later roll in the world and change everything
downstream. With forks, the change stays inside the loot stream.

Forks are keyed by label and derived from the seed, not from the parent's
current position: forking never consumes parent draws, and the same label
always gives the same stream. `chance()` always consumes exactly one draw (and
`gaussian()` two), so tuning a probability never shifts the rolls that follow.

The RNG state is part of the world state and is saved with it. The
implementation lives in `src/sim/core/rng.ts`. Its golden-value test pins the
algorithm, because changing it would silently change every seed and save.

### 4.2 Time, speed, and scaling

#### The clock

- **The base unit is the in-game second.** World time is a single integer
  (a JS number safely counts ~285 million years of seconds). The calendar
  (seconds → minutes → hours → days → seasons → years) is derived from it for
  display, e.g. _"Year 3 · Highsun 11 · 14:20:07"_. A year is four seasons of
  90 days: Thaw, Highsun, Harvest and Deepwinter. Worlds begin at 06:00 on
  day 1 of year 1.
- **Scheduler-driven, not tick-everyone.** Nobody gets updated every second.
  Each actor is in a priority queue keyed by _when it next needs to decide
  something_. A character walking for 6 hours is not touched for those 6
  hours. Arriving is one event.
- **Precision is free.** With a scheduler, cost grows with the number of
  _decisions_, not with elapsed time or clock resolution. Measuring in
  seconds instead of minutes costs nothing, so sword blows can land
  seconds apart in real-time view.
- **Global processes** (markets clearing, creature populations breeding,
  seasons) are scheduled entries on the same queue, e.g. "every day at 00:00".

#### Speed tiers

| Tier             | Sim time per real second              | Log shows (default floor)                                 | For watching…    |
| ---------------- | ------------------------------------- | --------------------------------------------------------- | ---------------- |
| **Real-time**    | 1 second                              | Everything, including blow-by-blow for watched characters | a duel           |
| **Minute**       | 1 minute                              | Everything                                                | a dungeon delve  |
| **Hour**         | 1 hour                                | Normal and above, rate-limited                            | a day in a town  |
| **Day**          | 1 day                                 | Notable and above                                         | a season passing |
| **Season**       | ~1 season                             | Notable and above                                         | years passing    |
| **Fast-forward** | As fast as possible ("skip 10 years") | A digest, plus legendary events                           | generations      |

The user can lower or raise the log floor at any tier. The defaults keep the
log readable.

#### The golden rule: the world doesn't care who's watching

**Simulation results never depend on the speed tier or on what the user is
looking at.** The same seed produces the same history whether it was watched
second by second or skipped in fast-forward. Speed and focus change only
_how much is shown_, never _what happens_. This keeps the world deterministic
and avoids an observer effect where looking away changes the rules. It also
means fast-forward can't use shortcuts that change outcomes.

#### Surviving "decades in minutes"

A rough budget: 500 named characters × ~30 decisions per in-game day ≈ 15k
decisions per day. A decade is ~55M decisions; doing that in 5 real minutes
needs ~180k decisions per second. That is achievable in a worker if each
decision takes a few microseconds, which means no allocation-heavy code and no
full-world scans in hot paths. Techniques, from day one onward:

1. **Scheduler** (above): sleeping actors cost nothing.
2. **Named vs. statistical population.** Only _notable_ beings are full agents:
   adventurers, merchants, lords, outlaws, bosses. Townsfolk, farmers, and
   common creatures are **numbers on a location** (e.g. "pop. 1,200";
   "wolves ≈ 40"), updated in daily aggregate steps. An individual is
   **promoted** to a named agent when they matter: a farmer's daughter takes
   up the sword, or a wolf becomes the pack alpha that killed a hero.
3. **Silent detail.** Fights and delves are always resolved fully, so RNG use
   is identical either way. Fine-grained events (each blow, each room) are only
   _emitted_ when someone is watching that character or place. Emitting never
   touches world RNG or state, so it can't change history. _(Planned for
   Phase 6 with follow mode. Until then every blow is emitted as a trivial
   event; detail events will need IDs that don't shift the main sequence.)_
4. **Retention by importance.** Unwatched trivial events are never stored.
   Normal events expire after a while. Notable and legendary events are kept
   forever.
5. **Display throttling.** The UI gets at most N events per batch above the
   current floor, and the rest becomes a digest line ("…and 3,412 minor
   happenings across the realm").
6. **Playback buffer.** At slow tiers the worker simulates slightly ahead and
   the UI plays events back at their timestamps. Real-time mode reads
   smoothly (blows land a second apart) instead of arriving in bursts.
7. **Per-location processes.** Markets, ecology, and statistical populations
   cost per _place_, not per _being_.
8. **Last resort: world-based level of detail.** If profiling still demands
   it, simplify by world state (e.g. coarser ecology in remote regions),
   applied the same way whether or not anyone is watching (golden rule).

The worker runs the sim in time slices and yields between them, so pause and
speed changes take effect immediately even in fast-forward.

Two more pieces, added in Phase 5:

- **Wake tokens.** Each character has a counter. Scheduling a wake-up stamps
  it with the counter's new value, and a wake-up whose stamp is out of date
  is ignored. When a character's plans are cut short (a leader takes them
  along, outlaws ambush them), there is no need to dig the old wake-up out
  of the queue.
- **Whereabouts index.** Who is at each place, kept in step by routing every
  move through one function. Meetings, ambushes and hunts look at the people
  present instead of scanning everyone. Each place's list stays in order of
  creation, however the index was built. That keeps the RNG's picks from it
  the same after a save is loaded.

### 4.3 World state: plain data, ECS-lite

All state is **plain, serializable data**: objects, arrays, and maps keyed by
IDs. It has no classes with behavior, no getters/setters, and no object
references between entities. Entities refer to each other by **ID**
(`CharacterId`, `LocationId`, …).

Plain data instead of classes with getters and setters, because:

- the state has to cross the worker boundary and be saved to IndexedDB, and
  plain data does both for free;
- behavior lives in **systems** (functions over the world), so it can be
  tested in isolation;
- IDs instead of references prevent dangling pointers when someone dies, and
  keep save files tree-shaped.

This is **not** a full archetype ECS (like bitECS). Characters carry rich,
irregular data (memories, relationships, inventories), and a classic ECS makes
that awkward. The model is "tables of entities by type + systems that operate
on them":

```ts
interface World {
  time: number;
  rng: RngState;
  characters: Map<CharacterId, Character>; // every sapient agent, any species
  locations: Map<LocationId, Location>; // incl. statistical populations
  creatures: Map<CreatureId, Creature>; // named/active beasts only
  items: Map<ItemId, Item>;
  // …
  scheduler: SchedulerState;
  eventLog: EventStore;
}
```

### 4.4 Events: the single source of truth for "what happened"

Every meaningful change emits a structured event:

```ts
interface SimEvent {
  id: EventId;
  t: number;                    // world time
  type: "travel.depart" | "travel.arrive" | "combat.start" | "combat.kill" | "loot.gain" | …;
  actors: EntityId[];           // who was involved (for filtering and memory)
  location?: LocationId;
  importance: 0 | 1 | 2 | 3;    // trivial · normal · notable · legendary
  data: Record<string, unknown>;
}
```

Consumers of the event stream:

- **The UI text renderer** turns events into prose using templates per event
  type. Each type has several phrasings, and the event's ID picks one, so a
  given event always reads the same way.
- **Character memory** (in-sim): an actor in an event may record it.
- **Statistics**: deaths by cause, gold flow, population.
- **The chronicle**: important events (≥ notable) are kept forever. Trivial
  ones expire from a ring buffer, so memory use stays flat over a long run.

Events record what happened. Systems never read the log to decide anything;
they read world state. This prevents feedback loops that are hard to debug.

### 4.5 Decision-making: utility AI

Each time a character is scheduled, it picks its next action using **utility
scoring**. Every candidate action (_rest at inn_, _delve dungeon X_, _sell
loot_, _seek companion_, _visit family_, _train_) gets a score:

```
score = Σ (need/drive weight × how well the action serves it)
        × personality modifiers
        × learned expectation (memory, §4.6)
        × (1 + noise)                        ← controlled randomness
```

Then the character picks from the top few options by weighted random, not
always the maximum. This keeps behavior believable without being predictable,
and it is built from the "simple math and RNG" the project calls for. If the
utility system becomes limiting, GOAP or HTN planning can be added later for
multi-step plans such as "craft a sword", which needs ore, a forge, and skill.

As built (`src/sim/systems/decide.ts`), each option's score is a sum of
_terms_, each tied to a motive (a drive, a fond memory of a place, curiosity
about somewhere new, home, loot to sell). Noise multiplies the total, the top
three are kept, and one is picked with weight `score³`. The two strongest
named terms become the decision's `why`, carried on the event and shown in the
log: _"…bound for Gorefang Caves (restless; hungry for glory)."_ A dungeon's
appeal is gated by restlessness, so glory or gold alone never sends a
just-returned adventurer straight back in. Sleep at night stays a rule, not a
choice. Spells in a fight are chosen the same way: each spell's odds × benefit,
minus its costs and backlash risk weighted by `1.5 − bravery`, against the
value of a plain swing.

### 4.6 Memory: three layers, all bounded

1. **Episodic memory.** A short list of personal events, each with a
   _salience_ score that decays over time. Strong events (near-death, a
   friend's death, a legendary kill) decay slowly and may be promoted to
   permanent _life events_, which feed the character's biography.
2. **Learned expectations.** Running statistics per (activity, place or kind),
   e.g. _"delving Gorefang Caves: 7 trips, 2 near-deaths, avg +40 gold"_. This
   is effectively a **multi-armed bandit**: characters exploit what has worked
   and explore with a probability set by their _curiosity_ trait. This is what
   makes a character "learn what works for them".
3. **Opinions of others.** A sparse map `otherId → { affinity, trust,
familiarity, lastSeen }`, updated by shared events (fought together,
   betrayed, traded fairly, rescued). It drives friendship, rivalry, parties,
   and marriage.

Every layer has a hard size cap with eviction of the least salient entries. A
character's memory stays the same size whether they are 20 or 80.

As built (`src/sim/systems/mind.ts`): up to 20 episodic memories (near-death,
triumph, fled, treasure, backlash, level), each fading with its own half-life,
from 45 days for fleeing to 180 for a legendary find. Permanent life events
are the character's _deeds_. Learned expectations exist for delves: per
dungeon, the number of trips, plus reward and danger as moving averages that
weight recent trips more (learning rate 0.35). A place's _fear_ is its
expected danger plus vivid near-death and flight memories there, so the fear
fades as the memories do. Curious characters get a novelty bonus for places
they haven't tried. Episodic memories also include grief for a dead friend
(180 days) and being wronged, robbed or attacked, by someone (120 days); the
second adds to the fear of the place where it happened.

Opinions (`src/sim/systems/social.ts`) hold affinity and trust from −1 to 1,
familiarity from 0 to 1, when the two last met, a `friend` or `rival` bond
once affinity crosses a threshold, and how many times this character has
hunted the other in vain. Each character keeps at most 30. The one with the
least familiarity plus strength of feeling (love or hate) is forgotten first.

### 4.7 Content as data

Species, creature templates, item bases, affixes, loot tables, recipes,
spells, languages, name lists, and location archetypes are **data files** in
`src/content/`, separate from the code. Adding a creature should not need a
code change. Later this makes community content packs (mods) almost free.

Every content entry carries a **culture tag**, and every generator takes a
culture as input. Phase 1 ships a single generic culture, but the code path
exists from the start, so the mythology-inspired regions
([`WORLD.md`](WORLD.md) §6) arrive later as data packs rather than a rewrite.

### 4.8 Beings: one character model for every people

There are two kinds of beings ([`WORLD.md`](WORLD.md) §2):

- **Characters**: every sapient being, whether human adventurer, elven
  archer, dwarven smith, bandit, demon warlord, or lich. They share one model
  (personality, memory, relationships, skills, languages). `species` and
  `culture` are fields, and species-specific behavior comes from species
  _data_ (stat modifiers, lifespan, disposition, attitudes).
- **Creatures**: beasts and mindless things (wolves, skeletons, imps), using
  lighter templates with instincts instead of the full mind.

**No being is hard-coded as an enemy.** Hostility between two beings is
computed from species attitudes, personal morality, their relationship, and
whether they share a language. That's what lets a human become a murderer,
or a dwarf and an elf become friends against the odds, without special
cases.

As built (Phase 5), A's hostility toward B is

```
0.5 × cruelty − 0.4 × species attitude − 0.6 × affinity − 0.3 × communication
```

where cruelty is `1 − compassion`, at full weight for an outlaw and 0.3 for
anyone else. An outlaw strikes only when it is non-negative. Fights have two
sides, each any mix of characters and creatures, so delves (party against
creatures), ambushes (travelers against outlaws) and hunts (hunters against
an outlaw and their gang) share one combat system.

---

## 5. UI ↔ simulation boundary

- The simulation runs in a **Web Worker** behind a `SimHost` interface:
  `start()`, `pause()`, `setSpeed()`, `save()`, `load()`, `query(...)`. Phase 1
  may run it on the main thread behind the same interface, then switch to the
  worker before the population grows.
- The worker pushes **batched new events** and **small throttled snapshots**
  (clock, counts, the followed character) to the UI about **5–10 times per
  second**, no matter how fast the sim runs. The UI never re-renders per
  event.
- Detail views (a full character sheet, a market's order book) are fetched **on
  demand** with `query()` calls, so the full world never has to be copied to
  the main thread.
- The log is virtualized, so its length doesn't slow down rendering.

---

## 6. Persistence

- A save is `{ version, seed, config, world }`, serialized and stored in
  IndexedDB. It can also be exported or imported as a file (compressed JSON at
  first; switch to a binary format only if saves get large).
- The save version is checked on load. Simple migrations are kept per version;
  until 1.0, an incompatible save is refused with a clear message.

---

## 7. Testing and tooling

- **Unit tests** for pure pieces: RNG distributions, dice parsing, the
  combat resolver, price updates, and memory eviction.
- **Determinism test (in CI):** run seed `N` for one in-game year twice and
  assert identical event-stream hashes. This catches accidental use of
  `Math.random()`, `Date.now()`, or unordered iteration.
- **Headless runner:** `npm run sim -- --seed 42 --years 50 --report` prints
  world-health metrics: population, deaths by cause, median level, total gold,
  price index, and items in circulation. Emergent systems tend to spiral
  (everyone dies, gold inflates, one hero ends up owning everything), and this
  is how those problems get caught.
- **Statistical tests:** Monte Carlo checks such as "a level-5 fighter beats an
  average goblin 85% ± 5% of the time", so balance changes are deliberate.
- **CI:** GitHub Actions runs typecheck, lint, tests, the determinism check, and
  a build.

---

## 8. Performance budget (targets, not guarantees)

| Scale                           | Target                                            |
| ------------------------------- | ------------------------------------------------- |
| 200 characters, 30 locations    | 1 in-game year simulates in < 5 s headless        |
| 1,000 characters, 100 locations | Smooth at every tier up to Season in the browser  |
| 500 characters, fast-forward    | 10 in-game years in ≤ 5 real minutes (§4.2)       |
| UI                              | 60 fps scroll/interaction regardless of sim speed |

The strategies are listed in §4.2. Beyond those built in from day one
(scheduler, named vs. statistical population, silent detail), only optimize
after the headless profiler shows a real bottleneck.

---

## 9. References and inspiration

- **Dwarf Fortress** (legends mode, world history generation) for emergent
  history and chronicles.
- **RimWorld** for storytellers, moods, and relationships from simple rules.
- **Caves of Qud** for procedural history and lore.
- **Doran & Parberry, "Emergent Economies for Role Playing Games" (2010)**, a
  model of agents with private price beliefs trading through a
  bid/ask clearinghouse. It is the starting point for the economy (Phase 7).
- **Ultima Online's original ecology**, a cautionary tale: it was cut because
  players disrupted it faster than it could balance itself. It shows why the
  headless balancing harness is needed.
