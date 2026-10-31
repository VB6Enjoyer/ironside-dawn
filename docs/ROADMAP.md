# Roadmap

The full vision is a world with hundreds of autonomous characters from many
peoples, dozens of towns, dungeons, and fortresses, costly magic, a living
economy, relationships, memory, generations, and eventually regions shaped by
real-world mythologies. Building all of that at once is how this project
stalled the first time, so the plan is a sequence of **small, watchable
milestones**.

**Every phase ends with something you can open and watch.** No phase is pure
plumbing with nothing to see. If a phase turns out too big, split it, and keep
the "watchable at the end" rule.

- Technical decisions: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Setting, peoples, magic, languages, and cultures: [`WORLD.md`](WORLD.md)

### Phase overview

| #   | Phase            | You can watch…                                                         | Size |
| --- | ---------------- | ---------------------------------------------------------------------- | ---- |
| 0   | Foundations      | Tests passing and a seeded RNG (no world yet)                          | S    |
| 1   | The Heartbeat    | Characters traveling between places in a live log, at several speeds   | M    |
| 2   | Blood & Gold     | Dungeon delves, battles with creatures, loot, and the first deaths     | M    |
| 3   | Growth & Sorcery | Leveling, skills, better gear, and costly first spells                 | L    |
| 4   | Minds            | Characters with personalities and morals who learn what works for them | L    |
| 5   | Kin & Bad Blood  | Friendships, parties, language barriers, outlaws, and bounties         | L    |
| 6   | The Observatory  | Following a character; profiles, stats, fast-forwarding decades, saves | L    |
| 7   | Markets          | Merchants, caravans, crafting, and prices that move                    | L    |
| 8   | Generations      | Marriage, children, retirement, inheritance, dynasties                 | L    |
| 9   | A Living World   | A generated map of peoples' homelands, demon and undead powers, bosses | L    |
| 10  | Cultures & Myths | Mythology-inspired regions with their own arms, creatures, and magic   | L    |
| 11  | Scale & Ship     | 1,000+ characters, a desktop build, content packs                      | M    |

Sizes are relative (S < M < L), not time estimates.

---

## Phase 0 — Foundations

**Goal:** A clean, typed project where adding simulation code is easy and safe.

- [x] Delete the old prototype (`index.html`, `style.css`, `src/`, `.qodo/`)
      and start from a fresh scaffold.
- [x] Scaffold **Vite + React + TypeScript** (`strict: true`).
- [x] Add ESLint and Prettier, **Vitest**, and `tsx` for scripts.
- [x] Create the directory layout from `ARCHITECTURE.md` §3 (`src/sim`,
      `src/content`, `src/host`, `src/ui`, `tools/`).
- [x] Enforce **"no DOM in `src/sim`"**: a separate `tsconfig` without `DOM`
      lib, plus a lint rule.
- [x] Implement the **seeded `Rng`** (`next`, `int`, `chance`, `pick`,
      `weighted`, `gaussian`, `roll("2d6+1")`, `fork`), with tests for
      reproducibility and distribution sanity.
- [x] Add a `.gitignore` (`node_modules`, `dist`, `.qodo/`).
- [x] Add a **GitHub Actions CI** workflow: typecheck → lint → test → build.
- [x] Add a `tools/sim-cli.ts` stub: `npm run sim -- --seed 42` prints a few
      RNG rolls.

**Exit criteria:** `npm run dev` shows an empty shell, `npm test` passes, CI is
green, and the same seed prints the same rolls every time.

**Status: done.** TypeScript is pinned to 6.0.x until typescript-eslint
supports 7.x.

---

## Phase 1 — The Heartbeat

**Goal:** The world exists and time moves at whatever speed you choose.
Characters go places, and you see it happen.

**Simulation**

- [x] World clock in **seconds**, plus a calendar formatter
      (`Y1 · Day 12 · 09:00:00`).
- [x] **Scheduler**: a priority queue of `(time, actorId, action)`. Actors
      are only processed when they are due (`ARCHITECTURE.md` §4.2).
