import { creatureDef, type CreatureId } from '../../content';
import { DAY } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter, townPopulation } from '../gen/people';
import type { Character, Fortress, Location } from '../model';
import { startCreatureFight } from './combat';
import { isAlive } from './condition';
import { generateItem } from './items';
import { refreshMaxima, xpForLevel } from './progress';
import { leaveParty } from './social';
import { cancelWake } from './wake';
import { moveTo } from './whereabouts';

/**
 * Fortresses and lords, a first pass (ROADMAP.md Phase 9). Each fortress
 * holds the towns and wild places around it: their trading houses pay it a
 * tithe, and its lord pays a garrison that mans the towns' walls against
 * raiders and patrols the roads, clearing roaming creatures and running
 * outlaws to ground. When a lord dies, an heir takes the seat; failing one,
 * a renowned adventurer may claim it, or in time someone is raised to it.
 */

/** Soldiers a new lord starts with, and the most a fortress keeps. */
const GARRISON_START = 16;
const GARRISON_MAX = 40;
/** Daily share of a territory's trading house gold paid as tithe. */
const TITHE = 0.002;
/** Each soldier's daily wage, paid back into the territory's towns. */
const WAGE = 0.4;
/** A lord keeps this much; the rest goes back to the towns, on roads, walls and feasts. */
const LORD_PURSE = 3000;
/** What raising a soldier costs, paid to the town they come from. */
const RECRUIT_COST = 20;
/** Daily chance a patrol rides out to each troubled place in the territory. */
const PATROL_CHANCE = 0.15;
/** Creatures a patrol cuts down, per soldier in the garrison. */
const PATROL_KILLS = 0.25;
/** Daily chance a patrol comes upon outlaws lying in wait in the territory. */
const CATCH_CHANCE = 0.08;
/** A fortress stands empty this long before someone is raised to it. */
const VACANCY = 180 * DAY;
/** Renown at which a retiring adventurer may claim an empty seat. */
export const CLAIM_RENOWN = 40;

/** At the world's beginning, every fortress has a lord. */
export function seatLords(ctx: SimContext): void {
  for (const fortress of ctx.world.locations.values()) {
    if (fortress.fortress) appoint(ctx, fortress, 'founded');
  }
}

/** A day in the fortresses: succession, tithes and wages, recruits, patrols. */
export function lordsDay(ctx: SimContext): void {
  for (const place of ctx.world.locations.values()) {
    const fortress = place.fortress;
    if (!fortress) continue;
    const lord = fortress.lordId ? ctx.world.characters.get(fortress.lordId) : undefined;
    if (!lord || !isAlive(lord)) {
      succeed(ctx, place, fortress);
      continue;
    }
    upkeep(ctx, fortress, lord);
    patrol(ctx, place, fortress);
  }
}

/** A lord dies: the seat stands empty until an heir or someone else takes it. */
export function lordDied(ctx: SimContext, lord: Character): void {
  const fortress = ctx.world.locations.get(lord.homeId)?.fortress;
  if (!fortress || fortress.lordId !== lord.id) return;
  fortress.lordId = null;
  fortress.vacantSince = ctx.world.time;
}

/**
 * An empty seat: the late lord's eldest grown child takes it when they can;
 * failing one, after a while, a commoner of the lands is raised to it.
 */
function succeed(ctx: SimContext, place: Location, fortress: Fortress): void {
  const world = ctx.world;
  const last = fortress.lineage.at(-1);
  const late = last ? world.characters.get(last) : undefined;
  const heir = (late?.children ?? [])
    .map((id) => world.characters.get(id)!)
    .filter((c) => isAlive(c) && c.calling !== 'child' && c.calling !== 'lord' && free(c))
    .sort((a, b) => a.born - b.born)[0];
  if (heir) {
    takeSeat(ctx, heir, place, 'inherited');
    return;
  }
  if (world.time - (fortress.vacantSince ?? world.time) >= VACANCY)
    appoint(ctx, place, 'appointed');
}

/** Whether someone is somewhere they can leave from, not on the road or in a fight. */
function free(c: Character): boolean {
  if (c.locationId === null) return false;
  const kind = c.activity.kind;
  return kind === 'idle' || kind === 'living' || kind === 'pastime' || kind === 'resting';
}

/** An empty fortress near `from`, for a retiring hero to claim. */
export function emptySeatNear(ctx: SimContext, from: Location): Location | null {
  for (const place of ctx.world.locations.values()) {
    if (!place.fortress || place.fortress.lordId) continue;
    if (place.fortress.territory.includes(from.id)) return place;
  }
  return null;
}

/** Someone takes the seat of a fortress and goes to live there. */
export function takeSeat(
  ctx: SimContext,
  c: Character,
  place: Location,
  how: 'founded' | 'inherited' | 'claimed' | 'appointed',
): void {
  const fortress = place.fortress!;
  if (c.partyId) leaveParty(ctx, c, 'retire');
  c.calling = 'lord';
  c.occupation = null;
  c.homeId = place.id;
  c.goal = null;
  c.activity = { kind: 'living' };
  cancelWake(c);
  moveTo(ctx.world, c, place.id);
  fortress.lordId = c.id;
  fortress.vacantSince = null;
  fortress.lineage.push(c.id);
  if (how !== 'inherited' && how !== 'claimed') fortress.garrison = GARRISON_START;
  ctx.emit(
    { type: 'lord.seat', data: { characterId: c.id, locationId: place.id, how } },
    [c.id],
    place.id,
  );
}

