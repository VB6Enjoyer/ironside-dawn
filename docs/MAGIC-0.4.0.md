# Magic overhaul (0.4.0): working notes

A temporary working document for 0.4.0, the magic update. It records how
magic works today and what is wrong with it, and the design for what replaces
it, in full. The plan in steps is in `ROADMAP.md` (0.4.0). When 0.4.0 ships,
what was built moves into `WORLD.md` §4 and `ARCHITECTURE.md`, and this file
is retired.

---

## 1. Magic as of 0.3.1

### How it works

- **The gift**, rolled at birth: humans 5%, elves 18%, dwarves 3%, centaurs
  6%, liches always, demons 50% (`src/content/species.ts`, `giftChance`). The
  world's magic setting scales it (rare ×0.4, normal ×1, common ×2.5), and a
  child of a gifted parent has it 35% of the time (`src/sim/gen/people.ts`).
  The setting changes nothing else.
- **Arcana**, one skill from 0 to 100, is all casting rests on. The gifted
  start at 15–30; everyone else at 0.
- **Study** is the only other way in: the `study` pastime, only in a town with
  an academy (25–60% of towns, by biome), only for the gifted or someone with
  wits or spirit 14 or more. It gives 0.25 arcana an hour (twice for the
  gifted). Each cast adds 0.3.
- **Learning is automatic**: on reaching a spell's arcana threshold, it is
  learned (`learnSpells` in `src/sim/systems/magic.ts`). No teachers, books or
  choices. Generic spells and the caster's own culture's tradition only.
- **Eight spells** in four kinds of effect (`src/content/spells.ts`):
  - Generic: Ember Bolt (damage 2d6, arcana 15), Mend Flesh (heals the caster,
    paid in their own health, 25), Quickening (+2 attack and defense for the
    fight, 35), Ward of Ash (absorbs damage, 45).
  - Japonic: Foxfire (damage, 20), Ofuda Ward (ward, 40).
  - Norse: Thunder Rune (damage 2d8, 30), Rune of Warding (ward, 40).
  - Content packs may add spells, but only of the same four kinds: damage,
    heal, quicken, ward.
- **Casting**: d20 plus arcana/10, spirit modifier, +1 if gifted, less for
  being dizzy, drained or wounded, against the spell's difficulty: success,
  partial (half effect), failure, or backlash (a natural 1, wider when dizzy
  or drained). Costs: stamina, health, a temporary stat drain, dizziness;
  mastery cuts them to as little as 40%. A backlash doubles the costs, burns
  for 1d6, and can kill.
- **Choosing to cast** (`chooseSpell`): only in a fight, each round; every
  affordable spell is weighed (odds times benefit, less costs and risk) and
  cast if it beats a plain swing.

### Measured (30 years, 20 adventurers; 10 years, 200 adventurers)

|                                    | alpha (20) | bravo (20) | echo (200) |
| ---------------------------------- | ---------- | ---------- | ---------- |
| Gifted, of all who lived           | 4 of 111   | 2 of 91    | 35 of 501  |
| Anyone who ever cast               | 6          | 9          | 44         |
| Spells cast                        | 2,662      | 4,153      | 2,666      |
| Casts by the top 3 casters         | 86%        | 85%        | 30%        |
| Fights with a cast                 | 4.5%       | 6.7%       | 7.2%       |
| Ember Bolt's share of casts        | 83%        | 58%        | 53%        |
| Mend Flesh casts                   | 5          | 64         | 9          |
| Casts by dread masters             | 17         | 1,215      | 112        |
| Backlashes / casters killed by one | ~8% / 0    | ~12% / 1   | ~8% / 0    |
| Living adventurers with arcana     | 3 of 20    | 3 of 20    | 20 of 198  |

### Limits and issues

1. **Hidden.** A cast and a spell learned are _Normal_ events: shown only at
   Real-time, Minute and Hour speed, so at Day, Season, Max or in a skip
   nothing of magic shows. The chronicle (Notable and up) never mentions it,
   not even a killing blow by spell.
2. **A handful of mages.** In a small world 2–9 people ever cast in 30 years,
   and three do 85% of it. Study needs a rare trait and an academy town.
