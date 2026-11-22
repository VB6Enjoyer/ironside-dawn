# Magic overhaul (0.5.0): working notes

A temporary working document for 0.5.0, the magic update. It records how
magic works today and what is wrong with it, and the design for what replaces
it, in full. The plan in steps is in `ROADMAP.md` (0.5.0). When 0.5.0 ships,
what was built moves into `WORLD.md` §4 and `ARCHITECTURE.md`, and this file
is retired.

**Scope.** Magic was first planned as 0.4.0. It moved to 0.5.0 so that the
systems it rests on come first, each useful on its own: 0.3.2 makes today's
magic visible and measurable, and 0.4.0 builds illness, curses, lasting
effects on characters, allies in battle, shapeshifting, local weather, souls,
kidnapping and faith (`ROADMAP.md`). Section 3 below lists what 0.5.0 needs
of them.

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

## 2. The design for 0.5.0

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

Most of these are now built first, in 0.4.0 (`ROADMAP.md`); 0.5.0 then puts
magic on top of them.

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
- **Content fields.** Cultures need affinities per kind of magic (with
  defaults for content packs), and creatures a mark of which are intelligent
  and which kinds of magic they may cast.
- **Saves.** One `gifted` flag and one `arcana` skill become several kinds of
  aptitude and skill: a save version bump, and a migration that maps the old
  onto the new (the gifted and their arcana to high magic, most likely).

## 4. Decisions

Settled on 2026-11-22, answering the first round of open questions.

### Affinities by culture

Every people and culture may learn any kind of magic, except that the grave
and infernal can never learn divine magic. Each culture has its own common
affinities, which make its people likelier to take up, and to be blessed in,
certain kinds. Cultures' traditions are flavors within the five kinds, not
kinds of their own.

| Culture  | Leans to                                         | Notes                                                        |
| -------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Generic  | no real affinity; slightly more for low and high |                                                              |
| Sylvan   | druidic, strongly; dark, slightly                |                                                              |
| Deephold | low and high; less for the other three           | Less given to magic overall: dwarves are rarely mages.       |
| Steppe   | druidic and high                                 | Less given to magic than elves or humans, more than dwarves. |
| Japonic  | druidic (less than sylvan); divine, slightly     |                                                              |
| Norse    | low and divine (pagan), slightly; dark, a little | Divine may later split into sub-types (pagan among them).    |
| Grave    | dark, very strongly                              | Can never learn divine magic.                                |
| Infernal | dark, very strongly                              | Can never learn divine magic.                                |

Content packs that add cultures will need to say their affinities; a culture
that doesn't gets the generic ones.

The traditions already in the game become flavored spells within the kinds.
A first proposal, to review when spells are written: Foxfire (spirit-fire) as
druidic, Ofuda Ward as divine, Thunder Rune as divine (pagan), Rune of
Warding as low.

### Blessings, and the world's setting

- ~~**Blessings are rare:** about 1 in 100 adventurers is born blessed.~~
  Superseded in the second round: a rate by people.
- **Half pass on:** a child of a blessed character has a 50% chance of being
  born with the same blessing.
- **One dial for now:** the world's magic setting stays a single dial. A dial
  per kind of magic comes later.

### Low magic among the townsfolk

- **Yes: townsfolk can practice low magic** (village wise folk), which makes
  it the most common magic in the world. Their success rate and power are
  low.
- **They may help or hinder adventurers:** healing or buffing adventurers they
  like or who are famous, cursing or debuffing outlaws and controversial
  figures.
- **This is rare, not common.** For example, when an outlaw visits a town, its
  people might try to curse them, leaving them slightly weaker in battle for a
  few hours: about a 1 in 20 chance.

### A divine caster who sins

It depends on the sin.

- **Small crimes** (theft, vandalism and the like) make divine power fade. It
  takes time, penance, prayer and restitution to return to its former
  strength.
