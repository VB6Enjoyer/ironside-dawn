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

- [x] **Opinions** (affinity, trust, familiarity), updated by shared events:
      fought side by side, saved my life, stole the loot, met at the inn.
- [x] **Socializing** at inns and taverns, shaped by sociability and a
      **same-species preference** (`WORLD.md` §5).
- [x] **Parties**: characters with high mutual trust form adventuring groups,
      share loot (fairly, depending on honor), and split up over disputes or
      deaths.
- [x] **Rivalries and grudges**, including revenge-seeking.
- [x] **Mourning**: losing a close friend affects mood and decisions.

**Languages** (`WORLD.md` §5)

- [x] One native language per people. **Language proficiency as a skill**,
      learned through exposure and teaching.
- [x] Shared language gates **parley** (talking down a fight, surrender,
      bribes), speeds up friendship, and carries rumors and warnings.
- [x] Computed **hostility** (`ARCHITECTURE.md` §4.8): species attitude +
      morality + relationship + language.

**Outlaws** (`WORLD.md` §3)

- [x] Circumstances + low honor/compassion → **banditry, theft, murder**.
      Outlaws ambush travelers and can form gangs.
- [x] **Reputation** per town, **bounties** for crimes, and bounty hunters. Some
      outlaws reform.

**UI**

- [x] A **Relationships** tab (friends, rivals, party), languages known, a
      crimes and bounties section, and party events in the log.

**Exit criteria:** You can see a dwarven party form, survive a dungeon, lose
a member, and fall apart. A broke human adventurer turns bandit, robs a
caravan of elves who couldn't parley with him, and has a bounty on his head by
season's end.

**Status: done.** Notes from building it:

- **Opinions** are sparse per character (affinity, trust, familiarity, last
  seen), capped at 30 with the faintest forgotten. Meeting at a tavern,
  fighting side by side, a fair or unfair split of the spoils, robbery and
  murder all move them. Strong mutual affinity and familiarity make
  **friends**; deep dislike makes **rivals**. Quarrels are likelier between
  the uncompassionate and between rivals.
- **Socializing** happens at taverns: whom you meet is weighted toward your
  own species, people you know and friends, and away from rivals and known
  outlaws. Warmth comes from species attitude and moral compatibility, scaled
  by how well the two can talk.
- **Parties** form between friends who trust each other (up to 4). The leader
  decides for the members who are in town, fit and loyal; they travel, delve
  and fight together, and the spoils are split by the leader's honor. Parties
  break up over quarrels, a member turning outlaw, or deaths. Party wake-ups
  use tokens, so a member whose plans are cut short (joining a party, an
  ambush) ignores the stale wake-up left in the queue.
- **Mourning and grudges**: a friend's death leaves a long grief memory and
  a black mark against the killer, which can send the bereaved on a revenge
  hunt, even when they'd otherwise be too content to go.