/** Raises a commoner of the lands to the seat: a seasoned captain, well armed. */
function appoint(ctx: SimContext, place: Location, how: 'founded' | 'appointed'): void {
  const world = ctx.world;
  const rng = ctx.rng.people;
  const towns = place
    .fortress!.territory.map((id) => world.locations.get(id)!)
    .filter((l) => l.kind === 'town' && townPopulation(l) > 0);
  const home =
    towns.sort((a, b) => townPopulation(b) - townPopulation(a))[0] ?? nearestTown(ctx, place);
  if (!home) return;
  const lord = createCharacter(ctx, home, { newcomer: false, firstWakeWithin: 0, calling: 'lord' });
  const level = rng.int(8, 14);
  lord.level = level;
  lord.xp = xpForLevel(level);
  const skill = Object.entries(lord.skills).sort(
    (a, b) => b[1] - a[1],
  )[0]![0] as keyof typeof lord.skills;
  lord.skills[skill] = Math.max(lord.skills[skill], rng.int(45, 65));
  lord.equipment.armor = generateItem(ctx, ctx.rng.items, {
    culture: lord.culture,
    depth: 4,
    base: 'chain',
    rarity: 'fine',
    material: 'steel',
  });
  refreshMaxima(lord);
  lord.hp = lord.maxHp;
  takeSeat(ctx, lord, place, how);
}

function nearestTown(ctx: SimContext, place: Location): Location | undefined {
  let best: Location | undefined;
  let bestD = Infinity;
  for (const l of ctx.world.locations.values()) {
    if (l.kind !== 'town') continue;
    const d = Math.hypot(l.x - place.x, l.y - place.y);
    if (d < bestD) {
      best = l;
      bestD = d;
    }
  }
  return best;
}

/**
 * Tithes in, wages out: the lord keeps what's left. Wages go back into the
 * towns' trading houses, where the soldiers spend them. A lord who can't pay
 * loses soldiers; one with money to spare raises more.
 */
function upkeep(ctx: SimContext, fortress: Fortress, lord: Character): void {
  const world = ctx.world;
  const houses = fortress.territory.flatMap((id) => world.markets.get(id) ?? []);
  for (const market of houses) {
    const tithe = Math.floor(market.house.gold * TITHE);
    market.house.gold -= tithe;
    lord.gold += tithe;
  }
  if (houses.length === 0) return;
  const wages = Math.round(fortress.garrison * WAGE);
  if (lord.gold < wages) {
    fortress.garrison = Math.max(0, fortress.garrison - 1);
    return;
  }
  lord.gold -= wages;
  houses.forEach((market, i) => {
    market.house.gold += Math.floor(wages / houses.length) + (i === 0 ? wages % houses.length : 0);
  });
  if (lord.gold > LORD_PURSE) {
    const spent = lord.gold - LORD_PURSE;
    lord.gold = LORD_PURSE;
    houses.forEach((market, i) => {
      market.house.gold +=
        Math.floor(spent / houses.length) + (i === 0 ? spent % houses.length : 0);
    });
  }
  if (fortress.garrison >= GARRISON_MAX || lord.gold < RECRUIT_COST * 4) return;
  const town = fortress.territory
    .map((id) => world.locations.get(id)!)
    .find((l) => l.kind === 'town' && townPopulation(l) > 100);
  const market = town && world.markets.get(town.id);
  if (!town || !market || !ctx.rng.people.chance(0.05)) return;
  const [species, n] = Object.entries(town.population).sort((a, b) => b[1] - a[1])[0]!;
  town.population[species as keyof typeof town.population] = n - 1;
  lord.gold -= RECRUIT_COST;
  market.house.gold += RECRUIT_COST;
  fortress.garrison++;
}

/** Patrols ride out to the troubled places in the lands. */
function patrol(ctx: SimContext, place: Location, fortress: Fortress): void {
  const world = ctx.world;
  const rng = ctx.rng.outlaws;
  if (fortress.garrison < 4) return;
  for (const id of fortress.territory) {
    const wild = world.locations.get(id)!;
    if (wild.kind === 'town') continue;
    // Beasts on the road: cut down as many as the patrol can, losing a few.
    const roaming = Object.entries(wild.roaming) as [CreatureId, number][];
    if (roaming.length > 0 && rng.chance(PATROL_CHANCE)) {
      const [creature, count] = roaming.sort((a, b) => b[1] - a[1])[0]!;
      const slain = Math.min(count, Math.max(1, Math.round(fortress.garrison * PATROL_KILLS)));
      if (slain >= count) delete wild.roaming[creature];
      else wild.roaming[creature] = count - slain;
      fortress.garrison = Math.max(
        0,
        fortress.garrison - Math.round((slain * creatureDef(creature).level) / 10),
      );
      ctx.emit(
        {
          type: 'patrol.clear',
          data: { locationId: wild.id, fortressId: place.id, creature, count: slain },
        },
        [],
        wild.id,
      );
    }
    // Outlaws lying in wait: the patrol falls on them.
    const lurkers = [...world.characters.values()].filter(
      (c) =>
        c.locationId === wild.id &&
        c.outlaw &&
        isAlive(c) &&
        c.activity.kind === 'pastime' &&
        c.activity.pastime === 'lurk',
    );
    if (lurkers.length > 0 && rng.chance(CATCH_CHANCE)) {
      const soldiers = Math.min(6, Math.max(2, Math.floor(fortress.garrison / 4)));
      startCreatureFight(ctx, 'patrol', lurkers, wild, [{ species: 'soldier', count: soldiers }], {
        locationId: place.id,
        pool: 'garrison',
      });
    }
  }
}
