import { schedule } from '../core/scheduler';
import { DAY, HOUR, nextTimeOfDay } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter, towns } from '../gen/people';
import { isAlive } from './condition';

/** The daily job runs in the morning, so newcomers arrive by day. */
const DAILY_AT = 7 * HOUR;
/** Chance per day that a newcomer arrives while the world is below its target population. */
const NEWCOMER_CHANCE = 0.5;
const NEWCOMER_FIRST_WAKE_WITHIN = 2 * HOUR;

export function scheduleDaily(ctx: SimContext): void {
  schedule(ctx.world.scheduler, nextTimeOfDay(ctx.world.time, DAILY_AT), { kind: 'world.daily' });
}

/**
 * Once a day: creatures regrow toward each dungeon's capacity, and new
 * adventurers arrive to replace the fallen. Proper population dynamics come
 * in Phases 3 and 8; this keeps a long-running world from emptying.
 */
export function daily(ctx: SimContext, targetPopulation: number): void {
  const rng = ctx.rng.ecology;

  for (const location of ctx.world.locations.values()) {
    const dungeon = location.dungeon;
    if (!dungeon) continue;
    for (const { creature, max, regrowthPerDay } of dungeon.def.inhabitants) {
      const count = dungeon.population[creature] ?? 0;
      if (count >= max) continue;
      const whole = Math.floor(regrowthPerDay);
      const births = whole + (rng.chance(regrowthPerDay - whole) ? 1 : 0);
      dungeon.population[creature] = Math.min(max, count + births);
    }
  }

  let living = 0;
  for (const character of ctx.world.characters.values()) if (isAlive(character)) living++;
  if (living < targetPopulation && rng.chance(NEWCOMER_CHANCE)) {
    createCharacter(ctx, rng.pick(towns(ctx)), true, NEWCOMER_FIRST_WAKE_WITHIN);
  }

  schedule(ctx.world.scheduler, ctx.world.time + DAY, { kind: 'world.daily' });
}
