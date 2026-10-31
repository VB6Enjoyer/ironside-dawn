import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import { createSimulation } from '../simulation';

describe('history', () => {
  const sim = createSimulation({ seed: 'history', characterCount: 30 });
  sim.advance(sim.world.time + 365 * DAY);
  const { history, characters } = sim.world;

  it('samples the world when it begins and every season after', () => {
    expect(history).toHaveLength(5);
    expect(history.map((s) => s.t)).toEqual([...history.map((s) => s.t)].sort((a, b) => a - b));
    const last = history.at(-1)!;
    const living = [...characters.values()].filter((c) => !c.death);
    expect(Object.values(last.population).reduce((a, b) => a! + b!, 0)).toBeLessThanOrEqual(
      characters.size,
    );
    expect(last.maxLevel).toBeGreaterThan(1);
    expect(living.length).toBeGreaterThan(0);
  });

  it('keeps each adventurer’s level and purse over time', () => {
    const veteran = [...characters.values()].find((c) => !c.death && c.arrivedAt < DAY)!;
    expect(veteran.history).toHaveLength(5);
    const levels = veteran.history.map(([, level]) => level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});
