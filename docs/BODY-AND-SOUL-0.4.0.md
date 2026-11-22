# Body and Soul (0.4.0): working notes

A temporary working document for 0.4.0 (a working name). It holds the design
for each system the update builds, what is already decided, and every
question still open. The plan in steps is in `ROADMAP.md` (0.4.0). When 0.4.0
ships, what was built moves into `ARCHITECTURE.md` and `WORLD.md`, and this
file is retired.

**Why this comes before magic.** The magic update (0.5.0, `MAGIC-0.5.0.md`)
needs things the world doesn't have: illness to cure, curses to cast and lift,
effects that can sit on anyone for hours, creatures fighting on a character's
side, other shapes, weather over one place, souls, kidnapping and faith. Each
is built here first, as a part of the world in its own right, with sources
that need no magic; 0.5.0 then puts magic on top.

**Order.** The open questions below are to be settled after 0.3.2 ships and
before 0.4.0 work starts.

---

## 1. What every system shares

- **One timed-effect system** (step 2) carries most of it: illness, curses,
  wounds, rest, blessings and tonics are all effects with a strength, an end,
  and a moment from which they fade.
- **Aggregate where people aren't simulated.** Townsfolk live in a daily
  round, not hour by hour, so priests, healers and wise folk are town-level
  counts, like the trades, and act as the town.
- **Saves.** Effects, faith, allies, forms and souls are new state: a save
  version bump, with a migration and a 0.3.2 save kept as a fixture.
- **Speed.** Large worlds no more than about 10% slower than 0.3.2; effects
  checked lazily, never ticked one by one.
- **Seen and told.** Each system gets live-feed lines, chronicle entries for
  what matters, life-story sentences and the card.

## 2. The systems

### Lasting effects (step 2)

Timed effects any character can carry, good or bad, on health, stamina, a
stat, attack and defense, fatigue or nerve. Each has a strength, an end, and a
moment from which it fades bit by bit. One of each type at a time; the
stronger replaces the weaker, never stacking. A cost can be bound to an effect
for as long as it lasts (what 0.5.0's buffs will use).

Sources in 0.4.0: a night at a good inn (well rested), a tavern feast (good
spirits), lingering wounds after a near death (weakened for days), exhaustion
after long marches, alchemists' tonics (vigor, calm), shrine blessings (with
faith), illness and curses.

### Faith (step 3)

A hidden attribute, 0 to 1. Grows with prayer at shrines to the gods of one's
culture, devout traits, age, and hardship survived; falls with crimes (graver
ones more) and despair. Steadies nerve in danger, strengthens shrine
blessings, and is what priests' help works through. The base for divine magic
(0.5.0) and a later "Religion and Cults" update.

### Illness (step 4)

A few sicknesses with a course: a fever, an infected wound, a winter cough,
and a rare plague that sweeps a town. Caught from untreated wounds, foul
places, the cold season and crowds. They weaken, lay people up and rarely
kill. Cured by rest, herbalists (a new demand for herbs) and priests, and by
magic in 0.5.0.

### Curses (step 5)

A condition with an effect (ill luck in fights, wasting, weakness, a mark that
makes people wary) and a way to be lifted. Laid by cursed dungeon loot,
haunted places, the touch of some undead, the dread, and sometimes a murder
victim's dying curse on their killer. Lifted by time, priests, wise folk, or
destroying the cursed item.

### Allies in battle (step 6)

Creatures fighting on a character's side: war hounds and hawks bought in
town, beasts tamed by those with the skill, and lords' soldiers riding with a
band against a threat. They fight as ordinary fighters, can be hurt and die,
and grow more useful as they last. 0.5.0's summoned beasts reuse this.

### Shapeshifting (step 7)

A form: another set of fighting numbers for a while. First source:
lycanthropy. Werewolves as creatures, whose bite can pass the curse; the
afflicted turn under the full moon, lose control, may kill, and can be cured
with luck. 0.5.0's druid beast forms reuse the mechanism.

### Local weather (step 8)

Weather at one place overriding its region's for a while: storm, fog, calm,
downpour. Sources: the dread drawing gloom over their lairs and the towns they
raid, and rare natural squalls. It slows travel, hides ambushes and escapes,
spoils or saves a harvest. 0.5.0's weather magic reuses it, local and costly.

### Souls and the restless dead (step 9)

A sapient being's soul passes on or lingers when they die: lingering where
many die unburied (battlefields, murder sites, hidden bodies, dungeons).
Lingering souls haunt (ghosts; myths grow) and can be laid to rest by priests.
The dread feed on them. Dark magic absorbs them in 0.5.0.

### Kidnapping (step 10)

Outlaws take people for ransom: mostly the unnamed (a traveler, a
townsperson), rarely a named character beaten in a fight and taken, riskier
for the kidnapper than a hunter's capture. Held at a hideout; ransom asked of
family or town; let go when paid; rescued by hunters, a rescue likely to
raise an immediate bounty; a captive may escape or die. Much harder and rarer
than murder. 0.5.0 turns it to sacrifice.

