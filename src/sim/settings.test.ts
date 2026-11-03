import { describe, expect, it } from 'vitest';

import { DAY } from './core/time';
import { generateMap } from './gen/geography';
import { createSimulation } from './simulation';

describe('world settings', () => {
  it('leave out the peoples not chosen', () => {
    const map = generateMap('peoples', 'medium', { peoples: ['human', 'dwarf'] });
    const peoples = new Set(map.locations.flatMap((l) => Object.keys(l.population ?? {})));
    expect([...peoples].sort()).toEqual(['dwarf', 'human']);
  });

  it('make deadlier dungeons when asked to', () => {
    const danger = (setting: 'gentle' | 'deadly') => {
      const dungeons = generateMap('danger', 'large', { danger: setting }).locations.flatMap((l) =>
        l.dungeon ? [l.dungeon.danger] : [],
      );
      return dungeons.reduce((a, b) => a + b, 0) / dungeons.length;
    };
    expect(danger('deadly')).toBeGreaterThan(danger('gentle') + 1);
  });

  it('make the gift commoner or rarer', () => {
    const gifted = (magic: 'rare' | 'common') => {
      const sim = createSimulation({ seed: 'magic', characterCount: 200, settings: { magic } });
      return [...sim.world.characters.values()].filter((c) => c.gifted).length;
    };
    expect(gifted('common')).toBeGreaterThan(gifted('rare') * 2);
  });

  it('cap how many are alive at once', () => {
    const sim = createSimulation({
      seed: 'cap',
      characterCount: 30,
      settings: { populationCap: 40 },
      watch: 'none',
    });
    sim.advance(sim.world.time + 2 * 360 * DAY);
    // Births and newcomers stop at the cap; only the odd avenger may slip past it.
    const living = [...sim.world.characters.values()].filter((c) => !c.death).length;
    expect(living).toBeLessThanOrEqual(45);
  }, 30_000);

  it('are kept with the world and its saves', () => {
    const sim = createSimulation({ seed: 'kept', settings: { danger: 'deadly', magic: 'rare' } });
    expect(sim.world.settings.danger).toBe('deadly');
    const save = sim.save();
    expect(save.settings.magic).toBe('rare');
    const again = createSimulation({ seed: 'kept', restore: save });
    expect(again.world.settings).toEqual(sim.world.settings);
  });
});
