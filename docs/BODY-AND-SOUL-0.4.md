# Body and Soul (0.4): working notes

A temporary working document for Body and Soul (a working name), built in
three releases: **0.4.0, the body** (lasting effects, faith, illness, curses),
**0.4.1, beasts and storms** (allies, shapeshifting, local weather) and
**0.4.2, the dead and the taken** (souls, kidnapping). It holds the design for
each system, what is already decided, and every question still open, grouped
by release. The plan in steps is in `ROADMAP.md` (0.4). As each release ships,
what it built moves into `ARCHITECTURE.md` and `WORLD.md`; when 0.4.2 ships,
this file is retired.

**Why this comes before magic.** The magic update (0.5.0, `MAGIC-0.5.0.md`)
needs things the world doesn't have: illness to cure, curses to cast and lift,
effects that can sit on anyone for hours, creatures fighting on a character's
side, other shapes, weather over one place, souls, kidnapping and faith. Each
is built here first, as a part of the world in its own right, with sources
that need no magic; 0.5.0 then puts magic on top.

**Order.** Each release's open questions are settled before its work starts:
0.4.0's first, now that 0.3.2 has shipped.

---

## 1. What every system shares

- **One timed-effect system** (0.4.0, step 2) carries most of it: illness,
  curses, wounds, rest, blessings and tonics are all effects with a strength,
  an end, and a moment from which they fade.
- **Aggregate where people aren't simulated.** Townsfolk live in a daily
  round, not hour by hour, so priests, healers and wise folk are town-level
  counts, like the trades, and act as the town.
- **Saves.** Effects, faith, allies, forms and souls are new state: a save
  version bump in each release that adds state, with a migration and a save
  from the release before kept as a fixture.
- **Speed.** Large worlds no more than about 10% slower than 0.3.2; effects
  checked lazily, never ticked one by one.
- **Seen and told.** Each system gets live-feed lines, chronicle entries for
  what matters, life-story sentences and the card.

## 2. The systems

### Lasting effects (0.4.0, step 2)

Timed effects any character can carry, good or bad, on health, stamina, a
stat, attack and defense, fatigue or nerve. Each has a strength, an end, and a
moment from which it fades bit by bit. One of each type at a time; the
stronger replaces the weaker, never stacking. A cost can be bound to an effect
for as long as it lasts (what 0.5.0's buffs will use).

Sources in 0.4: a night at a good inn (well rested), a tavern feast (good
spirits), lingering wounds after a near death (weakened for days), exhaustion
after long marches, alchemists' tonics (vigor, calm), shrine blessings (with
faith), illness and curses.

### Faith (0.4.0, step 3)

A hidden attribute, 0 to 1. Grows with prayer at shrines to the gods of one's
culture, devout traits, age, and hardship survived; falls with crimes (graver
ones more) and despair. Steadies nerve in danger, strengthens shrine
blessings, and is what priests' help works through. The base for divine magic
(0.5.0) and a later "Religion and Cults" update.

### Illness (0.4.0, step 4)

A few sicknesses with a course: a fever, an infected wound, a winter cough,
and a rare plague that sweeps a town. Caught from untreated wounds, foul
places, the cold season and crowds. They weaken, lay people up and rarely
kill. Cured by rest, herbalists (a new demand for herbs) and priests, and by
magic in 0.5.0.

### Curses (0.4.0, step 5)

A condition with an effect (ill luck in fights, wasting, weakness, a mark that
makes people wary) and a way to be lifted. Laid by cursed dungeon loot,
haunted places, the touch of some undead, the dread, and sometimes a murder
victim's dying curse on their killer. Lifted by time, priests, wise folk, or
destroying the cursed item.

### Allies in battle (0.4.1, step 2)

Creatures fighting on a character's side: war hounds and hawks bought in
town, beasts tamed by those with the skill, and lords' soldiers riding with a
band against a threat. They fight as ordinary fighters, can be hurt and die,
and grow more useful as they last. 0.5.0's summoned beasts reuse this.