- [x] World container with entity tables and ID generation.
- [x] **Event system**: typed `SimEvent`s with importance levels, an in-memory
      store, and subscribers.
- [x] Content plumbing with **culture tags**. Ship one generic medieval
      culture: its name generator, location names, and so on.
- [x] A small hand-made world: 3 towns, 2 dungeons, 1 wilderness area, and the
      **travel routes** between them as a graph with travel times.
- [x] Characters as plain data: name, `species` (humans only for now),
      `culture`, home town, current location, and state
      (`idle | traveling | resting`).
- [x] The simplest possible behavior: idle characters pick a random
      destination, travel there (scheduled arrival), and wait a random time.
- [x] Spawn about 20 characters at world creation.

**UI**

- [x] `SimHost` interface: `start / pause / setSpeed / step`. It may run on the
      main thread for now.
- [x] **Speed tiers**: ⏸ · Real-time · Minute · Hour · Day · Max, with a
      default log importance floor per tier (`ARCHITECTURE.md` §4.2).
- [x] **Live event log**: virtualized, auto-scrolling with a "pinned to
      bottom" toggle, timestamps in world time.
- [x] Event → text templates with 2–3 phrasings per event type.

**Tooling**

- [x] Headless runner can run N days and dump the log.
- [x] **Determinism test** in CI: same seed → same event hash, _including
      across different speed tiers_ (the golden rule).

**Exit criteria:** Open the page, press play, and read _"Rufus sets out from
Concordale toward the Dungeon of Misery…"_. Switch from Real-time to Day and
watch weeks go by without the page stuttering.

**Status: done.** Notes from building it:

- Characters also have a `pastime` state (tavern, market, foraging…) between
  journeys, and sleep at night: nobody sets out between 21:00 and 06:00.
- A year is four 90-day seasons: Thaw, Highsun, Harvest and Deepwinter. Season
  changes are the only notable events so far, so the log is sparse at Day and
  Max speeds unless the Detail setting is lowered.
- Real-time and Minute show everything by default (not just normal and up):
  at those speeds trivial events are what make the world feel alive.
- The world seed is in the page URL (`?seed=42`), so a world can be shared.
- Headless, 500 characters run 10 in-game years in about 12 seconds.

---

## Phase 2 — Blood & Gold

**Goal:** Danger, death, and reward. Gives the world a reason to move.

**Peoples and creatures**

- [x] Species as data (`WORLD.md` §2): stat modifiers, lifespan, and baseline
      attitudes. Add **elves** and **dwarves** as characters alongside humans.
- [x] **Creature templates** in `src/content/creatures` (species, base stats,
      level range, loot table, instincts), with RNG variance and an occasional
      **affix** ("Enraged Infernal Imp", "Ancient Warg").
- [x] First hostile things: beasts, **lesser undead** (skeletons, zombies),
      and **lesser demons** (imps, hounds), all as creatures.
- [x] **Statistical populations**: a dungeon holds _counts_ ("skeletons ≈ 30"),
      and encounters draw individuals from them. Killing creatures lowers the
      count, and the count recovers slowly (`ARCHITECTURE.md` §4.2).

**Combat and the body**

- [x] Character **stats**: a small, readable set (e.g. Might, Agility,
      Toughness, Wits, Spirit, Presence), plus **HP** and **Stamina**.
- [x] **Status effects** framework (timed modifiers): wounded, exhausted,
      dizzy, drained. Combat uses it now; magic reuses it in Phase 3.
- [x] **Dungeons** with a danger level and an **encounter table**.
      Exploration happens in rooms or turns, each of which can be a fight,
      treasure, a trap, or nothing.
- [x] **Combat resolver**: opposed rolls, damage dice, crits, stamina use, and a
      flee check (based on HP%, stamina, and a bravery value). It handles
      1-vs-1 and small groups. Each round is its own scheduled job, a few
      in-game seconds apart, so blows land in real time. _Silent detail
      (emitting blow-by-blow events only when watched) moved to Phase 6,
      together with follow mode; for now every blow is a trivial event._
- [x] **Death** (permanent, with an obituary event), **loot** (gold + simple
      items), and **wounds** that need rest in town to heal.
