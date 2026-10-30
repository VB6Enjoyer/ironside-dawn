import { describe, expect, it } from 'vitest';

import { createRng } from './rng';
import { createScheduler, peekNext, pendingCount, popNext, schedule } from './scheduler';

describe('scheduler', () => {
  it('pops jobs in time order', () => {
    const s = createScheduler<string>();
    schedule(s, 30, 'c');
    schedule(s, 10, 'a');
    schedule(s, 20, 'b');
    expect([popNext(s)?.job, popNext(s)?.job, popNext(s)?.job]).toEqual(['a', 'b', 'c']);
    expect(popNext(s)).toBeUndefined();
  });

  it('runs jobs due at the same time in the order they were scheduled', () => {
    const s = createScheduler<number>();
    for (let i = 0; i < 50; i++) schedule(s, 100, i);
    const order = Array.from({ length: 50 }, () => popNext(s)!.job);
    expect(order).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('matches a simple reference model under random inserts and removals', () => {
    const rng = createRng('heap');
    const s = createScheduler<number>();
    const reference: { at: number; seq: number }[] = [];
    const popReference = () => {
      let best = 0;
      reference.forEach((e, i) => {
        const b = reference[best]!;
        if (e.at < b.at || (e.at === b.at && e.seq < b.seq)) best = i;
      });
      return reference.splice(best, 1)[0];
    };

    for (let i = 0; i < 3000; i++) {
      if (reference.length > 0 && rng.chance(0.45)) {
        const expected = popReference()!;
        const actual = popNext(s)!;
        expect([actual.at, actual.seq]).toEqual([expected.at, expected.seq]);
      } else {
        const at = rng.int(0, 200);
        reference.push({ at, seq: s.nextSeq });
        schedule(s, at, i);
      }
    }
    while (reference.length > 0) {
      const expected = popReference()!;
      expect(popNext(s)!.seq).toBe(expected.seq);
    }
    expect(popNext(s)).toBeUndefined();
  });

  it('peeks without removing', () => {
    const s = createScheduler<string>();
    schedule(s, 5, 'x');
    expect(peekNext(s)?.job).toBe('x');
    expect(pendingCount(s)).toBe(1);
  });

  it('rejects invalid times', () => {
    const s = createScheduler<string>();
    expect(() => schedule(s, -1, 'x')).toThrow(RangeError);
    expect(() => schedule(s, 1.5, 'x')).toThrow(RangeError);
  });
});
