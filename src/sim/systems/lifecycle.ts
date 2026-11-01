import { SPECIES, type SpeciesDef, type SpeciesId } from '../../content';
import { DAY, HOUR, YEAR } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter, priceBookOfAllTowns, townPopulation } from '../gen/people';
import { merchantsFor } from '../gen/world';
import type { Character, Location, LocationId, Occupation, World } from '../model';
import { isAlive } from './condition';
import { die, LEGENDARY_RENOWN, renownOf } from './death';
import { remember } from './mind';
import { refreshMaxima, roleOf } from './progress';
import { adjustOpinion, leaveParty, socialize } from './social';
import { cancelWake, wakeAt } from './wake';

/**
 * Lives with a beginning, a middle and an end (ROADMAP.md Phase 8): once a
 * day, the old grow older and some die of it, adventurers retire, children
 * are born and come of age, and townsfolk go out of an evening.
 *
 * Townsfolk and children are never scheduled: they live their lives here, in
 * the daily round, so a town full of them costs next to nothing.
 */

/** Share of a lifespan at which the years begin to tell. */
const ELDER_AT = 0.6;
/** Share of a lifespan from which death of old age becomes likely. */
const OLD_AT = 0.75;
/** Share of a lifespan after which a couple has no more children. */
const FERTILE_UNTIL = 0.55;
const MAX_CHILDREN = 5;
/** Settled young named folk (townsfolk and children) a people holds comfortably, per adventurer sought. */
const CROWDING = 2;
/** Years townsfolk of a just-full people, with no family left, stay before they move on. */
const STAY_YEARS = 25;
/** Merchants, against those the world tops up to, beyond which retired adventurers don't take up trade. */
const MERCHANT_ROOM = 2;

/** A character's age in whole years. */
export function ageOf(character: Character, now: number): number {
  return Math.floor((now - character.born) / YEAR);
}

/** The daily round of every life in the world. */
export function lifecycleDay(ctx: SimContext, targetPopulation: number): void {
  const world = ctx.world;
  const living = [...world.characters.values()].filter(isAlive);
  const fullness = fullnessBySpecies(ctx, living, targetPopulation);
  const famous = famousRenown(world);
  // Retired adventurers take up trading only while the roads have room for more merchants.
  const merchants = living.filter((c) => c.calling === 'merchant').length;
  const merchantRoom = merchants < MERCHANT_ROOM * merchantsFor(targetPopulation);

  for (const c of living) {
    if (!isAlive(c)) continue; // died earlier today
    const def = SPECIES[c.species];
    if (!(def as SpeciesDef).ageless) {
      grow(ctx, c);
      if (!isAlive(c)) continue;
    }
    if (c.calling === 'child') {
      if (ageOf(c, world.time) >= def.adultAge) comeOfAge(ctx, c, targetPopulation);
      continue;
    }
    if (c.calling === 'adventurer') considerRetiring(ctx, c, merchantRoom);
    if (c.calling === 'townsfolk') {
      eveningOut(ctx, c);
      considerMovingOn(ctx, c, fullness.settled.get(c.species) ?? 0, famous);
      if (!isAlive(c)) continue;
    }
    considerChildren(ctx, c, fullness.young);
  }
}

// ---------------------------------------------------------------------------
// Aging

/** Birthdays past the prime cost strength; past old age, any day may be the last. */
function grow(ctx: SimContext, c: Character): void {
  const now = ctx.world.time;
  const lifespan = SPECIES[c.species].lifespan;
  const age = (now - c.born) / YEAR;
  const birthday = Math.floor(age) !== Math.floor(age - DAY / YEAR);
  if (birthday && age >= lifespan * ELDER_AT) {
    const rng = ctx.rng.people;
    if (Math.floor(age - 1) < lifespan * ELDER_AT) {
      ctx.emit(
        {
          type: 'character.elder',
          data: { characterId: c.id, locationId: c.locationId ?? c.homeId, age: Math.floor(age) },
        },
        [c.id],
        c.locationId ?? c.homeId,
      );
    }
    for (const stat of ['might', 'agility', 'toughness'] as const) {
      if (rng.chance(0.35)) c.stats = { ...c.stats, [stat]: Math.max(3, c.stats[stat] - 1) };
    }
    refreshMaxima(c);
    c.hp = Math.min(c.hp, c.maxHp);
    c.stamina = Math.min(c.stamina, c.maxStamina);
  }

  // Death of old age comes to those at rest somewhere, not mid-fight or on the road.
  const x = age / lifespan;
  if (x < OLD_AT || !c.locationId || !atRest(c)) return;
  const yearly = Math.min(0.9, 0.03 * Math.exp(7 * (x - OLD_AT)));
  if (ctx.rng.people.chance(yearly / 360)) {
    die(ctx, c, { kind: 'age', age: Math.floor(age) });
  }
}