- [x] Simple rule-based behavior until Phase 4: healthy → go delve; hurt →
      return to town and rest; carrying loot → go home.
- [x] Gold exists. Selling loot happens at a fixed vendor price for now; the
      economy comes in Phase 7.

**UI and tooling**

- [x] Log filter by importance.
- [x] Clicking a character name opens a **basic character card** (species,
      stats, HP and stamina, statuses, gold, location, kill count).
- [x] Headless report: deaths by cause, kills by species, gold earned.
- [x] Monte Carlo balance tests for the combat resolver.

**Exit criteria:** Over a simulated month, some characters get rich, some limp
home, and some die to skeletons in the Dungeon of Misery. At Real-time speed,
you can watch a single fight blow by blow.

**Status: done.** Notes from building it:

- **Balance** comes from a Monte Carlo test of the combat core: an average
  adventurer against each creature's usual group. Adventurers wear armor and
  are trained (defense 14, +4 to hit, about 28 HP), so commons kill them about
  1% of the time, wargs 3–5%, and cave bears and hellhounds about 8%.
  Headless, a world loses about three adventurers a month.
- **Flee and avoid**: braver characters hold on longer before fleeing, the
  outnumbered flee sooner, and a delver who spots something frightening (a
  cave bear, two wargs) may try to slip away unseen. A failed attempt starts
  the fight.
- **Days at home**: after selling loot or convalescing, adventurers spend 2–6
  days in town before their next trip. Without this they delved almost daily
  and died far too often.
- **Newcomers** (pulled forward from Phase 3, minimal): while fewer than 20
  adventurers are alive, there's a daily 50% chance that one arrives in a
  town. This keeps a long-running world from emptying.
- Brindlemoor is part dwarven, Saltmere part elven. Each people has its own
  naming culture (generic, sylvan, deephold).
- `npm run sim -- --quiet` prints a world report: deaths by cause, kills by
  species, the richest adventurers, and dungeon populations.

---

## Phase 3 — Growth & Sorcery

**Goal:** Characters change over time, and a few of them touch magic and pay
for it.

**Growth**

- [x] **XP and levels** with a level curve that keeps progression slow.
- [x] **Skills that improve with use**: swordsmanship rises by fighting with
      swords, lockpicking by opening chests. Characters drift into roles
      ("fighter", "scout", "mystic") from what they do instead of picking a
      class.
