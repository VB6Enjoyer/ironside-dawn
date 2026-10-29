import { describe, expect, it } from 'vitest';

import { createRng, restoreRng, type Rng } from './rng';

const draws = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

const stdDev = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('createRng', () => {
  it('produces frozen golden values, so seeds and saves stay valid across versions', () => {
    // If this fails, the algorithm changed and every existing world and save
    // is now different. Only update these numbers on purpose.
    expect(draws(createRng(42), 5)).toEqual([
      0.611545278923586, 0.290452525485307, 0.608740468043834, 0.5258469053078443,
      0.18668818706646562,
    ]);
    expect(createRng('ironside').getState()).toEqual({
      key: 'ironside',
      s: [584475190, 3178877961, 920781956, 2284595722],
    });
  });

  it('gives the same stream for the same seed', () => {
    expect(draws(createRng('rufus'), 1000)).toEqual(draws(createRng('rufus'), 1000));
  });

  it('gives different streams for different seeds, including near-identical ones', () => {
    expect(draws(createRng(1), 10)).not.toEqual(draws(createRng(2), 10));
    expect(draws(createRng('seed-a'), 10)).not.toEqual(draws(createRng('seed-b'), 10));
  });

  it('treats a number seed and its string form as the same seed', () => {
    expect(draws(createRng(42), 10)).toEqual(draws(createRng('42'), 10));
  });

  it('rejects empty and non-finite seeds', () => {
    expect(() => createRng('')).toThrow(RangeError);
    expect(() => createRng(Number.NaN)).toThrow(RangeError);
    expect(() => createRng(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('next', () => {
  it('stays within [0, 1) and is roughly uniform', () => {
    const xs = draws(createRng('uniform'), 100_000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(mean(xs)).toBeCloseTo(0.5, 2);

    const buckets = new Array<number>(10).fill(0);
    for (const x of xs) buckets[Math.floor(x * 10)]! += 1;
    for (const count of buckets) expect(count).toBeGreaterThan(9_500);
    for (const count of buckets) expect(count).toBeLessThan(10_500);
  });
});

describe('getState / restoreRng', () => {
  it('continues the exact same stream after a restore', () => {
    const original = createRng('save-me');
    draws(original, 37);
    const restored = restoreRng(original.getState());
    expect(draws(restored, 100)).toEqual(draws(original, 100));
  });

  it('survives a JSON round trip, as it will in a save file', () => {
    const original = createRng('json');
    draws(original, 5);
    const restored = restoreRng(JSON.parse(JSON.stringify(original.getState())));
    expect(draws(restored, 50)).toEqual(draws(original, 50));
  });

  it('returns a snapshot that later draws do not mutate', () => {
    const rng = createRng('snapshot');
    const state = rng.getState();
    const copy = structuredClone(state);
    draws(rng, 10);
    expect(state).toEqual(copy);
  });

  it('keeps fork keys after a restore', () => {
    const original = createRng('world');
    const restored = restoreRng(original.getState());
    expect(draws(restored.fork('combat'), 10)).toEqual(draws(original.fork('combat'), 10));
  });
});

describe('fork', () => {
  it('gives the same child stream for the same label', () => {
    const rng = createRng('world');
    expect(draws(rng.fork('combat'), 20)).toEqual(draws(rng.fork('combat'), 20));
  });

  it('gives different child streams for different labels', () => {
    const rng = createRng('world');
    expect(draws(rng.fork('combat'), 10)).not.toEqual(draws(rng.fork('loot'), 10));
  });

  it('does not consume draws from the parent', () => {
    const forked = createRng('world');
    forked.fork('combat').next();
    expect(draws(forked, 10)).toEqual(draws(createRng('world'), 10));
  });

  it('does not depend on how many draws the parent already made', () => {
    const fresh = createRng('world');
    const used = createRng('world');
    draws(used, 500);
    expect(draws(used.fork('loot'), 10)).toEqual(draws(fresh.fork('loot'), 10));
  });

  it('treats nested forks as a path', () => {
    const rng = createRng('world');
    expect(draws(rng.fork('a').fork('b'), 10)).toEqual(draws(rng.fork('a/b'), 10));
  });

  it('differs from the parent stream', () => {
    const rng = createRng('world');
    expect(draws(rng.fork('combat'), 10)).not.toEqual(draws(createRng('world'), 10));
  });

  it('rejects an empty label', () => {
    expect(() => createRng('world').fork('')).toThrow(RangeError);
  });
});

describe('int', () => {
  it('covers both ends of an inclusive range evenly', () => {
    const rng = createRng('int');
    const counts = new Map<number, number>();
    for (let i = 0; i < 60_000; i++) {
      const n = rng.int(1, 6);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const count of counts.values()) expect(count).toBeGreaterThan(9_500);
    for (const count of counts.values()) expect(count).toBeLessThan(10_500);
  });

  it('returns the only value when min equals max', () => {
    expect(createRng('int').int(7, 7)).toBe(7);
  });

  it('handles negative ranges', () => {
    const rng = createRng('int');
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(-3, -1);
      expect(n).toBeGreaterThanOrEqual(-3);
      expect(n).toBeLessThanOrEqual(-1);
    }
  });

  it('rejects invalid bounds', () => {
    const rng = createRng('int');
    expect(() => rng.int(5, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.int(0, Number.NaN)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 33)).toThrow(RangeError);
  });
});

describe('chance', () => {
  it('never succeeds at 0 and always succeeds at 1', () => {
    const rng = createRng('chance');
    for (let i = 0; i < 1000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('succeeds at roughly the given rate', () => {
    const rng = createRng('chance');
    let hits = 0;
    for (let i = 0; i < 100_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 100_000).toBeCloseTo(0.3, 2);
  });

  it('consumes one draw whatever the probability, so tuning odds does not shift other rolls', () => {
    const a = createRng('chance');
    const b = createRng('chance');
    a.chance(0);
    b.chance(0.5);
    expect(a.next()).toBe(b.next());
  });

  it('rejects probabilities outside [0, 1]', () => {
    const rng = createRng('chance');
    expect(() => rng.chance(-0.1)).toThrow(RangeError);
    expect(() => rng.chance(1.1)).toThrow(RangeError);
    expect(() => rng.chance(Number.NaN)).toThrow(RangeError);
  });
});

describe('pick', () => {
  it('returns every element over enough draws', () => {
    const rng = createRng('pick');
    const items = ['sword', 'axe', 'bow'] as const;
    const seen = new Set(Array.from({ length: 300 }, () => rng.pick(items)));
    expect(seen).toEqual(new Set(items));
  });

  it('rejects an empty array', () => {
    expect(() => createRng('pick').pick([])).toThrow(RangeError);
  });
});

describe('weighted', () => {
  it('picks values in proportion to their weights', () => {
    const rng = createRng('weighted');
    const counts = { common: 0, rare: 0, never: 0 };
    for (let i = 0; i < 100_000; i++) {
      const value = rng.weighted<keyof typeof counts>([
        ['common', 9],
        ['never', 0],
        ['rare', 1],
      ]);
      counts[value]++;
    }
    expect(counts.never).toBe(0);
    expect(counts.rare / 100_000).toBeCloseTo(0.1, 2);
  });

  it('rejects invalid weights', () => {
    const rng = createRng('weighted');
    expect(() => rng.weighted([])).toThrow(RangeError);
    expect(() => rng.weighted([['a', 0]])).toThrow(RangeError);
    expect(() => rng.weighted([['a', -1]])).toThrow(RangeError);
    expect(() => rng.weighted([['a', Number.POSITIVE_INFINITY]])).toThrow(RangeError);
    expect(() => rng.weighted([['a', Number.NaN]])).toThrow(RangeError);
  });
});

describe('gaussian', () => {
  it('matches the requested mean and standard deviation', () => {
    const rng = createRng('gaussian');
    const xs = Array.from({ length: 100_000 }, () => rng.gaussian(10, 2));
    expect(mean(xs)).toBeCloseTo(10, 1);
    expect(stdDev(xs)).toBeCloseTo(2, 1);
  });

  it('returns the mean exactly when the deviation is 0', () => {
    expect(createRng('gaussian').gaussian(5, 0)).toBe(5);
  });

  it('rejects a negative deviation', () => {
    expect(() => createRng('gaussian').gaussian(0, -1)).toThrow(RangeError);
  });
});

describe('roll', () => {
  it.each([
    ['d20', 1, 20],
    ['1d6', 1, 6],
    ['2d6+1', 3, 13],
    ['3d4-2', 1, 10],
    [' 2 d 6 + 1 ', 3, 13],
    ['2D6', 2, 12],
  ])('keeps %s within [%i, %i] and reaches both ends', (notation, min, max) => {
    const rng = createRng(`roll-${notation}`);
    const results = Array.from({ length: 20_000 }, () => rng.roll(notation));
    expect(Math.min(...results)).toBe(min);
    expect(Math.max(...results)).toBe(max);
  });

  it('averages correctly for multiple dice', () => {
    const rng = createRng('roll');
    const results = Array.from({ length: 50_000 }, () => rng.roll('3d6'));
    expect(mean(results)).toBeCloseTo(10.5, 1);
  });

  it('accepts plain constants without drawing', () => {
    const rng = createRng('roll');
    expect(rng.roll('5')).toBe(5);
    expect(rng.roll('-2')).toBe(-2);
    expect(rng.next()).toBe(createRng('roll').next());
  });

  it.each(['', 'd', '2d', 'xd6', '2d6+', 'd6*2', '1.5d6', '2d6+1d4'])(
    'rejects invalid notation %j',
    (notation) => {
      expect(() => createRng('roll').roll(notation)).toThrow(SyntaxError);
    },
  );

  it('rejects impossible dice', () => {
    const rng = createRng('roll');
    expect(() => rng.roll('0d6')).toThrow(RangeError);
    expect(() => rng.roll('2d0')).toThrow(RangeError);
    expect(() => rng.roll('1001d6')).toThrow(RangeError);
  });
});
