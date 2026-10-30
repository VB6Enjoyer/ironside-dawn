# World Design

This is the setting bible: what the world is, who lives in it, and the rules
that make it feel the way it should. Technical design is in
[`ARCHITECTURE.md`](ARCHITECTURE.md); the build order is in
[`ROADMAP.md`](ROADMAP.md).

---

## 1. Setting and tone

**Medieval, low-ish fantasy.** The world is grounded: steel, horses, plague,
bad roads, and long winters. A sword wound can kill anyone, heroes included.

- **Magic is real but rare and expensive.** Few people can cast at all, and
  every spell costs the caster something (§4).
- **Many peoples, little mixing.** Humans, elves, dwarves, centaurs, demons,
  undead and more each mostly keep to their own lands, kin, and tongues.
- **No one is good by species.** Some peoples lean toward malice, but any
  individual can be a saint, a bandit, or a murderer (§3).
- **The year has four seasons** of 90 days each: Thaw, Highsun, Harvest and
  Deepwinter. Seasons will matter for travel, harvests and creatures (Phase 9).
- **Mythology grows in later.** The world is divided into regions inspired by
  real-world civilizations, each with its own myths, creatures, weapons, and
  magic (§6). This comes after the core loop works.

---

## 2. Beings: peoples and creatures

There are two kinds of beings. The split matters for both design and
performance.

|          | **Peoples** (sapient)                                                    | **Creatures**                                                     |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Examples | Humans, elves, dwarves, centaurs, demons, liches, revenants              | Wolves, wargs, giant spiders, skeletons, zombies, imps            |
| Model    | Full **Character**: personality, memory, relationships, skills, language | Lighter **Creature**: species template, stats, behavior instincts |
| Can be   | Adventurer, merchant, bandit, lord, warlock, boss…                       | Prey, threat, beast of burden, a dungeon's population             |

Every sapient being uses the same Character model, whether it is a human
adventurer, an elven archer, a bandit chief, or a demon warlord. Nobody is
hard-coded as "enemy". Hostility comes from attitudes, morality, and history
(§3). A bandit human and a demon raider are both just characters whose
choices make them dangerous.

### Initial peoples

| People               | Leaning                | Homelands                     | Notes                                                                                      |
| -------------------- | ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| **Humans**           | Varied                 | Plains, river valleys, coasts | Most numerous and adaptable. Short-lived, quick to breed and to quarrel.                   |
| **Elves**            | Mostly benign, aloof   | Old forests                   | Long-lived, slow to trust. Above-average magical aptitude.                                 |
| **Dwarves**          | Mostly benign, insular | Mountains, deep halls         | Hardy, long memories (grudges included). Master smiths.                                    |
| **Centaurs**         | Varied, tribal         | Steppes, open grassland       | Fast travelers, natural caravan guards or raiders.                                         |
| **Demons**           | Malevolent by nature   | Blighted wastes, rifts        | Strong, cruel, often magically gifted. Mostly appear as raiders, cult masters, and bosses. |
| **Undead (sapient)** | Malevolent by nature   | Barrows, ruined cities        | Liches and revenants: ageless, patient, and they remember everything.                      |

The **lesser undead** (skeletons, zombies) and **lesser demons** (imps,
hounds) are _creatures_, not characters. They are often under the command of a
sapient one.

More peoples come later (candidates: orcs, goblins, halflings, giants,
merfolk), along with the region-specific ones from §6.

### What a species defines (data, not code)

- Stat modifiers and body traits (size, speed, darkvision…).
- Lifespan and aging curve. Undead don't age.
- Homeland biomes and typical settlement types.
- Native language(s).
- **Baseline attitudes** toward each other species, e.g. dwarves → elves:
  wary; everyone → demons: hostile.
- **Disposition distribution**: where individuals tend to land on the morality
  traits (§3).
- Magical aptitude: the chance of being born with the gift.

---

## 3. Morality, outlaws, and hostility

