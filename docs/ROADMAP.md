# Roadmap

The full vision is a world with hundreds of autonomous characters, dozens of
towns, dungeons, and fortresses, a living economy, relationships, memory, and
generations. Building all of that at once is how this project stalled the
first time, so the plan is a sequence of **small, watchable milestones**.

**Every phase ends with something you can open and watch.** No phase is pure
plumbing with nothing to see. If a phase turns out too big, split it, and keep
the "watchable at the end" rule.

Technical decisions behind this plan are in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### Phase overview

| # | Phase | You can watch… | Size |
|---|---|---|---|
| 0 | Foundations | Tests passing and a seeded RNG (no world yet) | S |
| 1 | The Heartbeat | Characters wandering between places in a live log | M |
| 2 | Blood & Gold | Dungeon delves, battles, loot, and the first deaths | M |
| 3 | Growth | Characters leveling, learning skills, upgrading gear | M |
| 4 | Minds | Characters with personalities who learn what works for them | L |
| 5 | Bonds | Friendships, rivalries, and adventuring parties | M |
| 6 | The Observatory | Following a character; profiles, location views, stats, saves | L |
| 7 | Markets | Merchants, caravans, crafting, and prices that move | L |
| 8 | Generations | Marriage, children, retirement, inheritance, dynasties | L |
| 9 | A Living World | A generated map, monster ecology, bosses, raids, fortresses | L |
| 10 | Scale & Ship | 1,000+ characters, a desktop build, content packs | M |

Sizes are relative (S < M < L), not time estimates.

---

## Phase 0 — Foundations

**Goal:** A clean, typed project where adding simulation code is easy and safe.

- [ ] Scaffold **Vite + React + TypeScript** (`strict: true`) in this repo.
- [ ] Add ESLint and Prettier, **Vitest**, and `tsx` for scripts.
- [ ] Create the directory layout from `ARCHITECTURE.md` §3 (`src/sim`,
      `src/content`, `src/host`, `src/ui`, `tools/`).
- [ ] Enforce **"no DOM in `src/sim`"**: a separate `tsconfig` without `DOM`
      lib, plus a lint rule.
- [ ] Implement the **seeded `Rng`** (`next`, `int`, `chance`, `pick`,
      `weighted`, `gaussian`, `roll("2d6+1")`, `fork`), with tests for
      reproducibility and distribution sanity.
- [ ] Port `character_names.js` into `src/content/names.ts`.
- [ ] Retire the prototype `Character` class. Characters become plain data
      (see `ARCHITECTURE.md` §4.3). *Note: the current `getInventory` getter
      returns itself (`this.getInventory`) and would recurse infinitely, one
      more reason not to keep the getter/setter style.*
- [ ] Add a `.gitignore` (`node_modules`, `dist`, `.qodo/`) and untrack
      `.qodo/history.sqlite`.
- [ ] Add a **GitHub Actions CI** workflow: typecheck → lint → test → build.
- [ ] Add a `tools/sim-cli.ts` stub: `npm run sim -- --seed 42` prints
      "hello from seed 42" plus a few RNG rolls.

**Exit criteria:** `npm run dev` shows an empty shell, `npm test` passes, CI is
green, and the same seed prints the same rolls every time.

---

## Phase 1 — The Heartbeat

**Goal:** The world exists and time moves. Characters go places, and you see it
happen.

**Simulation**
- [ ] World clock in minutes, plus a calendar formatter (`Y1 · Day 12 · 09:00`).
- [ ] **Scheduler**: a priority queue of `(time, actorId, action)`. Actors
      are only processed when they are due.
- [ ] World container with entity tables and ID generation.
- [ ] **Event system**: typed `SimEvent`s, an in-memory store, and subscribers.
- [ ] A small hand-made world: 3 towns, 2 dungeons, 1 wilderness area, and the
      **travel routes** between them as a graph with travel times.
- [ ] Characters as plain data: name, home town, current location, and
      state (`idle | traveling | resting`).
- [ ] The simplest possible behavior: idle characters pick a random
      destination, travel there (scheduled arrival), and wait a random time.
- [ ] Spawn about 20 characters at world creation.

**UI**
- [ ] `SimHost` interface: `start / pause / setSpeed / step`. It may run on the
      main thread for now.
