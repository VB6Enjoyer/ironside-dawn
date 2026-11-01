import type { SpeciesId } from '../../content';
import type { Calling, DeathCause, World, WorldSample } from '../model';
import { moneyHeld } from './ledger';
import { priceIndex } from './market';

/**
 * Snapshots for charts (ROADMAP.md Phase 6): the state of the world, and of
 * every living adventurer, at the start of each season.
 */
export function sampleHistory(world: World): void {
  for (const c of world.characters.values()) {
    if (c.death) continue;
    let kills = 0;
    for (const n of Object.values(c.kills)) kills += n ?? 0;
    c.history.push([world.time, c.level, c.gold, kills]);
  }
  world.history.push(worldSample(world));
}

/** The state of the world right now, as a sample. */
export function worldSample(world: World): WorldSample {
  const population: Partial<Record<SpeciesId, number>> = {};
  const deaths: Partial<Record<DeathCause['kind'], number>> = {};
  const callings: Partial<Record<Calling, number>> = {};
  let living = 0;
  let levels = 0;
  let maxLevel = 0;
  let gold = 0;
  let outlaws = 0;

  for (const c of world.characters.values()) {
    if (c.death) {
      deaths[c.death.cause.kind] = (deaths[c.death.cause.kind] ?? 0) + 1;
      continue;
    }
    population[c.species] = (population[c.species] ?? 0) + 1;
    callings[c.calling] = (callings[c.calling] ?? 0) + 1;
    if (c.calling !== 'adventurer') continue;
    living++;
    levels += c.level;
    maxLevel = Math.max(maxLevel, c.level);
    gold += c.gold;
    if (c.outlaw) outlaws++;
  }

  return {
    t: world.time,
    population,
    callings,
    deaths,
    meanLevel: living > 0 ? Math.round((levels / living) * 10) / 10 : 0,
    maxLevel,
    gold,
    outlaws,
    parties: world.parties.size,
    ...world.tally,
    money: Math.round(moneyHeld(world)),
    prices: Object.fromEntries(
      [...world.markets.values()].map((m) => [m.townId, Math.round(priceIndex(m) * 100) / 100]),
    ),
  };
}
