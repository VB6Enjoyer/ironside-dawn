import type { CreatureId, MapDef } from '../../content';
import { createScheduler } from '../core/scheduler';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type { Location, LocationId, Route, RouteId, World } from '../model';
import { createCharacter, townPopulation, towns } from './people';

/** Worlds begin at dawn on the first day of the first year. */
export const WORLD_START = 6 * HOUR;
/** Characters' first actions are spread over the first hours, not all at once. */
const FIRST_WAKE_SPREAD = 3 * HOUR;

export function createWorldState(seed: string, map: MapDef): World {
  const locations = new Map<LocationId, Location>();
  for (const def of map.locations) {
    const id = def.id as LocationId;
    if (locations.has(id)) throw new Error(`Duplicate location ID: ${def.id}`);
    const population: Partial<Record<CreatureId, number>> = {};
    for (const inhabitant of def.dungeon?.inhabitants ?? []) {
      population[inhabitant.creature] = inhabitant.initial;
    }
    locations.set(id, {
      id,
      name: def.name,
      article: def.article ?? null,
      kind: def.kind,
      culture: def.culture,
      population: { ...def.population },
      academy: def.academy ?? false,
      dungeon: def.dungeon ? { def: def.dungeon, population, lostItems: [] } : null,
    });
  }

  const routes = new Map<RouteId, Route>();
  for (const def of map.routes) {
    const [a, b] = def.between as [LocationId, LocationId];
    if (!locations.has(a) || !locations.has(b)) {
      throw new Error(`Route ${a}–${b} refers to an unknown location`);
    }
    if (!(def.hours > 0)) throw new Error(`Route ${a}–${b} must take some time`);
    const id = `${a}~${b}` as RouteId;
    routes.set(id, { id, a, b, duration: Math.round(def.hours * HOUR) });
  }

  return {
    seed,
    time: WORLD_START,
    characters: new Map(),
    locations,
    routes,
    encounters: new Map(),
    legends: new Map(),
    parties: new Map(),
    bounties: new Map(),
    scheduler: createScheduler(),
    takenNames: new Set(),
    nextCharacterNumber: 1,
    nextEncounterNumber: 1,
    nextItemNumber: 1,
    nextPartyNumber: 1,
    nextEventId: 1,
  };
}

/** Creates `count` adventurers from the towns' commoners, larger towns giving more. */
export function populate(ctx: SimContext, count: number): void {
  const homes = towns(ctx);
  if (homes.length === 0) throw new Error('The map needs at least one town');
  for (let i = 0; i < count; i++) {
    const home = ctx.rng.people.weighted(
      homes.map((t) => [t, Math.max(1, townPopulation(t))] as const),
    );
    createCharacter(ctx, home, false, FIRST_WAKE_SPREAD);
  }
}
