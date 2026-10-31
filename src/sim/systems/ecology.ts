import { schedule } from '../core/scheduler';
import { DAY, HOUR, nextTimeOfDay } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter, townPopulation, towns } from '../gen/people';
import { isAlive } from './condition';
import { considerCrime } from './outlaws';
import { hearTownLanguages } from './social';

/** The daily job runs in the morning, so newcomers arrive by day. */
const DAILY_AT = 7 * HOUR;
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

  for (const location of ctx.world.locations.values()) {
    const dungeon = location.dungeon;
    if (dungeon) {
      for (const { creature, max, regrowthPerDay } of dungeon.def.inhabitants) {
        const count = dungeon.population[creature] ?? 0;
        if (count >= max) continue;
        dungeon.population[creature] = Math.min(
          max,
          count + stochasticRound(rng.next(), regrowthPerDay),
        );
      }
    }
    for (const [species, count] of Object.entries(location.population)) {
      const births = stochasticRound(rng.next(), (count ?? 0) * TOWN_GROWTH_PER_DAY);
      location.population[species as keyof typeof location.population] = (count ?? 0) + births;
    }
  }

  let living = 0;
  for (const character of ctx.world.characters.values()) {
    if (!isAlive(character)) continue;
    living++;
    considerCrime(ctx, character);
    const here = character.locationId ? ctx.world.locations.get(character.locationId) : undefined;
    if (here?.kind === 'town') hearTownLanguages(ctx, character, here);
  }
  const shortage = (targetPopulation - living) / targetPopulation;
  if (shortage > 0 && rng.chance(Math.min(1, NEWCOMER_CHANCE * shortage * 4))) {
    const homes = towns(ctx).filter((t) => townPopulation(t) > 0);
    if (homes.length > 0) {
      const home = rng.weighted(homes.map((t) => [t, townPopulation(t)] as const));
      createCharacter(ctx, home, true, NEWCOMER_FIRST_WAKE_WITHIN);
    }
  }

  schedule(ctx.world.scheduler, ctx.world.time + DAY, { kind: 'world.daily' });
}

/** `value` rounded up or down at random, so fractions add up correctly over time. */
function stochasticRound(roll: number, value: number): number {
  const whole = Math.floor(value);
  return whole + (roll < value - whole ? 1 : 0);
}
