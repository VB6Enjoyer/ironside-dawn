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

| Concern | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (strict) | The data model will be large and deeply connected. Types make that manageable. |
| Build/dev | **Vite** | Fast HMR, native Web Worker support, minimal configuration. |
| UI | **React** | Panels, profiles, inspectors, and links between entities are ordinary UI work. |
| UI state | **Zustand** | Small. Holds the UI's copy of world snapshots plus UI-only state. |
| Long lists | **TanStack Virtual** (or react-virtuoso) | The event log will reach hundreds of thousands of lines. Only visible rows are rendered. |
| Sim ↔ UI | **Web Worker** + **Comlink** | Keeps the simulation off the render thread (see §5). |
| Map (later) | **PixiJS** on a `<canvas>` | Used only where a picture helps: the world map and route overlays. |
| Tests | **Vitest** | Same config as Vite. Also used for determinism and statistical tests. |
| Headless runner | **tsx** (Node) | Runs `npm run sim -- --seed 42 --years 50` for balancing and debugging. |
| Persistence | **IndexedDB** (via `idb`) | Saves are larger than `localStorage` allows. |
| Desktop (later) | **Tauri** | Wraps the same web build as a native app for Windows, macOS, and Linux. |

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
│   UI store (Zustand) ──► React panels                      │
│      Log · Character profile · Location view · Map · Stats │
│   Text renderer: Event ──► "Rufus enters the Dungeon …"    │
└────────────────────────────────────────────────────────────┘

           (same core, no worker)
┌──────────── Node: headless runner / tests ─────────────────┐
│   run N years at max speed → metrics, CSV, event dumps     │
└────────────────────────────────────────────────────────────┘
```

### Directory layout (target)

```
src/
  sim/                 # NO DOM, NO React. Runs in the worker, Node, and tests.
    core/              # rng, clock, scheduler, ids, event bus, world container
    model/             # types: Character, Location, Item, Monster, Event …
    systems/           # travel, combat, loot, progression, ai, social, economy …
    gen/               # world, name, monster, and item generators
    index.ts           # createWorld(seed, config), step(world, until)
  content/             # data tables: species, monsters, items, affixes, names
  host/                # worker entry + SimHost interface (Comlink)
  ui/                  # React app
    components/  panels/  store/  text/   # text/ = event → prose templates
tools/
  sim-cli.ts           # headless runner
docs/
```

The rule that `src/sim/` never imports the DOM is enforced, not just agreed on.
`src/sim/` gets its own `tsconfig` without the `DOM` lib, plus an ESLint
`no-restricted-imports` rule.

---

## 4. Simulation core

### 4.1 Randomness: seeded, forked, never `Math.random()`

`Math.random()` can't be seeded, so a world built on it can never be
reproduced. The core uses a small seedable PRNG (e.g. **sfc32** or
**xoshiro128\*\***, around 30 lines and dependency-free) behind one `Rng`
interface:

```ts
interface Rng {
  next(): number;                         // [0, 1)
  int(min: number, max: number): number;  // inclusive
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(entries: readonly [T, number][]): T;
  gaussian(mean: number, sd: number): number;
  roll(dice: string): number;             // "2d6+1"
  fork(label: string): Rng;               // independent child stream
}
```

Each subsystem uses its own **forked stream**, such as `rng.fork("combat")` or
`rng.fork("worldgen")`. Without forks, a new random call added to the loot
system would shift every later roll in the world and change everything
downstream. With forks, the change stays inside the loot stream.

The RNG state is part of the world state and is saved with it.

### 4.2 Time: a calendar plus an event scheduler

- **The base unit is the in-game minute.** World time is a single integer, and
  the calendar (minutes → hours → days → seasons → years) is derived from it
  for display, e.g. *"Y3 · Day 41 (Highsun) · 14:20"*.
- **Scheduler-driven, not tick-everyone.** Nobody gets updated every minute.
  Each actor is in a priority queue keyed by *when it next needs to decide
  something*. A character walking for 6 hours is not touched for those 6
  hours. Arriving is one event. This is the main reason hundreds or thousands
  of agents stay cheap.
- **Global processes** (markets clearing, monster populations breeding,
  seasons) are scheduled entries on the same queue, e.g. "every day at 00:00".
- **Speed control** maps real time to sim time, from paused through 1× (e.g.
  1 in-game hour per real second) to "as fast as possible". The worker runs
  the sim in time slices and yields between them so it can receive messages.

### 4.3 World state: plain data, ECS-lite

All state is **plain, serializable data**: objects, arrays, and maps keyed by
IDs. It has no classes with behavior, no getters/setters, and no object
references between entities. Entities refer to each other by **ID**
(`CharacterId`, `LocationId`, …).

The prototype `Character` class (getters, setters, `Math.random`) is replaced
by this approach because:

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
  characters: Map<CharacterId, Character>;
  locations: Map<LocationId, Location>;
  monsters: Map<MonsterId, Monster>;
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
scoring**. Every candidate action (*rest at inn*, *delve dungeon X*, *sell
loot*, *seek companion*, *visit family*, *train*) gets a score:

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

### 4.6 Memory: three layers, all bounded

1. **Episodic memory.** A short list of personal events, each with a
   *salience* score that decays over time. Strong events (near-death, a
   friend's death, a legendary kill) decay slowly and may be promoted to
   permanent *life events*, which feed the character's biography.
2. **Learned expectations.** Running statistics per (activity, place or kind),
   e.g. *"delving Gorefang Caves: 7 trips, 2 near-deaths, avg +40 gold"*. This
   is effectively a **multi-armed bandit**: characters exploit what has worked
   and explore with a probability set by their *curiosity* trait. This is what
   makes a character "learn what works for them".
3. **Opinions of others.** A sparse map `otherId → { affinity, trust,
   familiarity, lastSeen }`, updated by shared events (fought together,
   betrayed, traded fairly, rescued). It drives friendship, rivalry, parties,
   and marriage.

Every layer has a hard size cap with eviction of the least salient entries. A
character's memory stays the same size whether they are 20 or 80.

### 4.7 Content as data

Species, monster templates, item bases, affixes, loot tables, recipes, name
lists, and location archetypes are **data files** in `src/content/`, separate
from the code. Adding a monster should not need a code change. Later this
makes community content packs (mods) almost free.

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

| Scale | Target |
|---|---|
| 200 characters, 30 locations | 1 in-game year simulates in < 5 s headless |
| 1,000 characters, 100 locations | Smooth at 1×–10× speed in the browser |
| UI | 60 fps scroll/interaction regardless of sim speed |

Strategies, in the order they'll be needed: scheduler-driven updates (built in
from day one), spatial indexing by location, capped memories, event-log
compaction, and finally **simulation level-of-detail**, where calm,
uninteresting regions are resolved in coarser steps. Only optimize after the
headless profiler shows a real bottleneck.

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