### Shapeshifting (0.4.1, step 3)

A form: another set of fighting numbers for a while. First source:
lycanthropy. Werewolves as creatures, whose bite can pass the curse; the
afflicted turn under the full moon, lose control, may kill, and can be cured
with luck. 0.5.0's druid beast forms reuse the mechanism.

### Local weather (0.4.1, step 4)

Weather at one place overriding its region's for a while: storm, fog, calm,
downpour. Sources: the dread drawing gloom over their lairs and the towns they
raid, and rare natural squalls. It slows travel, hides ambushes and escapes,
spoils or saves a harvest. 0.5.0's weather magic reuses it, local and costly.

### Souls and the restless dead (0.4.2, step 2)

A sapient being's soul passes on or lingers when they die: lingering where
many die unburied (battlefields, murder sites, hidden bodies, dungeons).
Lingering souls haunt (ghosts; myths grow) and can be laid to rest by priests.
The dread feed on them. Dark magic absorbs them in 0.5.0.

### Kidnapping (0.4.2, step 3)

Outlaws take people for ransom: mostly the unnamed (a traveler, a
townsperson), rarely a named character beaten in a fight and taken, riskier
for the kidnapper than a hunter's capture. Held at a hideout; ransom asked of
family or town; let go when paid; rescued by hunters, a rescue likely to
raise an immediate bounty; a captive may escape or die. Much harder and rarer
than murder. 0.5.0 turns it to sacrifice.

## 3. Decided so far

- **Built first, magic later:** each system has non-magical sources in 0.4.
- **Effects never stack; one of each type; they fade before they end; a cost
  can last as long as an effect** (from the magic decisions, built here).
- **Townsfolk's helpers are aggregate,** as the trades are.
- **Faith is hidden,** grows by prayer at shrines to the culture's gods, and is
  the springboard for "Religion and Cults".
- **Kidnapping is much harder than murder,** and a rescue likely raises an
  immediate bounty on the kidnapper.
- **Weather is local,** never a whole region.
- **Allies and beast forms run on the combat engine as it is.**

### For 0.4.0 (settled 2026-11-22)

Open questions 1–20 are answered here; what is still open for 0.4.0 is at the
start of §4.

**The update as a whole**

- **Name and order:** "Body and Soul" stays the working name; the steps run as
  in the roadmap (effects, faith, illness, curses).
- **One "hardship" dial** at world creation (gentle, normal, harsh) covers
  illness and curses. Old saves and links read as normal. Finer options come
  in some later update, not now.
- **Named townsfolk fall ill, gently.** The old and children are more prone
  to illness and resist it less. In ordinary times (no plague) about 1 in 5
  to 1 in 7 retired adventurers die of illness; the rest die of old age or as
  before.

**Lasting effects**

- **Today's dizziness and drains fold into the one system.** Benefits never
  stack; costs do, up to a cap, so casting again stays as costly as it is now.
- **Nerve** becomes a modifier on two things: when someone breaks and flees a
  fight, and how much risk they take in choosing to delve, fight or cast.
  Every effect on nerve acts through these.
- **Good effects come from what is rare, costly or lucky:** a good inn (dearer
  than the common one), a feast, a home of one's own, a particularly good meal,
  a stroke of luck. Never from every night's rest or every tavern visit, so
  that most adventurers carry an effect some of the time, not all of it.
  "Weakened" follows only a near death.
- **The card** shows effects in words with the time left, numbers on hover.

**Faith**

- **Everyone has a faith level,** from skeptic to devout. Those made at the
  world's start, and those who take up adventuring, get theirs by culture,
  people and traits, varying from person to person. Some towns are more
  religious than others.