- [ ] Speed controls: ⏸ / 1× / 5× / 20× / max.
- [ ] **Live event log**: virtualized, auto-scrolling with a "pinned to
      bottom" toggle, timestamps in world time.
- [ ] Event → text templates with 2–3 phrasings per event type.

**Tooling**
- [ ] Headless runner can run N days and dump the log.
- [ ] **Determinism test** in CI (same seed → same event hash).

**Exit criteria:** Open the page, press play, and read *"Rufus Ironclaw sets
out from Concordale toward the Dungeon of Misery…"*, with dozens of characters
moving around and the clock ticking.

---

## Phase 2 — Blood & Gold

**Goal:** Danger, death, and reward. Gives the world a reason to move.

**Simulation**
- [ ] Character **stats**: a small, readable set (e.g. Might, Agility,
      Toughness, Wits, Spirit, Presence) plus HP, rolled at creation.
- [ ] **Monster templates** in `src/content/monsters` (species, base stats,
      level range, loot table), with RNG variance and an occasional **affix**
      ("Enraged Infernal Imp", "Ancient Warg").
- [ ] **Dungeons** with a danger level and an **encounter table**.
      Exploration happens in rooms or turns, each of which can be a fight,
      treasure, a trap, or nothing.
- [ ] **Combat resolver**: opposed rolls, damage dice, crits, and a flee check
      (based on HP% and a bravery value). It handles 1-vs-1 and small groups.
      Fights resolve in a few rounds within one scheduled action and emit
      per-round events (importance: trivial) plus a summary (normal).
- [ ] **Death** (permanent, with an obituary event), **loot** (gold + simple
      items), and **wounds** that need rest in town to heal.
- [ ] Simple rule-based behavior until Phase 4: healthy → go delve; hurt →
      return to town and rest; carrying loot → go home.
- [ ] Gold exists. Selling loot happens at a fixed vendor price for now; the
      economy comes in Phase 7.

**UI**
- [ ] Log filter by importance (hide per-round combat spam by default).
- [ ] Clicking a character name opens a **basic character card** (stats, HP,
      gold, location, kill count).

**Tooling**
- [ ] Headless report: deaths by cause, kills by species, gold earned.
- [ ] Monte Carlo balance tests for the combat resolver.

**Exit criteria:** Over a simulated month, some characters get rich, some limp
home, and some die in the Dungeon of Misery, and the log tells each story.

---

## Phase 3 — Growth

**Goal:** Characters change over time, and the survivors get stronger.

- [ ] **XP and levels** with a level curve that keeps progression slow.
- [ ] **Skills that improve with use**: swordsmanship rises by fighting with
      swords, lockpicking by opening chests. Characters drift into roles
      ("fighter", "scout", "mystic") from what they do instead of picking a
      class.