function atRest(c: Character): boolean {
  const kind = c.activity.kind;
  return (
    kind === 'idle' ||
    kind === 'pastime' ||
    kind === 'resting' ||
    kind === 'living' ||
    kind === 'convalescing'
  );
}

// ---------------------------------------------------------------------------
// Retirement

/**
 * Adventurers settle down: when their best years are behind them, when
 * they've made a fortune, when they have a family to raise, or when one narrow
 * escape too many has broken their nerve. They settle in the town they're in.
 */
function considerRetiring(ctx: SimContext, c: Character, merchantRoom: boolean): void {
  const world = ctx.world;
  const town = c.locationId ? world.locations.get(c.locationId) : undefined;
  if (!town || town.kind !== 'town' || c.outlaw || !atRest(c)) return;
  const age = (world.time - c.born) / YEAR;
  const x = age / SPECIES[c.species].lifespan;
  const youngChildren = c.children.filter((id) => world.characters.get(id)?.calling === 'child');
  const nearDeaths = c.memories.filter((m) => m.kind === 'near-death').length;
  const reasons = {
    age: x >= ELDER_AT ? 0.004 + 0.03 * (x - ELDER_AT) : 0,
    // The long-lived don't retire rich and young.
    wealth: c.gold >= 3_000 && x >= 0.3 ? Math.min(0.01, 0.002 * (c.gold / 3_000)) : 0,
    family: c.spouseId ? 0.0015 * youngChildren.length : 0,
    nerves: c.traits.bravery < 0.25 && nearDeaths >= 2 ? 0.003 : 0,
  };
  const chance = Object.values(reasons).reduce((a, b) => a + b, 0);
  if (chance <= 0 || !ctx.rng.people.chance(chance)) return;
  const reason = (Object.entries(reasons) as [keyof typeof reasons, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0]![0];
  retire(ctx, c, town, reason, merchantRoom);
}

function retire(
  ctx: SimContext,
  c: Character,
  town: Location,
  reason: 'age' | 'wealth' | 'family' | 'nerves',
  merchantRoom: boolean,
): void {
  const rng = ctx.rng.people;
  if (c.partyId) leaveParty(ctx, c, 'retire');
  const merchant = merchantRoom && c.gold >= 500 && c.traits.greed >= 0.6 && rng.chance(0.5);
  c.homeId = town.id;
  if (merchant) {
    c.calling = 'merchant';
    c.occupation = null;
    c.priceBook = priceBookOfAllTowns(ctx.world);
    c.activity = { kind: 'idle' };
    wakeAt(ctx, c, ctx.world.time + HOUR);
  } else {
    c.calling = 'townsfolk';
    c.occupation = occupationFor(ctx, c);
    c.activity = { kind: 'living' };
    cancelWake(c);
  }
  c.goal = null;
  ctx.emit(
    {
      type: 'character.retire',
      data: { characterId: c.id, locationId: town.id, occupation: c.occupation, reason, merchant },
    },
    [c.id],
    town.id,
  );
}

/** What a retired adventurer, or a grown child who doesn't adventure, does for a living. */
function occupationFor(ctx: SimContext, c: Character): Occupation {
  const rng = ctx.rng.people;
  switch (roleOf(c)) {
    case 'fighter':
      return rng.weighted<Occupation>([
        ['trainer', 4],
        ['smith', c.stats.might >= 12 ? 3 : 1],
        ['innkeeper', 3],
      ]);
    case 'scout':
      return rng.weighted<Occupation>([
        ['innkeeper', 3],
        ['clerk', 2],
        ['farmer', 1],
      ]);
    case 'mystic':
      return rng.weighted<Occupation>([
        ['trainer', 2],
        ['clerk', 3],
      ]);
  }
}

/**
 * Townsfolk with no spouse living, and no great name, move on in time: to
 * distant lands, or back into the crowd of commoners. Sooner without kin in
 * town, and sooner when their people is crowded. The world
 * stops following them (ARCHITECTURE.md §4.2: individuals are promoted when
 * they matter, and let go when they no longer do).
 */
function considerMovingOn(ctx: SimContext, c: Character, fullness: number, famous: number): void {
  const world = ctx.world;
  const spouse = c.spouseId ? world.characters.get(c.spouseId) : undefined;
  const wed = spouse !== undefined && !spouse.death;
  // A couple decides together, once, and only when both have settled.
  if (wed && (spouse.calling !== 'townsfolk' || c.id > spouse.id)) return;
  if (renownOf(c) >= famous || !c.locationId) return; // the famous stay where they are sung of
  const family = [...c.children, ...c.parents].map((id) => world.characters.get(id));
  if (family.some((k) => k?.calling === 'child' && !k.death)) return; // not with children to raise
  const kin = wed || family.some((k) => k && !k.death);
  // Those with family here stay longer; a crowded people sends more of its folk away.
  const years = (STAY_YEARS * (kin ? 2 : 1)) / Math.max(0.5, fullness) ** 2;
  if (!ctx.rng.people.chance(1 / (years * 360))) return;
  die(ctx, c, { kind: 'departed' });
  if (wed && isAlive(spouse) && spouse.locationId) die(ctx, spouse, { kind: 'departed' });
}

/** Renown that would make a legend of someone who died today: the famous never move on. */
function famousRenown(world: World): number {
  const dead: number[] = [];
  for (const c of world.characters.values()) {
    if (c.death && c.death.cause.kind !== 'departed' && c.calling !== 'merchant') {
      dead.push(renownOf(c));
    }
  }
  dead.sort((a, b) => a - b);
  return Math.max(LEGENDARY_RENOWN, dead[Math.floor(dead.length * 0.9)] ?? 0);
}

/** Townsfolk visit the tavern of an evening, now and then, and meet whoever is there. */
function eveningOut(ctx: SimContext, c: Character): void {
  const town = c.locationId ? ctx.world.locations.get(c.locationId) : undefined;
  if (!town || !ctx.rng.people.chance(0.2 + 0.3 * c.traits.sociability)) return;
  socialize(ctx, c, town);
}

/** Townsfolk by town and occupation, counted once a day: asked for often. */
const occupationCounts = new WeakMap<World, { day: number; counts: Map<string, number> }>();

/** Living townsfolk of this occupation in a town (trainers, smiths and innkeepers help it). */
export function townsfolkAt(ctx: SimContext, townId: LocationId, occupation: Occupation): number {
  const day = Math.floor(ctx.world.time / DAY);
  let cached = occupationCounts.get(ctx.world);
  if (!cached || cached.day !== day) {
    const counts = new Map<string, number>();
    for (const c of ctx.world.characters.values()) {
      if (c.calling !== 'townsfolk' || !c.occupation || c.death) continue;
      const key = `${c.homeId}|${c.occupation}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    cached = { day, counts };
    occupationCounts.set(ctx.world, cached);
  }
  return cached.counts.get(`${townId}|${occupation}`) ?? 0;
}

// ---------------------------------------------------------------------------
// Children

/**
 * How full each people is: named folk against what the world holds
 * comfortably. Births slow as a people fills up, which keeps populations
 * steady over the centuries.
 */
function fullnessBySpecies(
  ctx: SimContext,
  living: readonly Character[],
  targetPopulation: number,
): Fullness {
  const commoners = new Map<SpeciesId, number>();
  let total = 0;
  for (const location of ctx.world.locations.values()) {
    for (const [species, n] of Object.entries(location.population) as [SpeciesId, number][]) {
      commoners.set(species, (commoners.get(species) ?? 0) + n);
      total += n;
    }
  }
  // Only the settled count: adventurers and merchants are always on the move.
  // Births answer to the young alone, since elders have done with raising
  // families; moving on answers to everyone settled.
  const settled = new Map<SpeciesId, number>();
  const young = new Map<SpeciesId, number>();
  for (const c of living) {
    if (c.calling !== 'townsfolk' && c.calling !== 'child') continue;
    settled.set(c.species, (settled.get(c.species) ?? 0) + 1);
    if ((ctx.world.time - c.born) / YEAR > SPECIES[c.species].lifespan * FERTILE_UNTIL) continue;
    young.set(c.species, (young.get(c.species) ?? 0) + 1);
  }
  // How full each people is: 0 is empty, 1 is just full, more is crowded.
  const fullness: Fullness = { young: new Map(), settled: new Map() };
  for (const species of Object.keys(SPECIES) as SpeciesId[]) {
    const share = total > 0 ? (commoners.get(species) ?? 0) / total : 0;
    const room = Math.max(6, targetPopulation * share * CROWDING);
    fullness.young.set(species, (young.get(species) ?? 0) / room);
    fullness.settled.set(species, (settled.get(species) ?? 0) / room);
  }
  return fullness;
}

/** How crowded each people's settled folk are, the young among them and all of them. */
interface Fullness {
  readonly young: Map<SpeciesId, number>;
  readonly settled: Map<SpeciesId, number>;
}

/** A married couple in their fertile years may have a child, born at home. */
function considerChildren(ctx: SimContext, c: Character, fullness: Map<SpeciesId, number>): void {
  const world = ctx.world;
  if (!c.spouseId || c.id > c.spouseId) return; // each couple once
  const spouse = world.characters.get(c.spouseId);
  if (!spouse || !isAlive(spouse) || spouse.species !== c.species) return;
  if (c.children.length >= MAX_CHILDREN) return;
  const def = SPECIES[c.species];
  const fertile = (p: Character) => (world.time - p.born) / YEAR <= def.lifespan * FERTILE_UNTIL;
  if (!fertile(c) || !fertile(spouse)) return;
  const room = Math.max(0, 1 - (fullness.get(c.species) ?? 0));
  const chance = (def.fertility * room * (1 - 0.15 * c.children.length)) / 360;
  if (!ctx.rng.people.chance(chance)) return;
  // The child is born where a parent is at home in town.
  const home = [c, spouse]
    .map((p) => (p.locationId ? world.locations.get(p.locationId) : undefined))
    .find((l): l is Location => l?.kind === 'town' && townPopulation(l) > 0);
  if (!home) return;
  const child = createCharacter(ctx, home, {
    newcomer: false,
    firstWakeWithin: 0,
    parents: [c, spouse],
  });
  for (const parent of [c, spouse]) {
    adjustOpinion(child, parent.id, { affinity: 0.8, trust: 0.8, familiarity: 1 }, world.time);
    adjustOpinion(parent, child.id, { affinity: 0.9, trust: 0.8, familiarity: 1 }, world.time);
  }
}

/**
 * A child comes of age. Most take up adventuring while the world needs
 * adventurers, with a parent's weapon and grudges; the rest go to work in
 * town, often in a parent's trade.
 */
function comeOfAge(ctx: SimContext, child: Character, targetPopulation: number): void {
  const world = ctx.world;
  const rng = ctx.rng.people;
  let adventurers = 0;
  for (const c of world.characters.values()) {
    if (c.calling === 'adventurer' && !c.death) adventurers++;
  }
  const parents = child.parents.map((id) => world.characters.get(id)!);
  const keen = 0.5 + 0.4 * child.traits.bravery;
  const adventuring = adventurers < targetPopulation * 1.15 && rng.chance(keen);
  const locationId = child.locationId ?? child.homeId;

  if (adventuring) {
    child.calling = 'adventurer';
    child.activity = { kind: 'idle' };
    // A parent's grudges become the child's, and a murdered parent's killer most of all.
    for (const parent of parents) {
      for (const [id, o] of Object.entries(parent.opinions)) {
        if (o && o.affinity <= -0.5 && id !== child.id) {
          adjustOpinion(child, id as Character['id'], { affinity: o.affinity / 2 }, world.time);
        }
      }
      if (parent.death?.cause.kind === 'character') {
        const killer = parent.death.cause.characterId;
        adjustOpinion(child, killer, { affinity: -0.9, trust: -1 }, world.time);
        remember(child, world.time, { kind: 'grief', characterId: parent.id }, 0.9);
      }
    }
    // A purse from the family to start out with.
    const giver = parents.find((p) => isAlive(p) && p.gold >= 40);
    if (giver) {
      const gift = Math.min(30, Math.floor(giver.gold / 4));
      giver.gold -= gift;
      child.gold += gift;
    }
    wakeAt(ctx, child, world.time + rng.int(0, 2 * HOUR));
  } else {
    child.calling = 'townsfolk';
    const trades = parents.flatMap((p) => (p.occupation ? [p.occupation] : []));
    child.occupation =
      trades.length > 0 && rng.chance(0.6)
        ? rng.pick(trades)
        : rng.pick<Occupation>(['farmer', 'clerk', 'smith', 'innkeeper']);
  }
  ctx.emit(
    {
      type: 'family.comeOfAge',
      data: {
        characterId: child.id,
        locationId,
        calling: adventuring ? 'adventurer' : 'townsfolk',
        occupation: child.occupation,
      },
    },
    [child.id],
    locationId,
  );
}