3. **One spell does the work.** Every caster ends up knowing all four generic
   spells, but Ember Bolt is most casts. Healing is self-only and paid in
   health, so it is almost never worth it; Quickening is rare.
4. **Combat only, and only for oneself.** No casting outside fights: no
   healing after one, no help on the road or in delves, nothing for the town.
   No healing, warding or quickening an ally; no area spells.
5. **No creature casts.** Dread masters cast the generic spells; monsters
   never do. Liches and demons have no spells of their own (their cultures
   have no tradition), so a lich throws the same Ember Bolt as an apprentice.
6. **No magical world around it.** No teachers or schools beyond "an academy
   town", no spellbooks, no magic items that cast, no tie to the economy
   (reagents and alchemists only make healing draughts), no standing for
   mages, no forbidden arts.
7. **Learning is automatic**, so there is no specialization: every mage of a
   culture ends up with the same kit, and neither personality nor path shapes
   their magic.
8. **The costs barely bite.** Backlash kills a caster about once a world in
   30 years. `WORLD.md` lists ideas never built: exhaustion lasting days,
   madness or corruption, permanent scars.
9. **The world setting is thin.** "Magic: common" only makes the gift likelier;
   nothing about how strong or dangerous magic is, or who may study it.

**Solid enough to keep:** the d20 roll with partial and backlash outcomes, the
cost profiles, the utility weighing of spells, culture traditions, and spells
from content packs.

---

## 2. The design for 0.4.0

### Five kinds of magic

Each kind of magic has its own difficulty to learn, is concentrated in
different peoples and cultures, and has its own effects, costs and ways of
casting.

#### High Magic

- **Source:** the ambient energy of the universe, ley lines, the fabric of
  reality itself.
- **Learned only by study.** It takes logic and willpower, spellbooks,
  complex gestures, incantations and the like.
- **Highly powerful, highly costly, and slow to learn.**
- **Dangerous to cast in combat**, because it takes a lot of concentration and
  time (casting time; concentration that can be broken).
- **Uses:** damage, healing, buffing, debuffing, illusionism, and more.

#### Divine Magic

- **Source:** a blessing at birth, or strong faith. It can sometimes be
  inherited by the children of the blessed.
- **Cast by petition:** prayer, devotions and vows.
- **Requires the right personality traits and a life clean of crime and sin.**
- **Mostly healing and buffing; especially powerful against demons and the
  undead.**
- **Its strength depends heavily on the caster's morality and faith.** It is
  not as costly as other kinds, but hard to bring to its full power without a
  life of deep devotion.
- **Faith:** a hidden attribute for now, for those who can use divine magic.
  It will matter for a later religions and cults update.

#### Druidic Magic

- **Source:** nature: control of the earth, animals, spirits and seasons.
- **Especially common among elves.**
- **Obtained by** a blessing, by study, or through a connection with nature.
- **Uses:** healing; turning living beings to one's side (wild beasts aiding
  in battle); shapeshifting; weather manipulation.

#### Dark Magic

- **Source and nature:** death, decay, sacrifice, pain, and dark dimensions.
- **Especially common among the undead and demons**, but possible for certain
  individuals born with a dark blessing. Those born able to cast it should be
  _very_ few.
- **Obtained by** a dark blessing at birth, or by study.
- **Great destructive power, and restorative power for the undead and
  demons.**
- **Grows by absorbing the souls of the dead:** humans, dwarves, elves,
  centaurs, and high-level demons. Also by dark rituals, sacrifices and
  murder, which are among the main ways to improve it.
- **Seen as immoral and dangerous by most humanoid peoples:** its casters are
  usually shunned, or at least treated with caution, whether they were born
  with it or chose to learn or use it.
- **The road to crime:** a dark caster whose traits make them value their
  magical career highly is likelier to become an outlaw, murdering, or
  kidnapping people for sacrifice.

#### Low Magic

- **Source:** hidden connections between objects, words and intentions.
- **Mundane and not hard to learn, but very inefficient, prone to fail, and of
  little use.** Only a few casters reach a decent success rate or decent
  effects. Much inferior to the other kinds.
