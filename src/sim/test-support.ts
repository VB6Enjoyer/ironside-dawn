import { STARTER_MAP } from '../content';
import { createRng } from './core/rng';
import type { SimContext } from './context';
import { createCharacter } from './gen/people';
import { createWorldState } from './gen/world';
import type { Character, Location, LocationId, SimEvent } from './model';

/**
 * A bare simulation context for unit tests: the starter map, no characters,
 * nothing scheduled to run. Events are collected in `events`.
 */
export function testContext(seed = 'test'): SimContext & { events: SimEvent[] } {
  const root = createRng(seed);
  const world = createWorldState(seed, STARTER_MAP);
  const events: SimEvent[] = [];
  const fork = (label: string) => root.fork(label);
  return {
    world,
    events,
    rng: {
      behavior: fork('behavior'),
      travel: fork('travel'),
      people: fork('people'),
      delve: fork('delve'),
      combat: fork('combat'),
      loot: fork('loot'),
      ecology: fork('ecology'),
      magic: fork('magic'),
      items: fork('items'),
      social: fork('social'),
      outlaws: fork('outlaws'),
    },
    emit(body, actors, locationId) {
      const event = {
        ...body,
        id: world.nextEventId++,
        t: world.time,
        importance: 1,
        actors,
        locationId,
      } as SimEvent;
      events.push(event);
      return event;
    },
  };
}

export function town(ctx: SimContext, id = 'concordale'): Location {
  return ctx.world.locations.get(id as LocationId)!;
}

/** A fresh adventurer in Concordale. */
export function testCharacter(ctx: SimContext): Character {
  return createCharacter(ctx, town(ctx), false, 0);
}