## 3. Decided so far

- **Built first, magic later:** each system has non-magical sources in 0.4.0.
- **Effects never stack; one of each type; they fade before they end; a cost
  can last as long as an effect** (from the magic decisions, built here).
- **Townsfolk's helpers are aggregate,** as the trades are.
- **Faith is hidden,** grows by prayer at shrines to the culture's gods, and is
  the springboard for "Religion and Cults".
- **Kidnapping is much harder than murder,** and a rescue likely raises an
  immediate bounty on the kidnapper.
- **Weather is local,** never a whole region.
- **Allies and beast forms run on the combat engine as it is.**

## 4. Open questions

To settle after 0.3.2, before work on 0.4.0 begins. Each has a proposal to
react to.

### The update as a whole

1. **The name.** "Body and Soul" is a working name. Proposal: keep it, or "The
   Living and the Dead".
2. **Order of the steps.** Proposal: as in the roadmap (effects, faith,
   illness, curses, allies, forms, weather, souls, kidnapping), since each
   leans on the ones before it.
3. **World settings.** Should new systems have dials at world creation, such
   as illness off, mild or harsh? Proposal: one "hardship" dial (gentle,
   normal, harsh) covering illness and curses, alongside the existing danger.
4. **Named townsfolk.** Retired heroes and their children live in town. Can
   they fall ill, be cursed, be kidnapped? Proposal: yes to illness (in their
   daily round, cheaply), no to curses and kidnapping for now.

### Lasting effects

5. **Which effects at launch, and how strong.** Proposal: well rested (+10%
   stamina for a day), good spirits (+nerve for an evening), weakened (−15%
   health for days after a near death), exhausted (−attack and defense after
   long marches), tonic of vigor (+stamina, hours), calming draught (+nerve,
   hours).
6. **Do today's dizziness and stat drains fold into the new system?**
   Proposal: yes, so there is one way timed effects work.
7. **How the card shows them.** Numbers, or words ("well rested, weakened")?
   Proposal: words with the time left, numbers on hover.

### Faith

8. **Who has faith, and where it starts.** Everyone, or only some? Proposal:
   everyone, starting by culture and traits (honor, compassion), most low to
   middling, a few devout.
9. **What lowers it besides crime.** Proposal: despair (the death of a spouse
   or child, a long run of bad luck), and time away from shrines.
10. **How much it does before divine magic.** Proposal: a small steadying of
    nerve in danger, and stronger shrine blessings; little else until 0.5.0.
11. **Priests per town.** Proposal: a count by town size, more in towns with
    a shrine to the local gods, tending the sick, lifting curses and laying
    souls to rest, for a fee to the town.

### Illness

12. **Which sicknesses.** Proposal: fever, infected wound, winter cough, and
    one plague; more later.
13. **Who catches it.** Named characters only, or the town counts too?
    Proposal: named characters, and a plague also thins a town's population
    counts.
14. **How deadly, especially plague.** Proposal: under 5% of deaths from
    illness over a century; plague rare (a few a century in a large world),
    killing a small share of a town; the old and young more at risk.
15. **Cures and the economy.** A new good ("remedies") made by herbalists from
    herbs, or reuse the healing draught? Proposal: a new good, so illness
    shows in the market.
16. **How the sick behave.** Proposal: they rest in town (convalescing) and
    avoid delves; someone sick on the road heads for the nearest town.

### Curses

17. **Which curses, how long.** Proposal: ill luck (worse rolls in fights,
    weeks), wasting (slowly lower health, until lifted), weakness (lower
    might, weeks), the mark (people wary of you, months).
18. **Do characters know they're cursed?** Proposal: they notice after a while
    (a run of bad luck), then seek a priest or wise folk.
19. **Cursed items.** Proposal: a small share of dungeon finds carry a curse
    that comes with wearing them, lifted by getting rid of the item or by a
    priest; worth less when sold.
20. **The dying curse.** How often a murder victim curses their killer.
    Proposal: rarely (about 1 in 10 murders), likelier for the faithful.

### Allies

21. **Which allies, and where from.** Proposal: war hounds and hawks sold in
    towns (a new good or a service), tamed beasts for those who track and hunt
    (awareness), and lords' soldiers joining bands against raids and the
    dread.
22. **Upkeep and limits.** Proposal: a small daily cost, at most one or two
    allies each, and allies are left at home for long delves (or come, with
    risk).
23. **Loyalty and loss.** Proposal: allies grow better and more loyal the
    longer they last; their death is mourned (a memory), told in life stories.

### Shapeshifting

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

### Local weather

28. **Which kinds and for how long.** Proposal: storm, fog, calm and downpour,
    hours to a few days.
29. **What it does.** Proposal: slower travel (storm, downpour), better odds
    to ambush and to flee (fog), a harvest helped or hurt (downpour, storm),
    and fights a little harder in storms.
30. **How often.** Proposal: the dread's gloom over each lair while it lives,
    and over a town for the length of a raid; a natural squall now and then.

### Souls

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

### Kidnapping

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