- **The deliberate murder of an innocent** makes divine power vanish entirely,
  with a high chance (over 90%), or, with a low chance (under 10%, depending on
  the caster's knowledge and traits), corrupts it into dark magic.
- The religions update may deepen this later.

### Shunning dark casters

Dark casters are judged through the same standing towns already keep
(suspected, unwelcome, barred), weighed against everything else known of them.

- **Some command of dark magic** makes someone suspected.
- **A known dark mage** becomes unwelcome in most places.
- **Barred** only if known to have killed or sacrificed people to feed their
  power.
- **Weighed against known deeds:** a dark mage known for rightful or heroic
  acts may be seen with some neutrality.

### Creatures that cast

- **Regular intelligent creatures** may have a low chance of using certain
  kinds of magic: some skeletons cast very basic dark spells, for instance.
  Unintelligent creatures never do: a giant rat cannot use magic. Creatures
  will need a mark of which are intelligent, and which kinds they may cast.
- **Bosses**, demons and undead above all, are quite likely to know magic, and
  with decent power.

### Second round (2026-11-22)

#### Blessings

- **The blessing rate rises instead,** by people: humans 7.5%, elves 20%,
  centaurs 5%, dwarves 3%. These replace the earlier "1 in 100", and are to be
  tested with the magic audit before they are confirmed as final.
- A child of a blessed character still has a 50% chance of the same blessing.

#### Against power creep

- **One effect of each type at a time; effects don't stack.**
- **The cost lasts as long as the effect:** a buff that lasts six hours leaves
  its caster weakened or sluggish for six hours.
- **Effects fade before they end.** Each lasting effect has a moment after
  which it starts to fade, set by the caster's mastery, losing strength bit by
  bit until it is gone. For example, a buff of +20 health for 6 hours: cast by
  a weak mage, it starts to fade after 2 hours, losing 1 health every few
  minutes; cast by a strong mage, it holds full for 5 hours.
- **Backfire.** Besides failing, a spell can backfire: it does the opposite of
  what was meant (a +20 health buff becomes a −20 debuff; a bolt meant for a
  foe strikes the caster). About 5% by default, made likelier by lack of
  experience or arcane power, by curses, by debuffs and the like, and less
  likely the more power and experience a mage has. It never goes away
  entirely: a deterrent against using magic casually. (This is apart from the
  backlash of today's system, a failure that costs double.)
- **Herbalists and alchemists:** the trades' own magic is of a higher average
  quality than an adventurer's, which justifies the trade (what they brew and
  tend is worth buying even for those who cast).

#### Performance

- Agreed: effects are statuses with an end time, checked lazily; casting
  outside combat is one more option in the existing decisions, not a separate
  pass; speed is measured at every step.

#### Old spells and content packs

- **The eight spells keep their names,** so saves, deeds and old live-feed
  events still read. Each is catalogued under a kind of magic (a first
  proposal is in "Affinities by culture" above; the four generic ones under
  high magic).
- **Content packs** are dealt with as they come: new fields get defaults.

#### Townsfolk's magic, in aggregate

- Townsfolk aren't simulated moment to moment, so wise folk are a town-level
  count, as the trades are, set by the culture's low-magic affinity. They act
  as the town: toward a visiting outlaw, a famous or well-liked adventurer.

#### Mastery

- **Mastery is per spell,** and grows with study, use and the passage of time.
- **Breadth costs depth:** an experienced mage may learn many spells of many
  kinds, but is then unlikely to master any.
- **Passive means reach about half:** up to about 50% of a spell's mastery
  comes from study and time; beyond that, only from actively casting it.
- **Disuse wears it down:** years without casting a spell lower a mage's
  proficiency with it, so nobody keeps full mastery of a spell they have long
  stopped using.

#### Faith

- Tied to what exists: faith grows by prayer at shrines, to the gods of the
  character's culture. This is the springboard for a future "Religion and
  Cults" update. (Faith itself is built in 0.4.0.)

#### Dark magic's victims

- **Through the crime system:** most sacrifices are unnamed people taken from
  towns or the roads, a crime like those of 0.3.0, raising notoriety and
  bounties; named victims now and then.
- **Kidnapping is hard,** much harder than murder.
- **A rescued victim makes a bounty:** if someone kidnapped is rescued, a
  bounty on the kidnapper has a good chance of being posted at once.
- **A dark mage may capture an adventurer,** very rarely, after beating them in
  a fight: like a bounty hunter taking an outlaw alive, but a little more
  dangerous for the dark mage.
- **The worth of a sacrifice:** an adventurer gives far more power than a
  townsperson; a mage far more still; a divine mage most of all.

#### Tone

- Restrained, as the crime lines are, but the player must be able to tell
  what happened: the common word may be "they were never seen again", but the
  live feed makes it clear the person was sacrificed.
- A dark mage's life story counts their sacrifices ("sacrificed seven people
  to the dark gods", or whatever fits the lore).

#### Divine casters against the dread

- Divine casters are central to bands against the dread, and more vulnerable
  for it: the dread target them first.

#### Illusions and outlaws

- Illusion magic can help outlaws (slipping into a town that bars them, going
  unrecognized at a crime), but must not let an outlaw go uncaught forever:
  it costs, can be seen through, wears off, and a failure gives them away.

#### Weather

- Local, never a whole region, and quite costly.

#### Summoned beasts and beast forms

- Built on the combat engine as it is: beasts join the caster's side as
  ordinary fighters, and a beast form swaps the caster's fighting numbers for
  a while. (The mechanisms are built in 0.4.0.)

## 5. Open questions

What is left, with how it was read until decided otherwise.

- **Which kind a blessing is.** Read as: the chance of a blessing is by people
  (second round), and its kind is drawn by the culture's affinities (so a
  blessed elf is most likely druidic). The dread and bosses are apart from it
  (see creatures that cast).
- **What an affinity does exactly.** Read as: it makes a character likelier to
  take an interest in a kind (to study it, to seek it out), quicker to learn
  it, and likelier to be blessed in it.
- **How many blessings one person may have.** Read as: at most one at birth;
  any number of kinds may be learned later (never both holy and dark).