Species shift the odds; individuals decide.

- Each character has **morality traits** (e.g. compassion ↔ cruelty, honor ↔
  treachery) in addition to the rest of their personality. A species' disposition
  shifts the _distribution_ those traits are rolled from. It doesn't fix
  them.
  - Most humans are decent. Some are not.
  - Demons and the sapient undead are malevolent by nature: their
    distributions sit far toward cruelty. (Whether rare exceptions should be
    possible is an open question, §7.)
- **Circumstances push people.** Poverty, greed, a lost family, or a grudge
  combined with low honor can turn a failing adventurer into a **bandit**,
  **thief**, or **murderer**. Success, friendship, and a home can pull someone
  back toward a decent life.
- **Consequences**: crimes damage reputation, towns post **bounties**, and
  bounty hunters and wronged friends come looking. An outlaw may die, hide,
  lead a gang, or (rarely) go straight.
- **Hostility between two beings** is computed, never a fixed flag:
  `species attitude + personal morality + their relationship + whether they share a language`.
  Two strangers of different peoples who can't understand each other are far
  more likely to come to blows.

---

## 4. Magic

**Magic is a high-risk, high-reward tool.** It can turn a fight, and it can
also wreck the caster.

### Who can cast

Casting requires the **Arcana** skill, which comes from one of two sources:

1. **Study**: slow learning from mentors, tomes, or academies found only in
   certain places (in the starter world, Concordale and Saltmere). Only the
   clever or spiritual bother, and it takes years.
2. **The gift**: an innate aptitude rolled at birth. It is rare, and the rate
   varies by species (elves and demons more often, humans less). Gifted
   characters learn faster, can cast earlier, and are sometimes dangerous to
   themselves.

### The cost

Every spell has a **cost profile**: one or more prices paid on casting.

| Cost           | Effect                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Stamina**    | Drains the stamina pool (also used for fighting and travel). Running out means collapse. |
| **Health**     | Direct HP loss. Blood magic.                                                             |
| **Stat drain** | Temporary loss of an attribute (e.g. −Dexterity for hours: shaking hands, clumsy blade). |
| **Dizziness**  | A status effect: penalties to accuracy, defense, and further casting.                    |

Possible later additions: _exhaustion_ that lasts days, _madness_ or
_corruption_ from forbidden arts, and _permanent scars_ from catastrophic
backlash.

Cost scales up with the spell's power and down with the caster's mastery. A
novice pays dearly for a spark, while an archmage shrugs off the same spark
but still bleeds for the big spells.

### Casting

A casting roll (Arcana vs. spell difficulty, modified by current condition)
gives one of these outcomes:

- **Success**: the effect lands and the cost is paid.
- **Partial**: a weaker effect, full cost.
- **Failure**: no effect, cost paid anyway.
- **Backlash**: no effect, and an extra cost is paid on top.

Casting while already dizzy or drained makes backlash more likely, which is
where the gamble gets interesting.

### Example spells (first pass)

| Spell       | Effect                              | Cost                      |
| ----------- | ----------------------------------- | ------------------------- |
| Ember Bolt  | Fire damage to one foe              | Stamina + Dizziness       |
| Mend Flesh  | Heals a target                      | The caster's own Health   |
| Quickening  | Big speed/agility boost for a fight | Dexterity drain afterward |
| Ward of Ash | Absorbs incoming damage             | Stamina, heavy            |

### Why this works for the simulation

The utility AI (`ARCHITECTURE.md` §4.5) weighs a spell's expected payoff
against its cost given the caster's current state. That produces believable
behavior without scripting: cautious mages hold back, reckless ones
gamble, and a desperate caster with 3 HP throws a spell that might kill them.
That last one makes a good log line.

---

## 5. Regions, separation, and languages

### Peoples keep to themselves

- Each people has **homeland regions**. Settlements are mostly
  single-species.
- **Mixed places are rare and notable**: border trade towns, mercenary
  companies, and outlaw camps where nobody asks questions.