- [ ] **Equipment slots** and item effects on combat.
- [ ] **Item generation**: base type × material × rarity × affixes ("Duskblade
      of the Ember", "Rusted Iron Axe"). Named unique items are rare and get
      remembered.
- [ ] Characters equip upgrades they find. Better gear changes outcomes.
- [ ] **Population replenishment**: new adventurers arrive in towns at a rate
      tied to world conditions, so the world doesn't empty out.
- [ ] Monsters scale with dungeon depth, and deeper levels unlock as
      characters grow.
- [ ] UI: the character card shows level, skills, gear, and a short list of
      notable deeds.

**Exit criteria:** After a simulated year there is a visible spread: veterans
at level 8+ with named gear, newcomers at level 1, and a graveyard that tells
the rest.

---

## Phase 4 — Minds

**Goal:** Characters stop being dice with legs. They have personalities,
drives, and memory, and they learn from experience.

- [ ] **Personality traits** (rolled, slightly mutable): bravery, greed,
      curiosity, sociability, honor, patience. These replace the hard-coded
      rules from Phase 2.
- [ ] **Drives/needs**: health, wealth, glory, rest, companionship, purpose.
      They decay or rise over time and push behavior.
- [ ] **Utility AI** (`ARCHITECTURE.md` §4.5): score candidate actions,
      apply personality and noise, then do a weighted pick among the top
      options.
- [ ] **Memory layers** (`ARCHITECTURE.md` §4.6):
  - [ ] Episodic memory with salience decay, plus permanent *life events*.
  - [ ] Learned expectations per (activity, place), bandit-style. Characters
        come to prefer what has worked for them and avoid places that nearly
        killed them.
- [ ] A `why` field on decision events, so the UI can show *"Rufus heads to
      Gorefang Caves (likes: good loot there before; feeling brave)"*.
- [ ] UI: character profile gets **Personality**, **Current goal**, **Recent
      memories**, and **Preferences** sections.

**Exit criteria:** Two characters with different personalities behave visibly
differently in the same world, and you can read *why* a character did what it
did.

---

## Phase 5 — Bonds

**Goal:** Characters notice each other.

- [ ] **Opinions** (affinity, trust, familiarity), updated by shared events:
      fought side by side, saved my life, stole the loot, met at the inn.
- [ ] **Socializing** at inns and taverns: chance encounters between
      characters in the same place, shaped by sociability.
- [ ] **Parties**: characters with high mutual trust form adventuring groups,
      share loot (fairly, depending on honor), and split up over disputes or
      deaths.
- [ ] **Rivalries and grudges**, including revenge-seeking (rare but memorable).
- [ ] **Reputation** per town: what people in a place think of a character.
- [ ] **Mourning**: losing a close friend affects mood and decisions.
- [ ] UI: a **Relationships** tab (friends, rivals, party) and party events in
      the log.

**Exit criteria:** You can see a party form, survive a dungeon together, lose a
member, and watch a survivor change afterward.

---

## Phase 6 — The Observatory

**Goal:** Turn the log viewer into a real god-game observatory. Also the
technical hardening phase.

**Observation tools**
- [ ] **Follow mode**: pin a character and the log filters to them, with
      their card always visible.
- [ ] **Character profile page**: biography generated from life events,
      stats over time, gear, relationships, memories, and an "on this day" timeline.
- [ ] **Location view**: who is here now, recent events here, dangers, and
      (later) the market.
- [ ] **Search and filters**: by character, location, event type, and
      importance.
- [ ] **Chronicle**: a curated history of notable and legendary events, by year.
- [ ] **World statistics dashboard**: population, deaths by cause, level
      distribution, and total gold, charted over time.
- [ ] **Hall of Heroes / Graveyard**: the greatest living, the honored dead.

**Hardening**
- [ ] Move the simulation into a **Web Worker** (Comlink), with throttled
      snapshots and on-demand `query()`.
- [ ] **Save / load** to IndexedDB, plus export and import of save files.
- [ ] "New world from seed" dialog. Seeds are shareable.
- [ ] Event-log compaction (old trivial events expire; notable and higher are
      kept).

**Exit criteria:** You can leave a world running, come back, save it, reload it
tomorrow, pick an interesting character, and read their life story.

---

## Phase 7 — Markets

**Goal:** A real economy. Nobody sets prices: they come from supply, demand,
and individual price beliefs.

- [ ] **Goods**: raw materials (ore, hides, herbs, monster parts), crafted
      items, and consumables (food, potions).
- [ ] **Market per town** run as a bid/ask clearinghouse. Agents hold *private
      price beliefs* that adjust after each successful or failed trade
      (Doran & Parberry model).
- [ ] **Producers and crafters**: smiths, alchemists, and tanners. Crafting
      recipes use materials and skill, and quality depends on skill rolls.
      Adventurers become suppliers of monster parts and ore.
- [ ] **Merchants and caravans**: trader characters who buy low in one town,
      haul goods along routes (where bandits and monsters raid them), and sell
      high in another. **Arbitrage** is what ties town prices together.
- [ ] **Random shocks**: a failed harvest, a collapsed mine, a monster
      blockade on a route, a rich new vein. Prices react.
- [ ] **Money supply accounting**: every gold source (loot) and sink (food,
      repairs, lodging, lost on death) is tracked, so the headless report can
      catch runaway inflation or deflation.
- [ ] UI: market panel per location (prices, order book, history chart),
      price index over time, caravan tracker.

**Exit criteria:** A monster blockade on the iron route makes swords more
expensive in the town at the far end, and a merchant takes the risk and makes
money from it.

---

## Phase 8 — Generations

**Goal:** Lives have a beginning, middle, and end, and the world continues past
any single character.

- [ ] **Aging**: stats change with age, and characters die of old age.
- [ ] **Retirement**: older or wealthy or wounded or traumatized adventurers
      settle down and take a town job (innkeeper, smith, trainer, merchant).
      Their memories and relationships stay.
- [ ] **Courtship and marriage** from high mutual affinity and compatible
      traits.
- [ ] **Children**: inherited traits (blend + mutation), family names, raised
      in town, and coming of age as new adventurers who may take up a parent's
      weapon or grudge.
- [ ] **Inheritance**: gold, items, and houses pass to heirs.
- [ ] **Dynasties and legends**: family trees, famous lineages, and dead heroes
      who become legends that others mention.
- [ ] UI: family tree view, and a lineage section in profiles.

**Exit criteria:** A 100-year headless run produces three or more generations,
with a stable population and family sagas visible in the chronicle.

---

## Phase 9 — A Living World

**Goal:** Replace the hand-made world with a generated one that changes over
time.

- [ ] **Procedural world generation** from seed: regions and biomes, dozens of
      towns, dungeons, ruins, fortresses, and the route network, with
      generated names that fit each region.
- [ ] **Monster ecology**: dungeon populations breed, migrate, and spill over
      when overpopulated. Clearing a dungeon has lasting but temporary effects.
- [ ] **Bosses**: unique, named, persistent monsters with lairs. They can
      *level up from the adventurers they kill* and become remembered threats.
- [ ] **Raids**: monster incursions into weak towns, and town defense by the
      characters present.
- [ ] **Fortresses and lords** (first pass): territory, taxes or protection,
      and garrisons that patrol routes.
- [ ] **Seasons and weather** affecting travel, harvests, and monster activity.
- [ ] **World map view** (PixiJS canvas): locations, routes, caravans, and the
      followed character, with click-through to the DOM panels.

**Exit criteria:** A brand-new seed produces a different, coherent world. A
boss grows infamous over decades until a party finally brings it down, and the
chronicle records it.

---

## Phase 10 — Scale & Ship

- [ ] Profile with the headless runner and hit the targets in
      `ARCHITECTURE.md` §8 (1,000+ characters).
- [ ] Simulation level-of-detail for quiet regions, if profiling shows it's
      needed.
- [ ] **Tauri desktop build** (Windows, macOS, Linux) from the same codebase.
- [ ] **Content packs**: load extra monsters, items, and names from JSON.
- [ ] Settings: world size, danger, magic level, and population caps at world
      creation.
- [ ] A final project name, an icon, and a hosted web build.

---

## Beyond (ideas parking lot)

Not planned or committed. Ideas stay here until they earn a phase.

- Factions, guilds, and wars between fortresses.
- Religion, cults, and divine events.
- Magic research and artifacts that change the world.
- Rumors and information spread: characters act on what they've *heard*, which
  may be wrong.
- Optional narrated summaries ("The Saga of Rufus") generated from the
  chronicle, possibly with an LLM. Always optional; the sim stays fully
  offline and deterministic.
- Gentle observer "nudges" (a plague, a meteor, a dragon's awakening) as a
  sandbox mode, kept separate from pure observation.

---

## How we work

- **One phase at a time**, broken into small PRs. Each PR leaves `main`
  runnable.
- Check off items here as they land, and edit the plan when reality disagrees
  with it.
- New systems get a headless metric and at least one test before their UI.
- If a system makes the world collapse (everyone dies, infinite gold), that's a
  bug in the rules, found with the headless runner and fixed there.

## Open questions

These don't block Phase 0–1 but need decisions eventually:

1. **Name.** Keep *Ironside Dawn* or rename once the world has a personality?
2. **Visual identity.** Clean modern dark UI, or a stylized "old manuscript /
   terminal" look?
3. **Tone and setting.** High fantasy (common magic, many species) or
   low/grim fantasy (rare magic, mostly humans and beasts)? This affects the
   content tables a lot.
4. **Time scale.** At 1×, is one real second one in-game hour? Do people want to
   watch a single dungeon delve play out, or decades go by?
5. **Species.** Are playable-type species (elves, dwarves, …) part of the
   adventurer population, or are adventurers human with other species as
   NPCs?
