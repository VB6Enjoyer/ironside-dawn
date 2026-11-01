import { schedule } from '../core/scheduler';
import { DAY, HOUR, nextTimeOfDay } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter, towns } from '../gen/people';
import { merchantsFor } from '../gen/world';
import type { SpeciesId } from '../../content';
import type { Calling } from '../model';
import { isAlive } from './condition';
import { economyDay } from './economy';
import { dreadDay } from './dread';
import { lifecycleDay } from './lifecycle';
import { lordsDay } from './lords';
import { weatherDay } from './weather';
import { wildsDay } from './wilds';
import { considerCrime } from './outlaws';
import { hearTownLanguages } from './social';

/** The daily job runs in the morning, so newcomers arrive by day, and markets clear. */
export const DAILY_AT = 7 * HOUR;
/** Daily chance of a newcomer when the world is short of adventurers, scaled by how short. */
const NEWCOMER_CHANCE = 0.9;
const NEWCOMER_FIRST_WAKE_WITHIN = 2 * HOUR;
/** Commoners grow by this fraction a day (about 4% a year). */
const TOWN_GROWTH_PER_DAY = 0.0001;

export function scheduleDaily(ctx: SimContext): void {
  schedule(ctx.world.scheduler, nextTimeOfDay(ctx.world.time, DAILY_AT), { kind: 'world.daily' });
}

/**
 * Once a day: creatures regrow toward each dungeon's capacity, towns grow,
 * and commoners take up adventuring to replace the fallen, more eagerly the
 * fewer adventurers there are.
 */
export function daily(ctx: SimContext, targetPopulation: number): void {
  const rng = ctx.rng.ecology;
  economyDay(ctx);

  weatherDay(ctx);
  wildsDay(ctx);

  for (const location of ctx.world.locations.values()) {
    // Commoners grow, more slowly as the town fills up.
    for (const [species, count] of Object.entries(location.population) as [SpeciesId, number][]) {
      const room = location.capacity[species] ?? count;
      const growth = count * TOWN_GROWTH_PER_DAY * Math.max(0, 1 - count / Math.max(1, room));
      location.population[species] = count + stochasticRound(rng.next(), growth);
    }
  }

  lifecycleDay(ctx, targetPopulation);
  lordsDay(ctx);
  dreadDay(ctx);

  let living = 0;
  let merchants = 0;
  for (const character of ctx.world.characters.values()) {
    if (!isAlive(character)) continue;
    if (character.calling === 'merchant') merchants++;
    else if (character.calling === 'adventurer') living++;
    considerCrime(ctx, character);
    const here = character.locationId ? ctx.world.locations.get(character.locationId) : undefined;
    if (here?.kind === 'town') hearTownLanguages(ctx, character, here);
  }
  const newcomer = (calling: Calling) => {
    const species = scarcestPeople(ctx, calling);
    const homes = towns(ctx).filter((t) => (t.population[species] ?? 0) > 0);
    if (homes.length === 0) return;
    const home = rng.weighted(homes.map((t) => [t, t.population[species] ?? 0] as const));
    createCharacter(ctx, home, {
      newcomer: true,
      firstWakeWithin: NEWCOMER_FIRST_WAKE_WITHIN,
      calling,
      species,
    });
  };
  const shortage = (targetPopulation - living) / targetPopulation;
  if (shortage > 0 && rng.chance(Math.min(1, NEWCOMER_CHANCE * shortage * 4))) {
    newcomer('adventurer');
  }
  // Merchants who fall on the road, or give up the trade, are replaced in time.
  const merchantTarget = merchantsFor(targetPopulation);
  if (merchants < merchantTarget && rng.chance(0.2 * (merchantTarget - merchants))) {
    newcomer('merchant');
  }

  schedule(ctx.world.scheduler, ctx.world.time + DAY, { kind: 'world.daily' });
}

/**
 * The people most short of its share of adventurers (or merchants), against
 * how many of each live in the towns. Long-lived peoples never age out of
 * adventuring, so without this the adventurers would drift toward elves and
 * dwarves over the generations.
 */
function scarcestPeople(ctx: SimContext, calling: Calling): SpeciesId {
  const commoners = new Map<SpeciesId, number>();
  let total = 0;
  for (const town of towns(ctx)) {
    for (const [species, n] of Object.entries(town.population) as [SpeciesId, number][]) {
      commoners.set(species, (commoners.get(species) ?? 0) + n);
      total += n;
    }
  }
  const have = new Map<SpeciesId, number>();
  let named = 0;
  for (const c of ctx.world.characters.values()) {
    if (c.death || c.calling !== calling) continue;
    have.set(c.species, (have.get(c.species) ?? 0) + 1);
    named++;
  }
  let best: { species: SpeciesId; shortfall: number } | null = null;
  for (const [species, n] of commoners) {
    const shortfall = ((named + 1) * n) / total - (have.get(species) ?? 0);
    if (!best || shortfall > best.shortfall) best = { species, shortfall };
  }
  return best?.species ?? 'human';
}

/** `value` rounded up or down at random, so fractions add up correctly over time. */
function stochasticRound(roll: number, value: number): number {
  const whole = Math.floor(value);
  return whole + (roll < value - whole ? 1 : 0);
}