- [x] **Equipment slots** and item effects on combat.
- [x] **Item generation**: base type × material × rarity × affixes ("Duskblade
      of the Ember", "Rusted Iron Axe"), all culture-tagged. Named unique items
      are rare and get remembered.
- [x] Characters equip upgrades they find. Better gear changes outcomes.
- [x] **Population replenishment**: new adventurers come out of towns'
      statistical populations at a rate tied to world conditions. (A
      minimal version, newcomers arriving while the population is below
      target, landed in Phase 2.)
- [x] Creatures scale with dungeon depth, and deeper levels unlock as
      characters grow.

**Sorcery, first pass** (`WORLD.md` §4)

- [x] **Arcana** skill: learned slowly by study (only in certain towns, from
      mentors or tomes), or boosted by **the gift** (rare, rolled at creation,
      rate by species).
- [x] **Spells as data**: effect, difficulty, and a **cost profile** (stamina,
      health, stat drain, dizziness). Cost scales with power and goes down with
      mastery.
- [x] **Casting roll** with four outcomes: success / partial / failure /
      backlash. Casting while dizzy or drained raises backlash odds.
- [x] 4 starter spells: Ember Bolt, Mend Flesh, Quickening, Ward of Ash.
- [x] A simple "cast if the odds are good" rule until the utility AI arrives.
- [x] Headless metrics: casts, backlashes, and deaths by self-inflicted magic.

**UI**

- [x] Character card shows level, skills, gear, known spells, and a short list
      of notable deeds.

**Exit criteria:** After a simulated year there is a visible spread: veterans
at level 8+ with named gear, newcomers at level 1, a handful of mages whose
spells sometimes win a fight and sometimes leave them dizzy and bleeding, and a
graveyard that tells the rest.

**Status: done.** Notes from building it:

- **Levels**: experience comes from kills (8 × creature level, half again for
  an affix), treasure, avoided traps and chambers explored. Level `n` needs
  `50·n·(n−1)` XP in total (level 8 at 2,800). Each level adds 3 HP; every
  third adds +1 to hit, every fourth +1 defense. After a year, survivors
  range from level 1 to about 9.
- **Skills** (blades, axes, blunt, polearms, stealth, lockpicking, awareness,
  arcana) grow with use, more slowly the higher they are, faster with good
  wits. Every 10 points is +1 to the rolls they help. Ranks (apprentice 20,
  journeyman 40, expert 60, master 80) are announced. A year's survivors reach
  expert with their weapon. The best skill decides the role.
- **Gear**: weapon, armor and trinket slots. Items combine a base, a material
  (only metal armor takes one), a rarity (common, fine, rare, legendary) and
  up to two affixes. Deeper chambers give rarer finds. Adventurers wear what
  scores better and sell the rest.
- **Legendary items** are rare (one or two a year per world) and tracked in
  `world.legends`. They are never sold. When their owner dies, they stay in
  that dungeon until a later delver finds them: _"finds Duskblade in the
  Dungeon of Misery, where Rufus Ironclaw fell."_
- **Depth**: deeper chambers bring more affixed creatures, bigger groups and
  more gold. Delvers grow uneasy past chamber 3 + their level.
- **Locked chests**: half of all chests are locked. Picking the lock trains
  lockpicking; forcing it spoils half the gold and any item.
- **Magic**: the gifted (5% of humans, 18% of elves, 3% of dwarves) start
  with arcana and a spell or two. Others can study at the academies of
  Concordale and Saltmere, but only the clever or spiritual bother, and
  slowly. A world has a few casters at any time. Casting replaces a swing
  for that round; costs shrink with mastery; backlashes double the cost and
  burn, and can kill.
- **Population**: towns hold commoner counts by people (Concordale 1,200
  humans; Brindlemoor 500 humans and 350 dwarves; Saltmere 600 humans and 400
  elves). Adventurers are drawn from them, and towns grow slowly. Newcomers
  arrive faster the further the world is below 20 adventurers.
- Headless, a world loses 11–28 adventurers a year, fewer than in Phase 2
  because survivors now grow stronger. 500 characters still run 10 years in
  about 75 seconds.

---

## Phase 4 — Minds

**Goal:** Characters stop being dice with legs. They have personalities,
morals, drives, and memory, and they learn from experience.

- [x] **Personality traits** (rolled, slightly mutable): bravery, greed,
      curiosity, sociability, patience, plus **morality traits**
      (compassion ↔ cruelty, honor ↔ treachery). Species shift the
      distributions they are rolled from (`WORLD.md` §3).
- [x] **Drives/needs**: health, wealth, glory, rest, companionship, purpose.
      They decay or rise over time and push behavior.
- [x] **Utility AI** (`ARCHITECTURE.md` §4.5): score candidate actions,
      apply personality and noise, then do a weighted pick among the top
      options. It replaces the Phase 2 and 3 rules, including when to cast a
      spell given its risk.
- [x] **Memory layers** (`ARCHITECTURE.md` §4.6):
  - [x] Episodic memory with salience decay, plus permanent _life events_.
  - [x] Learned expectations per (activity, place), bandit-style. Characters
        come to prefer what has worked for them and avoid places that nearly
        killed them.
- [x] A `why` field on decision events, so the UI can show _"Rufus heads to
      Gorefang Caves (likes: good loot there before; feeling brave)"_.
- [x] UI: character profile gets **Personality**, **Current goal**, **Recent
      memories**, and **Preferences** sections.

**Exit criteria:** Two characters with different personalities behave visibly
differently in the same world, and you can read _why_ a character did what it
did.

**Status: done.** Notes from building it:

- **Traits**: seven traits from 0 to 1, rolled per species (elves patient,
  curious and a little aloof; dwarves honorable, greedy and bold). Bravery
  drifts with experience: −0.03 after a near-death, −0.01 after fleeing,
  +0.01 after besting something fearsome. Compassion and honor are rolled and
  shown but only start to matter with outlaws in Phase 5.
- **Drives**: glory, companionship and purpose (restlessness) build up daily at
  rates set by traits, and deeds, taverns and delves satisfy them. Health and
  wealth are read from hit points, stamina and gold. "Rest" is covered by
  health and sleep. Purpose replaced Phase 2's fixed 2–6 days at home.
- **Utility AI** replaces the Phase 2 and 3 rules for everything but sleep,
  including spell choice. Tuning took several rounds, because a sum of small
  drives sent everyone delving daily. Restlessness is now nonlinear and gates a
  dungeon's whole appeal.
- **Personality shows** (the CLI report measures it, lowest third against
  highest third): the bold delve about 7.5 times a month against 5 for the
  timid, the impatient 7 against 5 for the patient, and the gregarious visit
  taverns about 31 times a month against 21 for the solitary. The bold also
  die somewhat more often.
- **Training** in town only raises a weapon skill to 45; beyond that, only real
  fights teach. **Study** is only for the gifted or the unusually clever or
  spiritual. A world has a few casters, mostly gifted.
- **Performance**: decisions now weigh every destination, so the simulation is
  about 3× slower than in Phase 3. 500 characters run 10 years in about
  3.5 minutes, inside the 5-minute target. Paths are cached.

---

## Phase 5 — Kin & Bad Blood

**Goal:** Characters notice each other, prefer their own kind, struggle to
talk to strangers, and sometimes turn to crime.

**Bonds**

- [ ] **Opinions** (affinity, trust, familiarity), updated by shared events:
      fought side by side, saved my life, stole the loot, met at the inn.
- [ ] **Socializing** at inns and taverns, shaped by sociability and a
      **same-species preference** (`WORLD.md` §5).
- [ ] **Parties**: characters with high mutual trust form adventuring groups,
      share loot (fairly, depending on honor), and split up over disputes or
      deaths.
- [ ] **Rivalries and grudges**, including revenge-seeking.
- [ ] **Mourning**: losing a close friend affects mood and decisions.

**Languages** (`WORLD.md` §5)

- [ ] One native language per people. **Language proficiency as a skill**,
      learned through exposure and teaching.
- [ ] Shared language gates **parley** (talking down a fight, surrender,
      bribes), speeds up friendship, and carries rumors and warnings.
- [ ] Computed **hostility** (`ARCHITECTURE.md` §4.8): species attitude +
      morality + relationship + language.

**Outlaws** (`WORLD.md` §3)

- [ ] Circumstances + low honor/compassion → **banditry, theft, murder**.
      Outlaws ambush travelers and can form gangs.
- [ ] **Reputation** per town, **bounties** for crimes, and bounty hunters. Some
      outlaws reform.

**UI**

- [ ] A **Relationships** tab (friends, rivals, party), languages known, a
      crimes and bounties section, and party events in the log.

**Exit criteria:** You can see a dwarven party form, survive a dungeon, lose
a member, and fall apart. A broke human adventurer turns bandit, robs a
caravan of elves who couldn't parley with him, and has a bounty on his head by
season's end.

---

## Phase 6 — The Observatory

**Goal:** Turn the log viewer into a real god-game observatory, make time
compression work fully, and harden the technical base.

**Observation tools**

- [ ] **Follow mode**: pin a character and the log filters to them, with
      their card always visible.
- [ ] **Silent detail** (moved from Phase 2): blow-by-blow and chamber-by-
      chamber events are only emitted for followed characters and watched
      places, without changing event IDs or history (`ARCHITECTURE.md` §4.2).
- [ ] **Character profile page**: biography generated from life events,
      stats over time, gear, spells, relationships, memories, and a timeline.
- [ ] **Location view**: who is here now, populations, recent events, and
      dangers.
- [ ] **Search and filters**: by character, location, species, event type, and
      importance.
- [ ] **Chronicle**: a curated history of notable and legendary events, by year.
- [ ] **World statistics dashboard**: population by species, deaths by cause,
      level distribution, total gold, and crime, charted over time.
- [ ] **Hall of Heroes / Graveyard / Most Wanted**.

**Time compression** (`ARCHITECTURE.md` §4.2)

- [ ] **Season** tier and **Fast-forward** ("skip N years") with a progress
      bar, pause and cancel, and a **digest** of what happened while skipping.
- [ ] **Display throttling** with digest lines ("…and 3,412 minor happenings").
- [ ] **Playback buffer** so Real-time and Minute tiers read smoothly.

**Hardening**

- [ ] Move the simulation into a **Web Worker** (Comlink), with throttled
      snapshots and on-demand `query()`.
- [ ] **Save / load** to IndexedDB, plus export and import of save files.
- [ ] "New world from seed" dialog. Seeds are shareable.
- [ ] Event retention by importance (old trivial events expire; notable and
      higher are kept).
- [ ] Hit the fast-forward performance target in `ARCHITECTURE.md` §8 with the
      current population.

**Exit criteria:** Watch one duel in real time, then skip ten years in a few
minutes. Read the digest, save, reload tomorrow, pick an interesting survivor,
and read their life story.

---

## Phase 7 — Markets

**Goal:** A real economy. Nobody sets prices: they come from supply, demand,
and individual price beliefs.

- [ ] **Goods**: raw materials (ore, hides, herbs, creature parts), crafted
      items, consumables (food, potions), and **reagents** for magic.
- [ ] **Market per town** run as a bid/ask clearinghouse. Agents hold _private
      price beliefs_ that adjust after each successful or failed trade
      (Doran & Parberry model).
- [ ] **Town demand from statistical populations**: townsfolk eat, wear out
      tools, and buy goods in aggregate.
- [ ] **Producers and crafters**: smiths, alchemists, and tanners. Crafting
      recipes use materials and skill, and quality depends on skill rolls.
      Adventurers become suppliers of creature parts and ore.
- [ ] **Merchants and caravans**: trader characters who buy low in one town,
      haul goods along routes (where bandits and creatures raid them), and sell
      high in another. **Arbitrage** is what ties town prices together.
- [ ] **Language in trade**: no shared tongue means fewer deals and worse
      prices, which gives merchants a reason to learn languages (and
      possibly leads to a trade pidgin).
- [ ] **Random shocks**: a failed harvest, a collapsed mine, a creature
      blockade on a route, a rich new vein. Prices react.
- [ ] **Money supply accounting**: every gold source (loot) and sink (food,
      repairs, lodging, lost on death) is tracked, so the headless report can
      catch runaway inflation or deflation.
- [ ] UI: market panel per location (prices, order book, history chart),
      price index over time, caravan tracker.

**Exit criteria:** A bandit gang on the iron route makes swords more expensive
in the town at the far end, and a multilingual merchant takes the risk and
makes money from it.

---

## Phase 8 — Generations

**Goal:** Lives have a beginning, middle, and end, and the world continues past
any single character.

- [ ] **Aging** per species lifespan: stats change with age, and characters die
      of old age. Undead don't age.
- [ ] **Retirement**: older or wealthy or wounded or traumatized adventurers
      settle down and take a town job (innkeeper, smith, trainer, merchant).
      Their memories and relationships stay.
- [ ] **Courtship and marriage** from high mutual affinity and compatible
      traits, mostly within a species.
- [ ] **Children**: inherited traits (blend + mutation), the gift sometimes
      runs in families, and family names. Children grow up in town and come of
      age as new adventurers who may take up a parent's weapon or grudge.
- [ ] **Promotion** from statistical populations: notable commoners become named
      characters when events single them out.
- [ ] **Inheritance**: gold, items, and houses pass to heirs.
- [ ] **Dynasties and legends**: family trees, famous lineages, and dead heroes
      who become legends that others mention.
- [ ] UI: family tree view, and a lineage section in profiles.

**Exit criteria:** A 100-year headless run produces three or more generations,
with a stable population for each people and family sagas visible in the
chronicle.

---

## Phase 9 — A Living World

**Goal:** Replace the hand-made world with a generated one that changes over
time.

- [ ] **Procedural world generation** from seed: regions and biomes, **peoples'
      homelands** (forests for elves, mountains for dwarves, steppes for
      centaurs…), dozens of towns, dungeons, ruins, and fortresses, a few rare
      mixed border towns, and the route network.
- [ ] **Centaurs** join as a people. **Sapient demons and undead** (demon
      warlords, liches, revenants) arrive as characters who command creature
      hordes and cults.
- [ ] **Creature ecology**: dungeon populations breed, migrate, and spill over
      when overpopulated. Clearing a dungeon has lasting but temporary effects.
- [ ] **Bosses**: unique, named, persistent beings with lairs. They can _level
      up from the adventurers they kill_ and become remembered threats.
- [ ] **Raids and incursions**: creature and demon attacks on weak towns, and
      town defense by the characters present.
- [ ] **Fortresses and lords** (first pass): territory, taxes or protection,
      and garrisons that patrol routes.
- [ ] **Seasons and weather** affecting travel, harvests, and creature activity.
- [ ] **World map view** (PixiJS canvas): locations, routes, caravans, and the
      followed character, with click-through to the DOM panels.

**Exit criteria:** A brand-new seed produces a different, coherent world. A
lich grows infamous over decades until a party finally brings it down, and
the chronicle records it.

---

## Phase 10 — Cultures & Myths

**Goal:** The world's regions take on identities drawn from real-world
civilizations and their mythologies (`WORLD.md` §6). The culture-tag plumbing
has been there since Phase 1, so this phase is mostly content work.

- [ ] **Culture pack format**: name generators, arms and armor tables, bestiary
      (region-native creatures and peoples), magic tradition (spells and cost
      flavors), myths and deities, and settlement vocabulary.
- [ ] World generation assigns cultures to regions. A species can have local
      variants per culture (Norse _dvergar_ and _álfar_).
- [ ] **First culture pack**, likely **Japonic**: katana, naginata, yumi;
      kitsune, kappa, oni, tengu, yūrei; talisman and ward magic.
- [ ] Then more packs, one at a time (Norse, Hellenic, Slavic,
      Mesopotamian…), each playtested with the headless runner for balance.
- [ ] **Myths in the simulation**: characters hold beliefs from their culture.
      Local legends grow out of real chronicle events ("the oni of the
      northern pass" is a real boss that killed real people).
- [ ] UI: region panel with its culture, myths, and notable figures.

**Exit criteria:** Two regions feel distinct at a glance in the log: a ronin
with a katana fighting a kappa at a river ford in one, and a Norse-flavored
dwarf facing a draugr in a barrow in the other.

---

## Phase 11 — Scale & Ship

- [ ] Profile with the headless runner and hit the targets in
      `ARCHITECTURE.md` §8 (1,000+ characters).
- [ ] World-based level of detail for quiet regions, if profiling shows it's
      needed (never observer-based).
- [ ] **Tauri desktop build** (Windows, macOS, Linux) from the same codebase.
- [ ] **Content packs**: load extra creatures, items, cultures, and names from
      JSON.
- [ ] Settings: world size, danger, magic rarity, peoples included, and
      population caps at world creation.
- [ ] A final project name, an icon, and a hosted web build.

---

## Beyond (ideas parking lot)

Not planned or committed. Ideas stay here until they earn a phase.

- Factions, guilds, kingdoms, and wars between peoples.
- Religion and cults, possibly with real divine intervention (see
  `WORLD.md` §7).
- Magic research, forbidden arts, and artifacts that change the world.
- Rumors and misinformation: characters act on what they've _heard_, which
  may be wrong.
- More peoples: orcs, goblins, halflings, giants, merfolk.
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

Project-level (world questions are in `WORLD.md` §7):

1. **Name.** Keep _Ironside Dawn_ or rename once the world has a personality?
2. **Visual identity.** Clean modern dark UI, or a stylized "old manuscript /
   terminal" look?
