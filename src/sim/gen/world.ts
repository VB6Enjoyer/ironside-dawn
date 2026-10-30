import type { MapDef } from '../../content';
import type { Rng } from '../core/rng';
import { createScheduler, schedule } from '../core/scheduler';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type { Character, CharacterId, Location, LocationId, Route, RouteId, World } from '../model';
import { generateName } from './names';

/** Worlds begin at dawn on the first day of the first year. */
export const WORLD_START = 6 * HOUR;
/** Characters' first actions are spread over the first hours, not all at once. */
const FIRST_WAKE_SPREAD = 3 * HOUR;

export function createWorldState(seed: string, map: MapDef): World {
  const locations = new Map<LocationId, Location>();
  for (const def of map.locations) {
    const id = def.id as LocationId;
    if (locations.has(id)) throw new Error(`Duplicate location ID: ${def.id}`);
    locations.set(id, {
      id,
      name: def.name,
      article: def.article ?? null,
      kind: def.kind,
      culture: def.culture,
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
    scheduler: createScheduler(),
    nextCharacterNumber: 1,
    nextEventId: 1,
  };
}

/** Creates `count` human adventurers, each living in a random town. */
export function populate(ctx: SimContext, namesRng: Rng, count: number): void {
  const world = ctx.world;
  const towns = [...world.locations.values()].filter((l) => l.kind === 'town');
  if (towns.length === 0) throw new Error('The map needs at least one town');

  const taken = new Set<string>();
  for (let i = 0; i < count; i++) {
    const home = ctx.rng.behavior.pick(towns);
    const name = generateName(namesRng, home.culture, taken);
    const character: Character = {
      id: `c${world.nextCharacterNumber++}` as CharacterId,
      ...name,
      species: 'human',
      culture: home.culture,
      homeId: home.id,
      locationId: home.id,
      activity: { kind: 'idle' },
    };
    world.characters.set(character.id, character);

    ctx.emit(
      { type: 'character.introduced', data: { characterId: character.id, homeId: home.id } },
      [character.id],
      home.id,
    );
    schedule(world.scheduler, world.time + ctx.rng.behavior.int(0, FIRST_WAKE_SPREAD), {
      kind: 'character.wake',
      characterId: character.id,
    });
  }
}