- **Languages**: common, sylvan and deeptongue. Each person speaks their own
  and picks up the others from the town they live in (a little a day, by the
  town's mix of peoples) and faster from friends. Conversational at 30, fluent
  at 70. Communication scales how fast friendships grow, whether rumors and
  warnings about dangerous dungeons pass, and whether an outlaw's demand is
  understood.
- **Hostility** is computed, not assigned: species attitude, the two
  characters' compassion, their opinion of each other, and whether they share
  a tongue.
- **Outlaws**: the broke, greedy and dishonorable may turn. They lurk in the
  wilderness and size up passing travelers. If the odds look good they
  demand gold: travelers who understand and are timid or outmatched pay;
  those who refuse, or who can't understand the demand, fight. Robbery and
  murder raise a bounty and sink the outlaw's standing in every town, and a
  wanted outlaw is refused at inns. **Bounty hunters** (honorable or greedy,
  and those seeking revenge) travel to where the outlaw was last seen. Hunted
  outlaws are cornered and find running harder; without that, they always got
  away and no bounty was ever paid. Each fruitless chase makes the next less
  tempting. Some prosperous outlaws pay restitution and reform.
- Fights now have **two sides**, each any mix of characters and creatures,
  so the same combat code runs delves, ambushes and hunts.
- In a 100-adventurer world over two years, about 8 robberies, 8 murders
  and 4 bounty claims happen, with two dozen parties alive at the end.
  Rivalries, a party member leaving, and reforms are rare; any given year may
  not see one.
- **UI**: the character card has a **Bonds** section (party or gang,
  friends, rivals, languages, outlaw record and bounty, standing in towns),
  with names that link to other cards. All the new events read as prose in
  the log.
- **Exit criteria**, mostly met: parties form, delve, lose members and break
  up; broke adventurers turn bandit, rob travelers and get bounties. There are
  no caravans to rob until Phase 7, and travelers who can't understand an
  outlaw fight rather than pay.
- **Performance**: a location index replaced whole-world scans, and gear
  totals are cached. 500 characters run 10 years in about 5 minutes (299 s
  headless), just inside the target with no room to spare. Deciding is now
  most of the cost; Phase 6's worker and fast-forward work will need to win
  some back.

---

## Phase 6 — The Observatory

**Goal:** Turn the log viewer into a real god-game observatory, make time
compression work fully, and harden the technical base.

**Observation tools**

- [x] **Follow mode**: pin a character and the log filters to them, with
      their card always visible.
- [x] **Silent detail** (moved from Phase 2): blow-by-blow and chamber-by-
      chamber events are only emitted for followed characters and watched
      places, without changing event IDs or history (`ARCHITECTURE.md` §4.2).
- [x] **Character profile page**: biography generated from life events,
      stats over time, gear, spells, relationships, memories, and a timeline.
- [x] **Location view**: who is here now, populations, recent events, and
      dangers.
- [x] **Search and filters**: by character, location, species, event type, and
      importance.
- [x] **Chronicle**: a curated history of notable and legendary events, by year.
- [x] **World statistics dashboard**: population by species, deaths by cause,
      level distribution, total gold, and crime, charted over time.
- [x] **Hall of Heroes / Graveyard / Most Wanted**.

**Time compression** (`ARCHITECTURE.md` §4.2)

- [x] **Season** tier and **Fast-forward** ("skip N years") with a progress
      bar, pause and cancel, and a **digest** of what happened while skipping.
- [x] **Display throttling** with digest lines ("…and 3,412 minor happenings").
- [x] **Playback buffer** so Real-time and Minute tiers read smoothly.

**Hardening**

- [x] Move the simulation into a **Web Worker** (Comlink), with throttled
      snapshots and on-demand `query()`.
- [x] **Save / load** to IndexedDB, plus export and import of save files.
- [x] "New world from seed" dialog. Seeds are shareable.
- [x] Event retention by importance (old trivial events expire; notable and
      higher are kept).
- [x] Hit the fast-forward performance target in `ARCHITECTURE.md` §8 with the
      current population.

**Exit criteria:** Watch one duel in real time, then skip ten years in a few
minutes. Read the digest, save, reload tomorrow, pick an interesting survivor,
and read their life story.

**Status: done.** Notes from building it:

- **The worker** (`src/host/`): an engine that runs the clock, the log
  floor, follow mode, skips and the queries, a worker shell around it, and a
  host on the main thread that mirrors what the UI always shows (status, the
  log, every name and place) and asks for the rest. The messages are typed by
  hand instead of using Comlink: there are only a dozen. The engine has no idea
  it's in a worker, so its tests drive it in Node with a hand-cranked timer,
  and one checks that driving it at every speed in turn gives exactly the
  world a direct run does.
- **Silent detail**: blows, flights and quiet chambers are only reported for
  the followed character and the place being looked at, and other trivial
  events only when the log would show them (a Trivial floor). They still take
  their IDs, so nothing else changes; a test proves the world and every
  other event come out the same whoever is watched.
- **Follow mode**: "Follow" on a card logs everything that character does,
  blow by blow, whatever the floor, and the log can be narrowed to them.
- **Profiles**: a life story written from their record (origins and
  character, career, legendary finds and spells, friends, rivals and grief,
  crimes and bounties, and how they died), level and gold charts from
  seasonal samples, and a timeline by year. The card sits alongside with the
  rest: gear, skills, bonds, memories.
- **Places**: who's there (outlaws lying in wait first), what lives in a
  dungeon and how dangerous it is, legendary items lost there, who fell there,
  and what happened lately.
- **Search and filters**: find anyone who ever lived, or any place, by name;
  filter the log by kind of event, place and people. Importance is the
  Detail setting.
- **Chronicle** by year, a **statistics** page (adventurers by people, deaths
  by cause, levels, gold, crime and justice over time, and today's levels),
  and the **Hall of Heroes, Most Wanted and Graveyard**. The charts are small
  hand-made SVG with a hover crosshair, legends and a table view each.
- **Time**: a Season speed, and skipping ahead a season, a year, 5, 10 or
  25 years with a progress bar and a "Stop here". Afterwards a digest says
  what changed (people, deaths, levels, legendary finds, crime) and lists
  what will be remembered. While skipping, the log only takes notable events.
- **Display throttling**: more than 250 entries in one update keeps the
  notable, the followed and the latest; the rest becomes "…and 3,412 minor
  happenings across the realm".
- **Playback buffer**: at Real-time and Minute the engine runs a quarter of a
  second ahead and releases events when the clock reaches them.
- **Saves**: the world and every random stream's state, plus the chronicle.
  Loading and carrying on gives the same history as never stopping (tested).
  Saved in IndexedDB, autosaved every minute and when the tab is hidden;
  opening the link to a world you watched carries on where you left it.
  Exported as gzipped JSON and imported back. A "Worlds" dialog starts new
  worlds from a seed and a size, and links are shareable.
- **Retention**: separate rings per importance: 2,000 trivial, 20,000
  everyday, 100,000 notable, and every legendary event.
- **Bugs found on the way**: a follower whose leader turned outlaw or
  quarrelled mid-journey was left idle on the road, and crashed the next
  decision (they now finish the leg alone). A bounty claim listed the dead
  outlaw among its actors.
- **Performance**: 500 characters run 10 years in 277 s headless, under the
  conditions of a fast-forward (no trivia, no detail), against the 5-minute
  target and 299 s at the end of Phase 5. Getting there: trivia nobody will see aren't built; a
  crowded tavern is a few strangers plus people you know, not the whole town;
  opinions are forgotten in batches; a character weighs only the two most
  tempting bounties; decisions keep the best three options as they go instead
  of sorting all of them.

---

## Phase 7 — Markets

**Goal:** A real economy. Nobody sets prices: they come from supply, demand,
and individual price beliefs.

- [x] **Goods**: raw materials (ore, hides, herbs, creature parts), crafted
      items, consumables (food, potions), and **reagents** for magic.
- [x] **Market per town** run as a bid/ask clearinghouse. Agents hold _private
      price beliefs_ that adjust after each successful or failed trade
      (Doran & Parberry model).
- [x] **Town demand from statistical populations**: townsfolk eat, wear out
      tools, and buy goods in aggregate.
- [x] **Producers and crafters**: smiths, alchemists, and tanners. Crafting
      recipes use materials and skill, and quality depends on skill rolls.
      Adventurers become suppliers of creature parts and ore.
- [x] **Merchants and caravans**: trader characters who buy low in one town,
      haul goods along routes (where bandits and creatures raid them), and sell
      high in another. **Arbitrage** is what ties town prices together.
- [x] **Language in trade**: no shared tongue means fewer deals and worse
      prices, which gives merchants a reason to learn languages (and
      possibly leads to a trade pidgin).
- [x] **Random shocks**: a failed harvest, a collapsed mine, a creature
      blockade on a route, a rich new vein. Prices react.
- [x] **Money supply accounting**: every gold source (loot) and sink (food,
      repairs, lodging, lost on death) is tracked, so the headless report can
      catch runaway inflation or deflation.
- [x] UI: market panel per location (prices, order book, history chart),
      price index over time, caravan tracker.

**Exit criteria:** A bandit gang on the iron route makes swords more expensive
in the town at the far end, and a multilingual merchant takes the risk and
makes money from it.

**Status: done.** Notes from building it (design in `ARCHITECTURE.md` §4.9):

- **Goods**: food, iron ore, hides, herbs, spider silk, reagents, tools,
  clothes, healing draughts, arms and armor. Creature parts sell as goods (a
  wolf pelt is hides, an imp horn reagents), spare weapons and armor as scrap
  iron; rings, goblets and trinkets are assayed for coin.
- **Markets**: each town's commoners are split into trades, each one agent
  with private price beliefs, and a Doran & Parberry clearinghouse runs every
  morning. Labor drifts toward the trades that pay, which is what keeps
  supply in line with demand; without it the first version starved every town
  but the farmers.
- **Trading houses** stand between the auction and named characters: they buy
  loot and cargo, sell draughts and gear, keep the inns, pay bounties, and pay
  their surplus out as wages, which carries adventurers' gold into the towns.
- **The map changed**: Brindlemoor is now mostly dwarven and has the iron
  mine and the best smiths; Saltmere is mostly elven, grows herbs and brews,
  and has no forge; a mountain pass, the **Ironpass**, sits on the road between
  them, where bandits can lie in wait.
- **Merchants** (one for every eight adventurers) plan runs from a price book
  that goes stale and is swapped with other merchants at taverns; they weigh
  margin, rivals already hauling the same goods there, and the danger of the
  road. Robbers take their cargo too. They learn the tongues of the towns
  they trade in by living there, and get better prices for it (up to 40% worse
  with none).
- **Adventurers** now buy healing draughts (and drink them in fights) and,
  when rich enough, better weapons and armor; they spend a little on nights
  out, and sleep rough rather than spend their last coins on an inn.
- **Troubles**: failed harvests, mine collapses, rich veins, blight, and
  beasts holding a road (closed to anyone planning a journey).
- **Money accounting**: every coin is minted or burned through a ledger; a
  test checks that the gold held always equals what was minted less what was
  burned. Over ten years the money supply levels off rather than running away,
  and prices stay within a third and three times a good's worth.
- **UI**: a market panel on every town (prices, 30-day change, the last
  auction's demand and supply, the trading house's quotes and stores, a price
  history chart, who works there and how well fed they are), a **Trade** page
  (caravans on the road, merchants and their tongues, closed roads, recent
  deals), price index and money charts and the ledger on the statistics page,
  and cargo or draughts on character cards.
- **Exit criteria, partly met.** With a gang dug in at the Ironpass for a
  year (six worlds tried), robberies at the pass went from about none to 6–24,
  and tools in Saltmere got dearer in five worlds of six (about 26% on
  average); arms only in three of six (about 10% on average), since Saltmere
  can also get them from Concordale through the Witherwood. The merchants who
  made most on the Brindlemoor–Saltmere run were mostly ones who spoke the
  dwarves' or elves' tongue.
- **Bugs found on the way**: a float rounding to −0.0000000000000004 herbs
  turned into NaN prices and hung the whole world (stock is now clamped at
  zero); merchants who spoke no tongue of a town could trade nowhere and
  starved slowly at inns.
- **Performance**: 500 adventurers and their 63 merchants run 10 years in
  217 s headless, as fast-forward runs. A world gets slower as it ages
  (veterans delve deeper); caching whether a veteran's pack holds anything to
  sell, and merchants replanning only once a market day, kept it there.

---

## Phase 8 — Generations

**Goal:** Lives have a beginning, middle, and end, and the world continues past
any single character.

- [x] **Aging** per species lifespan: stats change with age, and characters die
      of old age. Undead don't age.
- [x] **Retirement**: older or wealthy or wounded or traumatized adventurers
      settle down and take a town job (innkeeper, smith, trainer, merchant).
      Their memories and relationships stay.
- [x] **Courtship and marriage** from high mutual affinity and compatible
      traits, mostly within a species.
- [x] **Children**: inherited traits (blend + mutation), the gift sometimes
      runs in families, and family names. Children grow up in town and come of
      age as new adventurers who may take up a parent's weapon or grudge.
- [x] **Promotion** from statistical populations: notable commoners become named
      characters when events single them out.
- [x] **Inheritance**: gold, items, and houses pass to heirs.
- [x] **Dynasties and legends**: family trees, famous lineages, and dead heroes
      who become legends that others mention.
- [x] UI: family tree view, and a lineage section in profiles.

**Exit criteria:** A 100-year headless run produces three or more generations,
with a stable population for each people and family sagas visible in the
chronicle.

**Status: done.** Notes from building it (design in `ARCHITECTURE.md` §4.10):

- **Ages**: humans live about 70 years, dwarves 250, elves 600, each with an
  age of adulthood and a range their first adventurers start at. From 60% of
  a lifespan strength, agility and toughness wane each birthday; from 75%,
  death of old age grows likely. Peoples can be marked ageless, for the undead
  to come.
- **Callings**: adventurer, merchant, townsfolk, child. Townsfolk and children
  are never scheduled, only visited in the daily round, so they cost almost
  nothing; they still go to the tavern of an evening, make friends and court.
- **Retirement** comes with age, wealth (not for the young of a long-lived
  people), a young family, or broken nerve. Retired adventurers become
  innkeepers (cheaper rooms in their town), smiths (better steel for sale),
  weapons masters (faster training, to a higher cap), farmers or clerks, or,
  if greedy and rich while the roads have room, merchants.
- **Families**: friends who love each other marry, rarely across peoples and
  never close kin; couples in their fertile years have up to five children.
  Children blend their parents' stats and traits with a mutation, take a family
  name (with "II" or "III" after the given name when the whole name is taken), and have a one in three chance
  of the gift with a gifted parent. They come of age as adventurers (with a
  parent's weapon and grudges) while the world needs them, else in a parent's
  trade. A murder may raise an avenger among the victim's kin.
- **Promotion** from the commoners is still how adventurers and merchants
  appear, now from the people most short of its share.
- **Keeping numbers level**: births slow as a people's young settled folk
  fill the room its commoners give it, and townsfolk of a crowded people
  (couples together, never those with children to raise or the famous) may
  move on, leaving the world without a death. Those leaving pass their purse
  to their family.
- **Inheritance**: whoever dies at home leaves gold and gear (legendary items
  included) to a spouse, or else shared among the children.
- **Legends**: a dead character becomes a legend when their renown (level,
  legendary finds, memorable kills, kills) outshines 90% of the dead before them.
  The bards sing of them (a legendary event), taverns tell their tales, and
  their children's life stories note whose child they were.
- **UI**: a family tree on every profile (grandparents to grandchildren, the
  dead and the legendary marked), spouse, parents and children on the card,
  ages and callings ("Retired smith"), Legends and Great Houses in the halls,
  folk by calling and deaths of old age on the statistics page, and a
  Generations section in the headless report.
- **Exit criteria, met for generations and sagas, mostly for numbers.** Three
  100-year runs of 40 adventurers (seeds `ages`, `saga`, `ink`) reached five or
  six generations, with 83–100 births, about 130–145 marriages, 100–110 deaths
  of old age and 30–36 legends. The living levelled off at 120–145 from the
  thirtieth year; humans stay between about 67 and 92 with no trend, while
  dwarves (25 to 32–35 from year 30 to 100) and elves (14–16 to 24–26) still
  edge up by about one a decade, since none of them has grown old within a
  century. The chronicle tells the family stories: in `saga`, Godwin Rookfield
  marries in the first year and retires as a smith for the family; their
  daughter Gunnora comes of age with a leaf-bladed sword, finds three
  legendary items, marries and has children, the youngest coming of age in
  year 39.
- **Balance changes on the way**: commoners now grow logistically toward a
  town's room (1.5× its founding size); legendary items grow rarer as more
  exist; adventurers turn to crime from 40 gold rather than 15, since with
  merchants and inns they were rarely that poor. Veterans still rarely die to
  creatures (about 20 a century in a world of 40), and legendary finds are
  still many (about 220 a century).
- **Performance**: 500 adventurers (with their merchants, and the townsfolk
  and children they become and raise) run 10 years in 250 s headless, against
  217 s before; the daily round of the townsfolk costs about 3%, the rest is
  a busier world.

---

## Phase 9 — A Living World

**Goal:** Replace the hand-made world with a generated one that changes over
time.

- [x] **Procedural world generation** from seed: regions and biomes, **peoples'
      homelands** (forests for elves, mountains for dwarves, steppes for
      centaurs…), dozens of towns, dungeons, ruins, and fortresses, a few rare
      mixed border towns, and the route network.
- [x] **Centaurs** join as a people. **Sapient demons and undead** (demon
      warlords, liches, revenants) arrive as characters who command creature
      hordes and cults.
- [x] **Creature ecology**: dungeon populations breed, migrate, and spill over
      when overpopulated. Clearing a dungeon has lasting but temporary effects.
- [x] **Bosses**: unique, named, persistent beings with lairs. They can _level
      up from the adventurers they kill_ and become remembered threats.
- [x] **Raids and incursions**: creature and demon attacks on weak towns, and
      town defense by the characters present.
- [x] **Fortresses and lords** (first pass): territory, taxes or protection,
      and garrisons that patrol routes.
- [x] **Seasons and weather** affecting travel, harvests, and creature activity.
- [x] **World map view** (PixiJS canvas): locations, routes, caravans, and the
      followed character, with click-through to the DOM panels.

**Exit criteria:** A brand-new seed produces a different, coherent world. A
lich grows infamous over decades until a party finally brings it down, and
the chronicle records it.

**Status: done, with cults left for later.** Notes from building it (design in
`ARCHITECTURE.md` §4.11):

- **Generated worlds**: the seed makes the map. A world has 7, 11 or 16
  regions (small, medium or large, by how many adventurers it holds), each
  one land: plains, forest, hills, mountains, steppe, marsh or wastes. Each
  people's towns sit in its homeland (humans on the plains, elves in the
  forests, dwarves in the mountains, centaurs on the steppe), with one or more
  border towns taking in two peoples. Dungeons lie away from the towns and
  grow deadlier the further out, and the wastes hold no towns at all. A
  fortress guards every five towns or so, wild places sit along the way, and
  roads join everything (the Gabriel graph of the places, less its longest
  detours), their hours set by the land they cross. Names come from each
  culture's word lists. The hand-made starter map stays for tests.
- **Centaurs** join the peoples: the steppe is their homeland, Windspeech
  their tongue, and they travel half as fast again as anyone on foot.
- **The dread**: liches, revenants and demon lords are characters lairing in
  the deepest chamber of a crypt, ruin or rift, with three times a mortal's
  health and more. They rise at the strength of the day's best adventurers,
  grow stronger from everyone they kill, mend slowly, lead their lair's
  creatures on raids, and count every life a raid takes. When one falls,
  another rises somewhere in time. Cults are not built yet.
- **Bands against the dread**: delvers turn back at a lair's door unless they
  fancy their odds. Someone setting out from town to a master's dungeon calls
  for companions, and whole parties may answer, up to six. Once a master has
  claimed eight lives, a band musters in the nearest town. A band presses on
  to the lair rather than turning back halfway.
- **Creature ecology**: dungeons breed back with the seasons, slowly once
  few are left, so a cleared dungeon stays quiet for months. A full one spills
  a band of its surplus into a neighbor with room, or onto the roads, where
  roaming bands waylay travelers, raid a town a road away, and thin out over
  time.
- **Raids**: whoever in town is fit to fight stands to defend it (townsfolk
  too, unless old), the strongest eight. A lord's garrison mans the walls of
  its towns first. A town nobody defends is plundered and loses some of its
  folk; what a dread-led raid takes goes to the lair.
- **Fortresses and lords**: a lord holds the towns and wild places within a
  day's ride, takes a small tithe from their trading houses, pays the
  garrison's wages back into them, and spends anything over a modest purse in
  the towns. Patrols clear roaming creatures and fall on outlaws lying in
  wait. A lord's eldest grown child inherits the seat; failing one, a renowned
  adventurer retiring nearby may claim it, or after half a year someone of
  the lands is raised to it.
- **Seasons and weather**: each region's weather turns every few days by
  season and climate (snow in the mountains in Deepwinter, heat on the steppe
  in Highsun). Hard weather slows the roads by up to half again, farmers
  bring in more at Harvest and less in Deepwinter, and creatures breed fastest
  in Thaw.
- **UI**: a **Map** page drawn with PixiJS (loaded only when opened): the
  regions as colored land, roads, towns, fortresses, dungeons (ringed where
  the dread lair) and wild places (ringed where creatures roam), and everyone
  on the road moving along it, the followed character ringed. Places and
  travelers can be clicked; drag to pan, scroll to zoom. Places are listed by
  region; a place's page gives its land and weather, its lord and garrison,
  its master, and what roams there. The halls list the dread, living and
  destroyed. The headless report has a Living world section.
- **Exit criteria, met for worlds, partly for the lich.** Every seed tried
  makes a different world, coherent by the checks above (each people at home,
  every place reachable, the wastes empty of towns). Over 60-year runs of 40
  adventurers, the dread rise, grow, and fall, and the chronicle records each
  fall as a legendary event naming the slayers. How they fall varies: young
  liches often fall to one strong hero within a few years; in one world a
  lich claimed 175 lives in raids before it was destroyed; in another, bands
  of six or seven defenders cut down three demon lords while they raided the
  same town. But a planned assault on an old master's lair by a band is still
  uncommon. In some worlds a revenant or demon lord lurks for forty years or
  more, claiming dozens of lives, without falling.
- **Bugs found on the way**: fighters who died partway through a round were
  still listed among those taking part in later blows; fixed.
- **Performance, over budget.** 500 adventurers on a large world (28 towns,
  72 places) take 388 s for 10 years headless, against the 300 s target and
  Phase 8's 250 s on three towns. Each decision costs more on a big map (more
  dungeons and bounties in reach), and 28 markets clear every day. Decisions
  now weigh only the seven nearest places and home, merchants plan runs of at
  most four days, and patrols look up who is where instead of scanning
  everyone. A world of 500 on the hand-made map takes 12.3 s per half year,
  against about 10.5 s before. The rest is for Phase 11 (Scale & Ship).

---

## Phase 10 — Cultures & Myths

**Goal:** The world's regions take on identities drawn from real-world
civilizations and their mythologies (`WORLD.md` §6). The culture-tag plumbing
has been there since Phase 1, so this phase is mostly content work.

- [x] **Culture pack format**: name generators, arms and armor tables, bestiary
      (region-native creatures and peoples), magic tradition (spells and cost
      flavors), myths and deities, and settlement vocabulary.
- [x] World generation assigns cultures to regions. A species can have local
      variants per culture (Norse _dvergar_ and _álfar_).
- [x] **First culture pack**, likely **Japonic**: katana, naginata, yumi;
      kitsune, kappa, oni, tengu, yūrei; talisman and ward magic.
- [ ] Then more packs, one at a time (Norse, Hellenic, Slavic,
      Mesopotamian…), each playtested with the headless runner for balance.
      _Norse is done; the rest are to come._
- [x] **Myths in the simulation**: characters hold beliefs from their culture.
      Local legends grow out of real chronicle events ("the oni of the
      northern pass" is a real boss that killed real people).
- [x] UI: region panel with its culture, myths, and notable figures.

**Exit criteria:** Two regions feel distinct at a glance in the log: a ronin
with a katana fighting a kappa at a river ford in one, and a Norse-flavored
dwarf facing a draugr in a barrow in the other.

**Status: done, with two packs of the five sketched.** Notes from building it
(design in `ARCHITECTURE.md` §4.12):

- **The pack format**: a culture can carry a pack (`src/content/cultures.ts`):
  the peoples it raises and its names for them, the arms and armor they
  favor, what it calls fighters, scouts and mystics, its gods, its region and
  place names, its kinds of dungeon, a creature that haunts its wild places,
  and how many regions it may cover. Its magic is its spells, tagged with its
  culture, and taught only to those raised in it.
- **Cultures on the map**: world generation gives each pack a cluster of
  regions (one each in a small world, up to two or three in a large one)
  whose main people it can raise. Towns there take the culture when their
  people is among its peoples; dungeons and wild places take it too, and each
  culture's lands hold at least one dungeon of its signature kind. Everyone
  born or raised in such a town takes its names, arms and magic. A culture's
  own arms turn up mostly in its own lands.
- **Japonic**: katana, naginata and yumi (bows join the weapon skills),
  do-maru armor, tamahagane steel; kappa haunting the fords and crossings,
  kitsune and yūrei in haunted shrines, tengu and oni in their holds;
  Foxfire and Ofuda Ward; Inari, Hachiman, Amaterasu, Susanoo and Benzaiten;
  ronin, shinobi and onmyōji.
- **Norse**: bearded axe, seax and spear, mail byrnies; humans, _dvergar_ and
  _álfar_; draugar in barrows, jötnar in their halls; Thunder Rune and Rune of
  Warding; Odin, Thor, Freyja, Tyr and Njord; huscarls, trackers and
  rune-carvers.
- **Myths**: something that kills three people at a wild place (eight in a
  dungeon, where death is the trade), or one of the dread that claims eight
  lives, becomes a local legend, told by the culture of the land. Folk raised
  on a tale tell it over a drink and keep away from the place; a tale about
  one of the dread ends when it is destroyed. The gods are believed in, and
  prayed to at shrines; whether they answer is still an open question
  (`WORLD.md` §7).
- **UI**: a **region page** (from the places list, a place's page, or a
  region's name on the map) with its land, weather, culture and gods, the
  tales told there, its lords, dread and most renowned folk, and its places.
  Cards and profiles give a character's local title and people ("Level 23
  tracker · dvergr of Grimby") and the ways they were raised in. The headless
  report lists culture lands and myths.
- **Exit criteria, met.** In a medium world with both packs, the log reads
  "Daichi Morikawa, a ronin with a naginata, is set upon by two kappa
  roaming the Kawazu Crossing" in the Japonic lands, and "Sten Bearholm, a
  dvergr huscarl with a bearded axe, comes face to face with two draugar" in a
  Norse barrow.
- **Still to come**: the Hellenic, Slavic and Mesopotamian packs; cults; and
  regional tongues (people raised in a pack still speak their people's
  language).
- **Performance**: 500 adventurers on a large world run 10 years in 341 s
  headless, down from 388 s at the end of Phase 9 but still over the 300 s
  budget, which is Phase 11's to meet. (Phase 9's figure was taken before
  its last few changes, so the gain can't all be put down to this phase.)

---

## Phase 11 — Scale & Ship

- [ ] Profile with the headless runner and hit the targets in
      `ARCHITECTURE.md` §8 (1,000+ characters). _Two of four met; see
      below._
- [x] World-based level of detail for quiet regions, if profiling shows it's
      needed (never observer-based). _Not needed: see below._
- [x] **Tauri desktop build** (Windows, macOS, Linux) from the same codebase.
- [x] **Content packs**: load extra creatures, items, cultures, and names from
      JSON.
- [x] Settings: world size, danger, magic rarity, peoples included, and
      population caps at world creation.
- [ ] A final project name, an icon, and a hosted web build. _The icon is
      done and the web build is hosted from `main`; the name is still to be
      chosen._

**Status: built, with the name to choose and two performance targets
missed.** Notes from building it (design in `ARCHITECTURE.md` §4.13):

- **Settings** go in the Worlds dialog under _Settings_, in links, in saves
  and in the headless runner (`--size`, `--danger`, `--magic`, `--peoples`,
  `--cap`). A world with nothing chosen is the same world as before.
- **Content packs**: a JSON format checked whole before anything goes in,
  with the reason given when a pack is refused. `packs/slavic.json` is the
  example and the third culture: leshies in the woods, rusalki at the fords,
  upyri in the crypts, druzhinniki with sabres, volkhvy of Perun and Veles.
  Packs come with the app or are added from a file, kept in the browser,
  named in links and carried whole in saves.
- **Desktop**: `src-tauri/` wraps the web build in a Tauri window with a
  strict content security policy (the map's PixiJS now runs without `eval`
  to allow it). The _Desktop_ workflow builds installers for Windows, macOS
  (universal) and Linux, by hand or on a `v*` tag.
  Built and run here on Linux (a 1.7 MB `.deb`, a 77 MB AppImage): the
  world runs, the map draws, saves persist between launches, and exported
  saves go to the Downloads folder. Windows and macOS are built only by the
  workflow and haven't been tried by hand. The app has no web address, so
  links to a world point to the hosted site if `SHARE_URL` is set as a
  repository variable, and aren't offered otherwise.
- **Arrival**: with no world named in the address (a bare address, or
  opening the desktop app), the world last watched carries on from its
  autosave, instead of a new one starting every time.
- **Icon**: a sun rising behind mountains, in the app's colors
  (`public/icon.svg`, also the favicon), rendered to every size the desktop
  bundles need.
- **Performance**, measured in this cloud container:

  | Scale                       | Target              | Measured                                             |
  | --------------------------- | ------------------- | ---------------------------------------------------- |
  | 200 characters, small world | 1 year in < 5 s     | 7.0–7.7 s: **missed**                                |
  | 1,000 characters, browser   | Smooth up to Season | 60 fps at every tier; the world keeps up to Day      |
  | 500 characters, large world | 10 years in ≤ 300 s | 312 s, from 341 s at the end of Phase 10: **missed** |
  | UI                          | 60 fps regardless   | 60 fps, worst frame 17 ms, with 1,000 at Season      |

  The gains came from cheaper random numbers and dice, cached fears and
  visits, a road plan that holds for six hours while nothing changes, and
  less garbage in scoring choices. The profile is now flat: deciding what to
  do is about 60% of the time, spread across many small pieces, with no one
  hot spot left. With 1,000 people at Season the world runs about 6.5 days
  a second, not the 90 asked for; the engine slows time rather than letting
  a backlog build, so the page stays smooth.

- **What didn't work**: letting the content spend longer at each pastime in
  town cut decisions but barely the time, and a third of friendships went
  with it; skipping the road for the content made no net difference. Both
  were taken out.
- **Level of detail was not needed** in the sense planned: the cost is where
  people are (towns, dungeons, roads), not in quiet regions, so there is no
  idle region to simplify. Cutting deeper would mean simulating people more
  coarsely, which changes the stories; that is left for later, if wanted.

---

## 0.3.0 — The Outlaws Update

**Status: released as 0.3.0 (2026-11-21).** Every step below is done; the notes under each say what was built and what it measured.

**Goal:** Crime is a living part of every world, large or small, and a
hard life: each crime makes the next one harder to get away with, news of it
travels town to town, and an outlaw's career ends in a pardon, a bounty
collected on their head, or a cell or a scaffold.

**Why (measured on 0.2.0):** turning outlaw has one trigger, being an
adventurer with under 40 gold. Adventurers start with 7–17 gold, so every
world opens with a burst of outlaws; after their first delves they are broke
only 0.2–0.4% of the time, so crime then almost stops. Four 20-adventurer
worlds made 3–13 outlaws in a century, in 2–5 distinct years, and the top two
outlaws committed 76–100% of all crimes (one world had outlaws but no crimes
at all). Crimes only ever have named victims, and a crime lowers an outlaw's
standing in every town at once.

**Already in place to build on:** standing per town (-1 to 1) and being
_wanted_ in a town (no inn, unwelcome to linger); bounties posted by the
victim's home town and paid on the outlaw's death; hunters weighing bounties;
avengers raised by murder; and going straight by paying half one's purse.

Each step is its own pull request, keeps saves loading (a `SAVE_VERSION` bump
and a migration whenever the shape of saves changes, since `main` is the live
site), and is checked against the targets below with the crime audit.

### Steps

1. **Measure first.** _Done:_ `npm run audit:crime` (`tools/crime-audit.ts`)
   runs several worlds side by side (default four 20-adventurer worlds for a
   century; `--seeds`, `--adventurers`, `--years`, `--json`) and reports
   turnings and the people behind them, the year of the first, the share of
   decades with one, robberies, ambushes and murders, the top two outlaws'
   share of crimes, how careers end (reformed, bountied, died, at large) and
   how often honest adventurers are broke, checked against the targets. The
   0.2.0 baseline:

   | world   | outlaws | decades with one | robberies | ambushes | top outlaw's share |
   | ------- | ------: | ---------------: | --------: | -------: | -----------------: |
   | alpha   |       4 |              40% |        50 |       67 |                94% |
   | bravo   |       5 |              40% |       128 |      192 |               100% |
   | charlie |       3 |              20% |         0 |        0 |                  — |
   | delta   |      13 |              30% |       685 |      937 |                53% |

   All 25 turned from want. At 200 adventurers over 15 years, 38 and 43
   outlaws, with the top outlaw at 17–29% of crimes.

2. **More ways in, and fair starting purses.** _Done._
   - Adventurers start with 40–67 gold (was 7–17), above the broke line, so
     worlds don't open with a burst of outlaws.
   - Want needs ten days of hardship (no gold and nothing to sell) before it
     can turn anyone, and grows more pressing with the days and with a bad
     run (vivid memories of near deaths and flights).
   - Temptation, rarely, for someone who isn't broke, and only with a good
     reason: ambition (cold and greedy), a thief's skill (stealth or
     lockpicking 60+, better than any weapon, and little honor), outlaw
     friends, or a vivid grudge. Each reason adds a little to a small chance
     scaled by a weak conscience; the honorable and kind are never tempted,
     and a pardoned outlaw isn't for three years.
   - The cruel (compassion under 0.25) sometimes fall on their victims
     without a word.
   - Each outlaw keeps why they turned; the log and life stories say it.
   - Measured, four 20-adventurer worlds over a century: 9–31 turnings each,
     the first in years 0–7, a turning in 50–100% of decades and no
     opening burst (was 3–13, in 20–40% of decades). Reasons: a thief's skill
     46, outlaw friends 8, ambition 5, grudges 5, want 2. At 200 adventurers
     over 15 years: 28 and 54 turnings, most from want.
   - The top outlaw still commits 23–57% of a world's crimes. That is down to
     the crimes, not who turns: the only crime is lying in wait for named
     travelers, which the strongest outlaw wins most. The spread target moves
     to step 3.
   - Willing to steal once is not becoming an outlaw: a character who would
     take a safe chance now and then, and otherwise live honestly, needs the
     nameless crimes of step 3, and is built there.

3. **Crimes against the nameless.** _Done_ (`src/sim/systems/crime.ts`).
   - Outlaws hold up caravans on roads between towns (at the end of a spell of
     lurking, likelier on busy roads; a well-guarded caravan fights back), steal
     from shops and rob trading houses at blade point by day, break into houses
     by night (stealth and lockpicking against the town watch, which is sharper
     in big towns and for the suspect), make a nearby town's farms pay, and
     spoil stores for spite (the cruel and the shunned).
   - The take comes out of the town's trading house and trades; stolen goods
     are carried and sold to fences, at 40% of the going price, in any other
     town that doesn't bar the thief.
   - Each crime is recorded with its kind, place, town, worth and whether
     anyone knows who did it. Outlaws lie low for five days after any crime
     and work a town once a month.
   - Occasional crime: someone who is no outlaw may steal (theft, burglary)
     when they have a reason to be tempted, a conscience that gives way, need
     or greed, and it looks safe: away from home, in a town that doesn't eye
     them, with a good chance of getting away, months after the last time.
     Caught, they pay a fine, or are outlawed if they can't.
   - Measured, four 20-adventurer worlds over a century: 1,500–4,200 crimes
     against the nameless each, 72–100% of all crimes (caravans most, then
     burglaries, holdups and thefts); towns lose 2,300–6,900 gold a year to
     crime, and their gold and prices stay in the range they had on 0.2.0. The
     top outlaw commits 19–36% of a world's crimes. People who are no outlaws
     stole 5–32 times a century per world.
   - Not met in big worlds: at 200 adventurers over 15 years only 20–45% of
     crimes are nameless, since named travelers crowd the roads where outlaws
     lurk. Left for step 9's balance.

4. **Reputation that travels.** _Done_ (`src/sim/systems/notoriety.ts`).
   - A known crime is heard at once by its town (the one it was against, or
     the nearest within three days). Word then reaches every town within ten
     days' road (twenty for a murder), after about one and a half times the
     road's travel time, so each town knows a different part of a record at
     different times. Nearer towns weigh a crime more.
   - What a town has heard fades (it halves each year), but a known murder is
     never forgotten:
     - suspected: prices 20% worse, the watch keeps an eye on them, honest
       folk are wary, nobody teams up with them or answers their call;
     - unwelcome: no inn, no trade but fences, unwelcome to linger, posters up
       (hunters chase only outlaws their town has heard of);
     - barred: always so for a known murderer. They don't go there; the
       guards turn them away if word arrived while they were on the road, and
       put them out if they are inside when it comes.
   - Outlaws favour towns that haven't heard of them, and an outlaw nobody has
     heard of makes friends like anyone else. Standing (`reputation`) keeps
     only good deeds; the old instant drop everywhere is gone. Saves move to
     version 7, and old standing becomes what each town has heard.
   - Not yet: standing mended by good deeds; for now it only fades.

5. **Way out: restitution.** _Done_ (`src/sim/systems/justice.ts`).
   - An outlaw with no blood on their hands (none on their record, none known
     anywhere) and a little honor (0.15 or more) who has tired of the life (no
     crime in three months, doors shut in half the towns that know them, or a
     bounty of 150 or more) may pay at any town's court: in every town that
     knows of their crimes, what they took plus a quarter in interest and a
     quarter in fines (at least 10). The bounty is lifted and the record
     cleared; the towns still hold them _suspected_ until time earns their
     trust back. Murderers can't buy their way out.
   - Measured (four 20-adventurer worlds, a century): 0–7 per world go straight
     this way.

6. **Way out: a price on their head.** _Done._
   - Killing an outlaw pays nothing on the spot. An adventurer or merchant who
     kills one takes the head and carries it to a town that has heard of the
     outlaw; there the reward is split evenly with their party. The posting
     town pays what it can, the claiming town the rest. A head is lost with its
     carrier, or after 90 days, and the bounty with it.
   - Bounties stop growing at 300 gold, plus 150 for each murder: with crimes
     against the nameless, prolific outlaws had run them into the tens of
     thousands.

7. **Way out: taken alive.** _Done._
   - A trap: a hunter with the craft (stealth and awareness, 35 or more)
     sometimes lays one on reaching the quarry instead of attacking, against
     the outlaw's awareness. Caught, the outlaw is taken; sprung wrong, the
     outlaw slips away.
   - A takedown: in a hunt, a blow that leaves the outlaw at a quarter of their
     health or less may be pulled to grapple them instead, the hunter's level
     and might against the outlaw's level and agility. Failing, the hunter is
     wounded, sometimes killed.
   - Hunters who are honorable or greedy try more often; one bent on revenge
     rarely does.
   - Captives lose most of their gold and their gear to the captors and are led
     to the nearest town that would pay. On each leg of road they may escape,
     better at a higher level and agility, worse against a bigger, stronger
     escort; one who does leaves what was taken.
   - Delivered, the bounty pays two and a half times over, split with the
     party. Until step 8, the captive is jailed for a year plus a month per
     crime (three times as long for blood, ten years at most) and walks out no
     outlaw; old age can take them inside.
   - Measured (same worlds): 1–5 outlaws taken alive per world per century, a
     few escaping on the way; 0–1 heads claimed. Hunts rarely end in a kill, as
     before, so captures outnumber heads; balancing that is step 9's. At 200
     adventurers over 15 years: 14–22 taken alive and 6–10 heads claimed per
     world, 4 going straight.

8. **Justice.** _Done_ (`src/sim/systems/justice.ts`, `notoriety.ts`).
   - An outlaw brought in alive is tried on what any town knows of them.
     Theft, assault and the like earn a year in prison, plus a quarter year per
     known crime and a year per 500 gold taken (fifteen at most). Prisoners can
     die there (3% a year, and of old age); freed, they are no outlaws, still
     eyed warily for a while, and go back to adventuring or retire, likelier to
     retire the longer they served and the older and more timid they are.
   - A known murderer is sentenced to death, carried out three to ten days
     later before a crowd, in the live feed and the chronicle.
   - Life stories, the character card and the Halls (Most Wanted, **Behind
     Bars**, **The Gallows**) show it all.
   - Towns put murderers to death by their custom: hanging by default,
     beheading in the Japonic lands, the axe in the Norse north, arrows among
     the elves, the chasm under the dwarven halls, stoning on the steppe.
   - Every step is kept on the character (`Character.justice`), so life
     stories tell it in full however old: turning outlaw, murders and hidden
     bodies, restitution and its cost, capture, escape, who brought them in,
     the trial's place and charges, the sentence and the years left, release,
     and who took their head and who claimed the bounty. A murder victim's
     story tells who killed them and with what, and whether the body was found
     or hidden, and when word got out.
   - Crimes can go unheard of: whether a robbery or murder is pinned on anyone
     depends on witnesses (victims who live, companions, bystanders), how well
     they know the culprit, the place (a town, the wilds, a dungeon) and the
     culprit's stealth; most are still pinned. A murder nobody pins comes out
     after about a year, if ever; with nobody about, the killer may hide the
     body, and the victim is thought to have vanished (most such murders are
     never pinned). Trials only count what is known.
   - Measured (four 20-adventurer worlds, a century): 1–9 taken alive per
     world, then tried; 0–3 executed, a few dying in prison, the rest freed (most
     settling down). About one robbery in six goes unnamed; 1–9 bodies hidden
     and 0–13 murders pinned later per world. At 200 adventurers over 15
     years: 17–19 taken alive, 8–10 jailed, 4 executed and 2–4 dead in prison
     per world.
   - _Exit:_ outlaws' careers end in every way above. In proportion is still
     to tune: hunts rarely kill, so heads stay scarce in small worlds.

9. **Balance and release.** _Done._
   - A prisoner a murder is later pinned on is tried again, for their life.
   - Measured first: careers were mostly short, but a few outlaws outlevelled
     every hunter and ran for 50–90 years with 400–900 crimes, so crime piled
     up on them, and some decades of a small world saw no crime at all.
   - Each crime worth less than the last: rich outlaws lurk less (a haul
     matters less to a full purse); towns close as word spreads (step 4); and
     bounties of 200 or more raise a posse, so the worst draw bands of hunters
     rather than lone ones. Hunters who find their quarry gone may follow a
     fresh trail to somewhere near (likelier with awareness), and a hunted
     outlaw finds it harder to slip away.
   - The long road tells: after two years, an outlaw shut out by the towns
     (twice as likely for a murderer, who can buy no pardon) may flee for
     distant lands, a price still on their head; one nobody knows of may
     simply stop. Restitution takes a year on the road and half a year quiet.
   - Temptation is a little commoner (0.3% a day per good reason, scaled by
     conscience), three times as easy with no outlaw at large and half again
     with one, so every era has outlaws without flooding busy worlds.
   - Measured, eight 20-adventurer worlds over a century: every target holds.
     Crime in every decade; median careers 2.5–4.3 years, 55–97% ending within
     five, at most 132 crimes in one career; no murderer died of old age (0 of
     14); the top outlaw commits 6–12% of a world's crimes; 61–100% of crimes
     have no named victim. Careers end in every way: going straight 3–37 per
     world, heads 0–6, taken alive 2–18 (then tried, a few executed, some
     dying in prison, the rest freed), fled or killed the rest. Town gold and
     prices stay in their 0.2.0 range.
   - At 200 adventurers over 15 years, every target holds but one: in one of
     two worlds only 32% of crimes are nameless, as named travelers crowd the
     roads. Heads come in more often there (9–14 a world, with 23–31 taken
     alive).
   - Still uneven: in small worlds hunters rarely win outright against the
     outlaws they find, so heads stay rarer than captures. A large world runs
     about 10% slower than on 0.2.0.
   - Released as 0.3.0: players' notes, changelog, a save from 0.2.0 kept as a
     fixture (its standing carried over as what the towns have heard).
     (`SAME_HISTORY_SINCE` moved to 0.3.0 with step 2.)

**0.3.1, fixes after release:** a captive is no longer handed over and
sentenced in the same minute; the hand-over takes a few hours and the
prisoner waits three to ten days in jail for the court. And births follow
from conception: couples fall in love and become lovers before marrying,
conceive only on days together, and are expecting for a gestation by their
people (270 days for humans, up to 360 for elves) before the child is born,
with births and populations in the range they had.

## 0.3.2 — Magic you can see

**Goal:** A small fix release, next up: today's magic shown where it matters,
its one useless spell made worth casting, and a magic audit to measure it by,
so 0.5.0 starts from a baseline.

1. **A magic audit.** _Done:_ `npm run audit:magic` (`tools/magic-audit.ts`),
   as the crime audit is for crime: the gifted and casters by people, studied
   casters, casters at once, fights with a cast, casts by spell and outcome and
   who knows each spell, the dread's casts, mastery (arcana) at the end, kills
   by spell, backlash deaths, and how much magic shows at Day speed and up.
   `--blessings` tries other chances of the gift; 0.5.0's rates (humans 7.5%,
   elves 20%, centaurs 5%, dwarves 3%; centaurs since lowered to 4%) were
   tried, with 50% inheritance over a century, results in
   `MAGIC-0.5.0.md` §4, "Second round".
2. **Magic seen.** _Done:_ learning a spell, felling a strong creature (level 4
   and up) by spell, and a death by spell (a killing blow, or a caster's own
   backlash) are _Notable_, so they show at Day, Season and Max speed and
   reach the chronicle. Lesser spell kills name the spell; a backlash is its
   own `magic.backlash` event. Measured first, two of the plan's choices were
   dropped: Notable backlashes (18–25 a world-year, half the chronicle) and
   Notable casts by the dread (up to 50 a year); both stay _Normal_, and their
   deadly ones show as deaths.
3. **Mend Flesh made worth it.** _Done:_ it costs 4 stamina and 1 health
   (before: 4 health), and a hurt caster weighs healing higher, so it is cast
   near half health or lower: 221 casts by 35 who knew it in four 30-year
   worlds, against 94 by 24, and about 1 for every 55 Ember Bolts.
4. **Release 0.3.2:** players' notes, changelog; `SAME_HISTORY_SINCE` moves to
   0.3.2.

## 0.4 — Body and Soul, in three releases

(A working name.) The groundwork magic will stand on, built first as parts
of the world in their own right, each with sources that need no magic:
characters carry lasting effects good and bad, keep a faith, fall ill, are
cursed, fight beside allied beasts, may change shape, see the weather turn
over one place, leave souls that linger or pass, and can be taken and held
for ransom. Each is useful now and is what 0.5.0's magic acts through: buffs
and debuffs on others, divine magic, cures and curses, summoned beasts, beast
forms, weather magic, souls for dark magic, kidnapping for sacrifice.

Nine systems are too many for one release, so they ship in three, each
playable on its own and balanced before the next begins:

- **0.4.0, the body:** lasting effects, faith, illness and curses: what
  happens to a character.
- **0.4.1, beasts and storms:** allies in battle, shapeshifting and local
  weather: what fights and travels beside them.
- **0.4.2, the dead and the taken:** souls and the restless dead, and
  kidnapping: what death and crime leave behind.

Each step is its own pull request and keeps saves loading. Each release adds
to one world audit (`tools/world-audit.ts`), keeps a save from the release
before as a fixture, and holds large worlds to no more than about 10% slower
than 0.3.2.

**Working notes and open questions:** `BODY-AND-SOUL-0.4.md` holds the design
of each system, what is decided, and the open questions, grouped by release,
each with a proposal. A release's questions are settled before its work
begins.

## 0.4.0 — Body and Soul: the body

**Goal:** Characters carry lasting effects, good and bad, keep a faith, fall
ill and are cursed, and all of it is seen.

### Steps

1. **Measure first.** A world audit (`tools/world-audit.ts`) for what 0.4
   touches: deaths by cause and age, time spent hurt or weary, survival in
   delves and fights, population by people, prices of healing goods. It
   records the 0.3.2 baseline, and grows with each step (effects carried,
   illness, curses).

2. **Lasting effects on anyone.** One system of timed effects any character
   can carry, good or bad: on health, stamina, a stat, attack and defense,
   fatigue, nerve. Each has a strength, an end, and a moment from which it
   fades, losing strength bit by bit (as 0.5.0's buffs will). One of each type
   at a time; benefits don't stack, the stronger wins; costs do stack, up to a
   cap. Today's dizziness and stat drains (spell costs) fold into it. A cost
   can be bound to an effect for as long as it lasts. Nerve becomes a modifier
   on when someone flees a fight and how much risk they take in choosing to
   delve, fight or cast. Good effects come from what is rare, costly or lucky:
   a good inn (dearer than the common one), a feast, a night in a home of
   one's own, a particularly good meal, a stroke of luck, and alchemists'
   draughts beyond healing (a tonic of vigor, a calming draught); bad ones
   from a near death (weakened for days) and long marches (exhausted). The
   character card shows them in words, with the time left. Saves move to a new
   version.

3. **Faith.** Everyone has a faith level, from skeptic to devout, set at the
   start by culture, people and traits, and in some towns more than others;
   children take their parents' faith, give or take a little. The grave,
   infernal and dread have none. It grows with prayer at shrines (an existing
   pastime) to the gods of their culture (already in the content), surviving
   an illness, memorable victories and good fortune, by how much depending on
   the person; it falls with crimes (graver ones more), despair and years away
   from shrines; a priest can restore it. Now it steadies nerve in danger and
   makes a shrine's blessing (a small lasting effect, from step 2) stronger.
   Priests are a town-level count (as the trades are) who, for a fee, tend the
   sick, lift curses and restore faith. Faith is never shown as a number: life
   stories name it ("devout", "believer", "skeptic", "corrupted"), and deeds
   hint at it. It is the foundation for divine magic (0.5.0) and a later
   "Religion and Cults" update.

4. **Illness.** A few sicknesses, each a condition with a course: a fever, an
   infected wound (from fighting hurt and untreated), a winter cough, and
   plague. Sickness is commoner in winter. Each town keeps a sickness level
   (raised by the sick, the season and plague, lowered by good remedies and
   wealth); a character rolls to catch it for each day in such a town or in a
   party with someone sick. Some are born hardier than others; the old and
   children resist least. Illness weakens (a lasting effect), lays people up,
   and can kill; about 1 in 5 to 1 in 7 retired adventurers die of it in
   ordinary times. It is cured by rest, by remedies (a new good, made from
   herbs by its own recipe; some healers make better ones and sell them
   dearer), by priests, and in 0.5.0 by magic. Plague comes 2 or 3 times a
   century, of different size and severity: it starts in one town, likelier a
   poor and crowded one, travels the roads, thins the townsfolk counts as well
   as killing named characters, and leaves a town or a region hurt for some
   years. Wealthy towns with good remedies suffer far less than poor ones.

5. **Curses.** A curse is a condition with an effect (ill luck in fights, a
   wasting, a weakness, or the mark, which makes people wary: harder to win
   friends, a party or a spouse; a town's standing stays about known crimes)
   and a way to be lifted. Laid by cursed items found in dungeons, by haunted
   places and the myths about them, by the touch of some undead, by the dread,
   and by a murder victim's dying curse on their killer (about 1 murder in
   10, likelier from the faithful). Characters notice a curse after a while
   and seek help. Lifted by time (minor ones), by priests at shrines (stronger
   with faith), by wise folk in town (rarely, cheaply, unreliably), by getting
   rid of a cursed item, and in 0.5.0 by magic. Cursed items are worth less;
   they can be inherited, and an heir who notices the curse throws or sells
   the item. (Lycanthropy, a curse passed by a bite, comes with shapeshifting
   in 0.4.1.)

   One "hardship" dial at world creation (gentle, normal, harsh) sets how
   much illness and curses there are; old saves and links read as normal.

6. **Seen and told.** The live feed (outbreaks, deaths by illness, curses laid
   and lifted), the chronicle, life stories, the character card (effects,
   illness, curses; faith named in words, never as a number) and the Halls.

7. **Balance and release.** Targets: illness a real but modest share of
   deaths, retired adventurers about 1 in 5 to 1 in 7 dying of it in ordinary
   times, 2 or 3 plagues a century, populations steady with no death spirals;
   curses uncommon; effects felt but not everywhere; large worlds no more than
   about 10% slower. Then release 0.4.0: players' notes, changelog, a 0.3.2
   save as a fixture, the architecture notes.

## 0.4.1 — Body and Soul: beasts and storms

**Goal:** Characters fight beside allied beasts, may change shape, and see
the weather turn over one place.

### Steps

1. **Measure.** The world audit adds allies (bought, tamed, lost), fights won
   and lost with and without them, the afflicted and their kills, and time
   under local weather.

2. **Allies in battle.** Creatures that fight on a character's side: war
   hounds and hawks bought in town, beasts tamed by those with the skill, and
   lords' soldiers riding with a band against a threat. Allies follow their
   owner, fight as ordinary fighters (fights already allow creatures on either
   side), can be hurt and die, and grow more useful as they last. The same
   mechanism carries 0.5.0's summoned beasts.

3. **Shapeshifting.** A form: for a while a character fights with another set
   of numbers, as a beast. The first source is lycanthropy: werewolves as
   creatures, whose bite can pass the curse (a curse, from 0.4.0); the
   afflicted turn under the full moon (a moon cycle on the calendar), lose
   control, may kill (a killing the towns may blame them for, or may not know
   of), and can be cured by priests or wise folk, with luck. The same
   mechanism carries 0.5.0's druid beast forms.

4. **Local weather.** Weather at one place overriding its region's for a
   while: a storm, a fog, a calm, a downpour. Sources now: the dread drawing
   gloom over their lairs and the towns they raid, and rare natural squalls. It
   slows travel, hides ambushes and escapes (fog), spoils or saves a harvest.
   The mechanism carries 0.5.0's weather magic, which will be local and
   costly.

5. **Seen and told.** Allies on the card and in life stories (and mourned when
   they fall), the afflicted's nights and kills, the moon on the calendar,
   weather on the map and in the feed.

6. **Balance and release.** Targets: allies helping without making bands
   unbeatable; lycanthropy rare, a few afflicted a century; local weather felt
   where the dread are without slowing the world. Release 0.4.1 with a 0.4.0
   save as a fixture.

## 0.4.2 — Body and Soul: the dead and the taken

**Goal:** The dead leave souls that linger or pass, and the living can be
taken and held for ransom.

### Steps

1. **Measure.** The world audit adds lingering souls by place, ghosts raised
   and laid to rest, what the dread gain from souls, and kidnappings by how
   they end.

2. **Souls and the restless dead.** When a sapient being dies, their soul
   passes on or lingers: it lingers where many die and lie unburied
   (battlefields, murder sites, hidden bodies, dungeons). Lingering souls
   haunt (ghosts as creatures; myths grow there), and can be laid to rest at
   shrines by priests. The dread feed on them: a lich grows stronger from the
   souls of those its horde slays. Souls are what 0.5.0's dark magic absorbs.

3. **Kidnapping.** Outlaws take people for ransom: mostly the unnamed (a
   traveler off the road, a townsperson from their house), a crime in the
   0.3.0 system; rarely a named character, beaten in a fight and taken, like
   a capture but riskier for the kidnapper. Captives are held at a hideout;
   ransom is asked of their family or town; paid, they are let go; hunters
   may rescue them, and a rescue has a good chance of an immediate bounty on
   the kidnapper. A captive may escape, or die. Much harder than murder, and
   rarer. 0.5.0 turns it to dark magic's sacrifices.

4. **Seen and told.** Haunted places on the map and in place pages, souls laid
   to rest, the dread growing; kidnappings, ransoms, rescues and escapes in
   the feed, life stories, justice records and the Halls.

5. **Balance and release.** Targets: kidnappings rarer than murders, most
   ending in ransom or rescue; haunted places a handful per world, not
   everywhere; liches stronger but beatable. Release 0.4.2 with a 0.4.1 save
   as a fixture, and the architecture notes for all of 0.4.

## 0.5.0 — The Magic Update

**Goal:** Magic of five kinds (high, divine, druidic, dark and low), each
learned its own way, held by different peoples, with its own effects and
costs; used every day as well as in battle, on others as well as oneself;
mastered over a lifetime; and woven into society, with holy and dark magic at
odds and dark magic leading some down the road to murder.

**Why:** magic as of 0.3.1 is one skill and eight spells, cast only in fights
and only for oneself, by a handful of mages, and hidden at most speeds. The
working notes (`MAGIC-0.5.0.md`) record how it works now, what was measured,
the nine limits and issues, the design in full, every decision taken, and
what it needs of the world. It is built on 0.3.2 (magic seen and measured) and
the three 0.4 releases: 0.4.0 (lasting effects, faith, illness, curses), 0.4.1
(allies, shapeshifting, local weather) and 0.4.2 (souls, kidnapping).

Each step is its own pull request, keeps saves loading, and is checked with
the magic audit.

### Steps

1. **Measure again.** The magic audit (from 0.3.2) grows to the five kinds:
   who holds each and how (blessing, study, faith, nature, affinity), by
   people and culture; spells learned, cast and mastered, by kind and effect;
   casts in and out of combat and on whom; effects carried, faded and
   backfired; costs felt; dark casters, sacrifices and corruption. It records
   the 0.4.2 baseline.

2. **Five kinds of magic, and who holds them.** High, divine, druidic, dark
   and low magic as content, each with how it is obtained and how hard it is
   to learn. Each culture's affinities (druidic for the sylvan, low and high
   for the deephold, dark for the grave and infernal, and so on: see the
   working notes) make its people likelier to take up and be blessed in
   certain kinds; any people may learn any kind, except that the grave and
   infernal can never learn divine. Blessings at birth by people (humans 7.5%,
   elves 20%, centaurs 4%, dwarves 3%, confirmed by the 0.3.2 audit), half of
   them passed on to children, of a kind drawn by culture. Faith (from 0.4.0)
   for divine magic. Nobody may hold both holy and dark. The world's magic
   setting stays one dial. The eight spells keep their names, catalogued under
   kinds, so saves and old events still read; content packs get defaults.
   Saves move to a new version; the old gift and arcana map onto the new.

3. **Ways to learn, and mastery.** High magic only by study (academies,
   spellbooks, teachers), slow and demanding logic and willpower; divine by
   blessing or strong faith, grown by devotion and vows, and only for the clean
   of crime and sin; druidic by blessing, study or a bond with nature (time in
   the wilds); dark by a dark blessing or study; low by simple learning or an
   affinity. Many spells of many kinds may be learned in one life, but breadth
   costs depth. Mastery is per spell: study and time bring up to about half of
   it; the rest only comes from casting it; years of disuse wear it down. A
   mage who gives their life to it, an elf above all, becomes formidable.

4. **Spells, effects and costs.** On top of 0.4's lasting effects, allies,
   forms and local weather: healing and buffing others and the whole party,
   debuffs, area spells, illusions, curses and their lifting, cures, easing
   fatigue, summoned beasts, beast forms, weather. One effect of each type at a
   time, never stacking. Costs by kind, always something, and lasting as long
   as the effect (a six-hour buff leaves its caster weakened for six hours).
   Effects fade before they end, from a moment set by mastery (a weak mage's
   six-hour buff starts fading after two hours, a strong mage's after five).
   Any spell may backfire, doing the opposite of what was meant (about 5%,
   likelier for the inexperienced, the weak in power, the cursed and the
   debuffed; never zero). High magic needs casting time and concentration, and
   a blow can break it. Spells for each kind, flavored by culture.

5. **Magic in everyday life.** Casting outside combat: healing after a fight,
   easing fatigue on the road, curing the sick, a party buff before a delve
   that lasts hours, low magic in town (healing rites, lifting curses, burning
   a lock of hair to sever a bond, voodoo against a grudge that leaves its
   target weaker in their next fight), druids turning the weather over one
   place at a steep cost. Townsfolk practice low magic in aggregate (wise folk
   per town, by the culture's affinity), weakly and rarely: blessing a liked or
   famous adventurer, and trying to curse a visiting outlaw or controversial
   figure (about 1 in 20 visits), leaving them slightly weaker for a few hours.
   Herbalists' and alchemists' magic is of a higher quality than the average
   adventurer's, so their trade stays worth paying for.

6. **Magic in battle.** Party heals and buffs, debuffs and area spells; high
   magic's concentration and the risk of being cut down mid-spell; divine
   magic strong against demons and the undead, its casters central to bands
   against the dread and so the dread's first targets; dark magic's
   destruction, and its power to restore the undead and demons; wild beasts
   called to fight; a druid's beast form. Creatures that cast: intelligent
   creatures now and then, weakly and in kinds that suit them (some skeletons
   with basic dark spells), never beasts like a giant rat; bosses, demons and
   undead above all, likely to, and with decent power.

7. **Holy and dark in society.** Most humanoid peoples fear dark magic.
   Shunning goes through the towns' standing, weighed against all that is
   known of the caster: some command of dark magic makes them suspected, a
   known dark mage is unwelcome in most places, only one known to have killed
   or sacrificed for power is barred, and heroic deeds can win some
   neutrality. Dark magic grows by absorbing souls (0.4.2) of the dead
   (humans, dwarves, elves, centaurs, high-level demons) and through rituals,
   sacrifice and murder, so a dark caster who prizes their power may turn
   outlaw. Sacrifices come through 0.4.2's kidnapping: mostly unnamed people,
   much harder than murder, a rescue likely to raise a bounty at once; very
   rarely an adventurer beaten and taken (more dangerous for the dark mage
   than a hunter's capture). An adventurer's soul is worth far more than a
   townsperson's, a mage's more, a divine mage's most. Told with restraint but
   plainly: the feed makes clear someone was sacrificed, and a dark mage's
   life story counts their sacrifices. Holy and dark casters almost never
   befriend each other. Divine power follows faith and morality: small crimes
   make it fade until time, penance, prayer and restitution bring it back; the
   deliberate murder of an innocent takes it away (over 90%) or corrupts it
   into dark magic (under 10%, by knowledge and traits). Illusions can help an
   outlaw slip past a barred gate or go unrecognized, but cost, can be seen
   through, wear off and give them away when they fail, so nobody stays
   uncaught forever.

8. **Seen and told.** Every kind of magic in the live feed, colored by kind;
   great spells, backfires, sacrifices and corruptions in the chronicle; life
   stories, the character card and the Halls (great mages) show each
   character's kinds of magic, their mastery and their deeds.

9. **Balance and release.** Targets across world sizes: mages in every world,
   of every kind where its peoples live, dark casters rare; blessing rates
   confirmed; magic in a fair share of fights and of everyday life; costs that
   bite (backfires, fading and lingering weakness felt, deaths rare but real);
   a lifelong mage outclassing a young one; the world's magic setting meaning
   more than gift odds; no power creep in deaths, delves or the healing trade.
   Then release 0.5.0: players' notes, changelog, a 0.4.2 save kept as a
   fixture, the architecture notes, `WORLD.md` §4 rewritten, and the working
   notes retired.

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