- **Children inherit their parents' faith:** devout parents raise devout
  children (their parents' level, give or take a little).
- **The grave, infernal and dread have no faith.** A dark or demonic faith may
  come in a later update.
- **It falls with crime,** the graver the crime the more, and with despair
  (the death of a spouse or child, a long run of bad luck) and long years away
  from shrines.
- **It rises with prayer at shrines, surviving an illness, defeating enemies,
  and good fortune,** by how much depending on the person.
- **A priest can restore it.**
- **Shown, not counted:** life stories name a person's faith in words
  ("devout", "believer", "skeptic", "corrupted" and others), and deeds and
  phrases hint at it in the feed; no number is shown.
- **What it does before 0.5.0:** a small steadying of nerve in danger, and
  stronger shrine blessings.
- **Priests** are a town-level count by town size, more where there is a
  shrine to the local gods. For a fee they tend the sick, lift curses, restore
  faith, and in 0.4.2 lay souls to rest.

**Illness**

- **Sicknesses:** fever, infected wound, winter cough and plague; more later.
- **Sickness is commoner in winter.**
- **Some are more prone to illness, others more resistant;** the old and
  children least resistant.
- **Catching it:** a roll for each day spent in a town where sickness is about,
  or in a party with someone sick. Towns keep a sickness level (raised by the
  sick, the season and plague) that characters roll against, never one
  character against another, so it stays cheap.
- **How deadly:** illness a small share of deaths over a century (under 5% was
  the first target; see question 44).
- **Plague is rare: about 2 or 3 a century,** of different size and severity.
  Not a Black Death, but enough to hurt a town or a region for some years. It
  thins the town's population counts as well as killing named characters.
- **Remedies are a new good,** made from herbs by its own recipe, so it does not
  drain herbs from healing draughts. Some healers make better remedies and sell
  them dearer. **Towns with better remedies and more wealth suffer far less**
  from sickness and plague than poor ones.
- **The sick** rest in town and avoid delves; one taken sick on the road heads
  for the nearest town.
- **A guard against death spirals** (sickness, fewer workers, dearer remedies,
  more sickness) is part of the audit.

**Curses**

- **Which:** ill luck (worse rolls in fights, weeks), wasting (slowly lower
  health, until lifted), weakness (lower might, weeks), the mark (months).
- **The mark works on people, not towns:** friendships, parties and marriages
  are harder to win. A town's standing stays purely about known crimes.
- **Characters notice a curse after a while** (a run of bad luck), then seek a
  priest or wise folk.
- **Cursed items** are a small share of dungeon finds, worth less when sold.
  They can be inherited; an heir who notices the curse throws or sells the
  item, so a curse seldom outlasts a generation.
- **The dying curse:** about 1 murder in 10, likelier from the faithful.

## 4. Open questions

Grouped by release, each settled before its release's work begins. Each has a
proposal to react to. 0.4.0's first twenty are settled (§3); numbers 21–42
stay as they were.

### Still open for 0.4.0

Questions 1–20 are settled (§3). These came up in settling them.

43. **A home of one's own.** Nobody owns a house yet: townsfolk live in town,
    adventurers at inns. Proposal: in 0.4.0, a married or retired character
    counts as having a home in their home town (no buying or selling), and a
    night at home gives the comfort. Buying and keeping houses waits for a
    later update.
44. **Illness's share of deaths.** About 1 in 5 to 1 in 7 retirees dying of
    illness already makes up a few percent of all deaths, so the first target
    (under 5% overall) would leave almost nothing for anyone else. Proposal:
    illness about 5–10% of all deaths in ordinary times, more in a plague
    decade.
45. **Faith from fighting.** Adventurers kill something most days, so faith
    rising with every win would make them all devout. Proposal: only
    memorable deeds count (a strong foe, a dread master, surviving a near
    death, a windfall), each less than the last.
46. **Can outlaws buy back faith?** Proposal: a priest restores faith only to
    those not outlaws now (the reformed, those who served their sentence),
    and never past what they had before their crimes; a murderer's faith
    comes back only partly.
47. **How a plague spreads.** Proposal: it starts in one town (likelier in
    poor, crowded, wintry ones), travels the trade roads with merchants and
    travelers to nearby towns over weeks, and towns recover over a few years
    (population, then trade). A large one can touch a region; none reaches
    the whole world.
48. **Who is more prone to illness.** Proposal: a hidden hardiness each
    person is born with (inherited a little, like the gift), plus toughness,
    age, and the effects they carry (weakened, exhausted, cursed with
    wasting).

### For 0.4.1: allies

21. **Which allies, and where from.** Proposal: war hounds and hawks sold in
    towns (a new good or a service), tamed beasts for those who track and hunt
    (awareness), and lords' soldiers joining bands against raids and the
    dread.
22. **Upkeep and limits.** Proposal: a small daily cost, at most one or two
    allies each, and allies are left at home for long delves (or come, with
    risk).
23. **Loyalty and loss.** Proposal: allies grow better and more loyal the
    longer they last; their death is mourned (a memory), told in life stories.

### For 0.4.1: shapeshifting

24. **The moon.** A real lunar cycle on the calendar, or one set night a
    month? Proposal: a real 30-day cycle, shown on the calendar, with a full
    moon of three nights.
25. **Where werewolves live, and how often a bite passes the curse.**
    Proposal: werewolves in forests and wild hills, a bite passing it about 1
    time in 5.
26. **What an afflicted character does when they turn.** Proposal: they leave
    town if they can, run wild for the night, and may attack whoever they meet;
    a killing then is the beast's, not a murder, but a town that learns of it
    treats them with suspicion and may post a bounty on "the beast".
27. **Cure and control.** Proposal: cured only by a priest with high faith or
    rare wise folk, and only in the first months; untreated, it lasts for life.
    No controlled shifting until 0.5.0's druids.

### For 0.4.1: local weather

28. **Which kinds and for how long.** Proposal: storm, fog, calm and downpour,
    hours to a few days.
29. **What it does.** Proposal: slower travel (storm, downpour), better odds
    to ambush and to flee (fog), a harvest helped or hurt (downpour, storm),
    and fights a little harder in storms.
30. **How often.** Proposal: the dread's gloom over each lair while it lives,
    and over a town for the length of a raid; a natural squall now and then.

### For 0.4.2: souls

31. **How souls are kept.** Proposal: counts of lingering souls per place
    (cheap), plus a named soul for each named character who died unburied, so
    a murdered hero can haunt the place they died.
32. **What makes a soul linger.** Proposal: dying away from a town and unburied
    (in the wilds, in a dungeon, a hidden body), dying by murder; souls of
    those who died at home with kin pass on.
33. **What lingering souls do.** Proposal: enough of them raise ghosts (a
    creature) and grow the place's myth; a named soul may haunt until its
    killer is brought to justice.
34. **How the dread feed.** Proposal: souls of those slain by a lich's horde
    make the lich stronger (levels, horde size).
35. **Laying souls to rest.** Proposal: priests visiting a haunted place, or a
    burial in town when a body is brought back.

### For 0.4.2: kidnapping

36. **Who kidnaps.** Proposal: outlaws with low compassion and high greed,
    when they need gold and know where to hold someone.
37. **Who is taken.** Proposal: unnamed travelers and townsfolk mostly;
    rarely a named adventurer or merchant beaten in a fight; never children.
38. **Where captives are held.** Proposal: a wild place near the outlaw's
    haunts (the hideout), with the outlaw staying close.
39. **Ransom.** Proposal: asked of the captive's family, or their town for the
    unnamed; a sum by the captive's worth; a deadline after which the captive
    may be let go, sold on, or killed (rarely, a murder).
40. **Rescue and escape.** Proposal: hunters can go after kidnappers (word
    travels as for other crimes); a rescue likely posts an immediate bounty; a
    captive can slip away, more easily for a strong adventurer.
41. **Justice.** Proposal: kidnapping is a crime with heavy weight (near a
    murder), years in prison when tried, and a death sentence if the captive
    died.
42. **Telling it.** Proposal: plainly, without dwelling: "X takes a traveler
    from the road and holds them for ransom", "Y's family pays 200 gold, and
    Y comes home".
