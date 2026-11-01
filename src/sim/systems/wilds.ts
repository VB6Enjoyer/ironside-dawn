import { creatureDef, type CreatureId } from '../../content';
import type { SimContext } from '../context';
import type { Character, Location } from '../model';
import { startCreatureFight, type Horde } from './combat';
import { raidTown } from './raids';
import { roadsFrom } from './roads';
import { followersOf } from './social';
import { breedingFactor } from './weather';

/**
 * Creature ecology (ROADMAP.md Phase 9). Dungeon populations breed, slower
 * when few are left (so clearing a dungeon lasts a while) and with the
 * seasons. A dungeon that fills up spills its surplus: into a neighboring
 * dungeon with room, or out onto the roads, where the band waylays
 * travelers, raids nearby towns, and in time dies off or scatters.
 */

/** Below this share of their room, creatures breed more slowly: too few to find each other. */
const BREEDERS = 0.5;
/** Even a cleared dungeon draws a trickle of stragglers back in. */
const STRAGGLERS = 0.05;
/** Daily chance a full dungeon spills a band of one of its kinds. */
const SPILL_CHANCE = 0.015;
/** Roaming bands thin by this share a day, dying off or scattering. */
const ROAMING_DECAY = 0.03;
/** Daily chance per creature that a roaming band falls on travelers passing through. */
const WAYLAY_CHANCE = 0.06;
/** A band this big may fall on a town next to it. */
const RAID_BAND = 6;
/** Daily chance of a raid, for a band of RAID_BAND, on each town a road away. */
const RAID_CHANCE = 0.012;
/** The most creatures a waylaying or a raid brings. */
const MAX_RAIDERS = 12;

/** A day in the wild: breeding, spilling over, and roaming bands. */
export function wildsDay(ctx: SimContext): void {
  const world = ctx.world;
  const rng = ctx.rng.ecology;
  const season = breedingFactor(world);
  for (const location of world.locations.values()) {
    const dungeon = location.dungeon;
    if (dungeon) {
      for (const { creature, max, regrowthPerDay } of dungeon.def.inhabitants) {
        const count = dungeon.population[creature] ?? 0;
        if (count >= max) {
          if (rng.chance(SPILL_CHANCE)) spill(ctx, location, creature);
          continue;
        }
        const breeders = Math.max(STRAGGLERS, Math.min(1, count / (BREEDERS * max)));
        dungeon.population[creature] = Math.min(
          max,
          count + stochasticRound(rng.next(), regrowthPerDay * breeders * season),
        );
      }
    }
    roam(ctx, location);
  }
}

/** A full dungeon sends a band of `creature` out: to a neighbor with room, or onto the roads. */
function spill(ctx: SimContext, from: Location, creature: CreatureId): void {
  const rng = ctx.rng.ecology;
  const def = creatureDef(creature);
  const count = Math.max(1, rng.int(def.group[0], def.group[1] * 2));
  const neighbors = roadsFrom(ctx.world, from.id).map((r) => ctx.world.locations.get(r.to)!);
  // Another dungeon a road away with room for their kind, if any; else the road itself.
  const home = neighbors.find((l) => {
    const room = l.dungeon?.def.inhabitants.find((i) => i.creature === creature);
    return room && (l.dungeon!.population[creature] ?? 0) + count <= room.max;
  });
  const to = home ?? neighbors.find((l) => l.kind !== 'town');
  if (!to) return;
  from.dungeon!.population[creature] = (from.dungeon!.population[creature] ?? 0) - count;
  if (home) home.dungeon!.population[creature] = (home.dungeon!.population[creature] ?? 0) + count;
  else to.roaming[creature] = (to.roaming[creature] ?? 0) + count;
  ctx.emit(
    {
      type: 'creature.migrate',
      data: { locationId: from.id, toId: to.id, creature, count, roaming: !home },
    },
    [],
    to.id,
  );
}

/** Roaming bands thin out, and may fall on a town a road away. */
function roam(ctx: SimContext, location: Location): void {
  const species = Object.keys(location.roaming) as CreatureId[];
  if (species.length === 0) return;
  const rng = ctx.rng.ecology;
  let total = 0;
  for (const creature of species) {
    const count = location.roaming[creature] ?? 0;
    const left = count - stochasticRound(rng.next(), count * ROAMING_DECAY);
    if (left > 0) location.roaming[creature] = left;
    else delete location.roaming[creature];
    total += Math.max(0, left);
  }
  if (total < RAID_BAND) return;
  for (const road of roadsFrom(ctx.world, location.id)) {
    const town = ctx.world.locations.get(road.to)!;
    if (town.kind !== 'town' || !rng.chance(RAID_CHANCE * (total / RAID_BAND))) continue;
    raidTown(ctx, town, bandOf(location), { locationId: location.id, pool: 'roaming' }, null);
    return;
  }
}

/** The creatures roaming a place, as many as would set out together. */
function bandOf(location: Location): Horde[] {
  let room = MAX_RAIDERS;
  const hordes: Horde[] = [];
  for (const [species, n] of Object.entries(location.roaming) as [CreatureId, number][]) {
    const count = Math.min(room, n);
    if (count <= 0) continue;
    hordes.push({ species, count });
    room -= count;
  }
  return hordes;
}

/**
 * Travelers reach a place where creatures roam: they may be set upon. Returns
 * true if a fight started, interrupting the journey.
 */
export function waylay(ctx: SimContext, traveler: Character, location: Location): boolean {
  if (location.kind === 'town') return false;
  const species = Object.keys(location.roaming) as CreatureId[];
  if (species.length === 0) return false;
  const rng = ctx.rng.ecology;
  const total = species.reduce((sum, s) => sum + (location.roaming[s] ?? 0), 0);
  if (!rng.chance(Math.min(0.6, WAYLAY_CHANCE * total))) return false;
  const creature = rng.pick(species);
  const def = creatureDef(creature);
  const party = [traveler, ...followersOf(ctx, traveler)];
  const count = Math.min(
    location.roaming[creature] ?? 0,
    rng.int(def.group[0], def.group[1]) + party.length - 1,
  );
  if (count <= 0) return false;
  startCreatureFight(ctx, 'waylay', party, location, [{ species: creature, count }], {
    locationId: location.id,
    pool: 'roaming',
  });
  return true;
}

/** `value` rounded up or down at random, so fractions add up correctly over time. */
function stochasticRound(roll: number, value: number): number {
  const whole = Math.floor(value);
  return whole + (roll < value - whole ? 1 : 0);
}
