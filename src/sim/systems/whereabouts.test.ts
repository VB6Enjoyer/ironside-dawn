import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import type { LocationId, World } from '../model';
import { createSimulation } from '../simulation';
import { charactersAt } from './whereabouts';

describe('whereabouts', () => {
  const sim = createSimulation({ seed: 'whereabouts', characterCount: 60 });
  sim.advance(sim.world.time + 30 * DAY);
  const world = sim.world;
  const places = [...world.locations.keys()];

  it('knows who is where', () => {
    for (const id of places) {
      const expected = [...world.characters.values()].filter((c) => c.locationId === id);
      expect(
        charactersAt(world, id)
          .map((c) => c.id)
          .sort(),
      ).toEqual(expected.map((c) => c.id).sort());
    }
  });

  it('lists people in the same order however the index was built', () => {
    // A copy of the world, its characters stored backwards, gets a fresh index.
    const copy: World = { ...world, characters: new Map([...world.characters].reverse()) };
    const ids = (w: World, id: LocationId) => charactersAt(w, id).map((c) => c.id);
    for (const id of places) expect(ids(copy, id)).toEqual(ids(world, id));
  });
});