- Characters **prefer their own kind** when socializing, forming parties, and
  marrying. Familiarity can overcome that over time, and those cross-species
  friendships are the stories worth watching.

### Language as a skill

- Every people (and later every culture) has a **native language**.
  Proficiency in each language is a skill from 0 to 100.
- Language affects:
  - **Encounters**: whether a tense meeting can be talked down (parley,
    surrender, bribe, warning) or turns into a fight.
  - **Trade**: whether a deal happens, and at what price (Phase 7).
  - **Bonds**: friendship and courtship across a language barrier are slow and
    rare.
  - **Information**: rumors, directions, and warnings only travel to those who
    understand them.
- Languages are learned through **exposure** (time spent among speakers) and
  **teaching**. A dwarf caravan guard who has spent ten years on the elven
  roads will eventually be able to haggle in Elvish.
- Open question: is there a **trade tongue** (a pidgin spoken badly by many
  merchants), or does it emerge naturally? (§7)

---

## 6. Cultures and mythology (later phases)

The long-term vision: the generated world is made of **regions inspired by
real-world civilizations, past and present**, each with its own mythology and
culture. That flavor runs through names, weapons, creatures, magic, and
beliefs.

Each region is defined by a **culture pack** (pure data):

- **Name generators** for people, places, and things.
- **Arms and armor** tables (a Japonic region favors katana, naginata, yumi).
- **Bestiary**: region-native creatures and peoples (youkai in a Japonic
  region).
- **Magic tradition**: what magic looks like there and which spells and costs
  are common.
- **Myths and deities**: who is worshipped and feared, and the legends people
  tell.
- **Settlement and architecture vocabulary** for location names and
  descriptions.

### Sketches (illustrative, not final)

| Inspiration      | Arms                               | Creatures & peoples                                | Magic flavor                                  |
| ---------------- | ---------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| **Japonic**      | Katana, naginata, yumi             | Kitsune, kappa, oni, tengu, yūrei                  | Talismans and wards, onmyōdō-style divination |
| **Norse**        | Sword, axe, seax, spear            | Draugr, trolls, jötnar, dvergar, álfar             | Runes, seiðr                                  |
| **Hellenic**     | Xiphos, dory, aspis                | Centaurs, harpies, cyclopes, satyrs                | Oracles, mystery cults                        |
| **Slavic**       | Axe, sabre, flail                  | Leshy, rusalka, domovoi, witches of the deep woods | Folk charms, hexes                            |
| **Mesopotamian** | Sickle-sword, spear, composite bow | Lamassu, utukku, lilitu                            | Incantations, clay-tablet wards               |

A species can appear in several cultures with local variation. Norse
_dvergar_ and _álfar_ are local takes on dwarves and elves, and centaurs
naturally belong to a Hellenic-inspired region.

**Principles:** _inspired by_, not historical simulation. Draw on real myths
with respect and avoid caricature. Every region should feel like its own place,
not a costume.

### Hooks built in from day one

Cultures come late, but the plumbing comes early so they don't require a
rewrite:

- Every content entry (name list, weapon, creature, spell) carries a **culture
  tag**. Generators take a culture as input.
- Phase 1 ships **one** culture (generic medieval) so the code path exists
  and gets exercised from the start.
- Characters carry both `species` and `culture` from Phase 1. Species is
  biology, culture is upbringing: an orphaned elf raised among humans carries
  a human blade.

---

## 7. Open world questions

1. Can a demon or sapient undead ever be benevolent (very rarely), or is their
   nature absolute?
2. Is there a common trade tongue, or only native languages plus whatever
   characters learn?
3. Which peoples join after the initial six?
4. **Gods**: are they real (divine magic, miracles, avatars) or only believed
   in? This affects mythology, religion, and the magic system.
5. Should magic be able to cause **permanent** harm (scars, lost limbs,
   madness) on catastrophic backlash?