- **Obtained by** learning it, or by being born with certain affinities.
- **Folk magic, used in everyday life, with small effects:** voodoo, healing
  rituals, curse removal, burning a lock of hair to sever a bond, and the like.
- **Examples:** curing an illness; a debuff, such as a voodoo spell on someone
  a character holds a grudge against, leaving them slightly weaker in their
  next fight.

### Holy and dark are opposites

- Divine (holy) and dark magic are polar opposites and cannot coexist.
- **Nobody can learn both.**
- **Casters of the two are very unlikely ever to form a positive
  relationship.**

### Magic in everyday life

- Magic becomes commonplace in day-to-day life, used outside combat by those
  who can cast: curing illness, healing, easing fatigue, and more.
- **Restoring and buffing, of oneself or of party members, in combat or out
  of it.** For example, a caster raises a health buff on their party before
  entering a dungeon, lasting a few hours, at the cost of leaving themselves
  weaker or sluggish.
- **Magic must always cost something,** so it is never an easy way out of
  everything.

### Learning and mastery

- **Several kinds in one life:** a character may learn several kinds of
  magic over their life, given the blessings and/or the interest and the time
  to study (never both holy and dark).
- **Mastery grows with study, use and years:** the more someone studies a
  kind of magic, the more they use it, and the longer they have known it, the
  less casting costs them, the likelier their spells succeed, and the stronger
  their effects.
- **Lifelong mages:** a character who gives their life to magic can become a
  very strong mage. Elves in particular, with their long lives.

---

## 3. What the design needs that the world doesn't have yet

Found while writing the above down; each is folded into a step of the plan.

- **Illness.** Curing illness needs illnesses: today there are wounds,
  exhaustion, dizziness and stat drains, but no sickness. A simple model (a
  fever, an infected wound, a wasting curse) gives the healing kinds something
  to cure.
- **Curses.** Curse removal and voodoo need curses as a condition, laid by
  low or dark magic and lifted by low, divine or druidic.
- **Lasting effects on others.** Buffs and debuffs that outlast a fight (the
  party buff before a delve, the voodoo before a fight) need timed statuses
  that anyone can carry, not only the caster.
- **Targets.** Spells today hit one foe or the caster. Allies, the whole
  party, all foes, and someone far away (voodoo) are new.
- **Casting time and concentration**, for high magic: a spell that takes
  rounds, and can be broken by a blow.
- **Summoned allies.** Beasts aiding in battle need creatures fighting on a
  character's side; fights already allow creatures on either side.
- **Shapeshifting.** A druid in beast form: a different set of fighting
  numbers for a while.
- **Weather.** The world already has seasonal weather by region; a druid
  turning it is new.
- **Souls.** Dark magic grows by taking souls of the dead: who died near a
  dark caster, and of what people.
- **Kidnapping.** Taking someone alive for a sacrifice can reuse the capture
  of 0.3.0 (traps, takedowns, escorts), turned to a dark caster's ends.
- **Faith.** A hidden attribute, and what raises or lowers it: devotion
  (prayer at shrines, a pastime that exists), vows, sin (any crime).
- **Saves.** One `gifted` flag and one `arcana` skill become several kinds of
  aptitude and skill: a save version bump, and a migration that maps the old
  onto the new (the gifted and their arcana to high magic, most likely).

## 4. Open questions

- Which kind of magic each culture leans to (Japonic, Norse, the generic
  lands, the steppe, the deep halls, the grave and infernal), and whether each
  culture's tradition is a kind of its own or flavor within the five.
- How rare each blessing is, by people, and how the world's magic setting
  scales each (one dial, or one per kind).
- Whether low magic is open to townsfolk (village wise-folk who never
  adventure), which would make it the most common magic in the world.
- What becomes of a divine caster who sins: power fading with faith, or lost
  at once; and whether it can be won back by penance (and whether this waits
  for the religions update).
- How far shunning goes for dark casters: the same standing as notoriety
  (suspected, unwelcome, barred), or its own.
- Whether creatures (not only the dread) cast: fey, spirits, shamans of the
  wild peoples.
