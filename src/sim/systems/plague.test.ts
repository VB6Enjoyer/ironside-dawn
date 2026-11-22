import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import { testContext, town } from '../test-support';
import { plagueDay, raging } from './plague';

const people = (t: { population: Partial<Record<string, number>> }) =>
  Object.values(t.population).reduce<number>((s, n) => s + (n ?? 0), 0);

describe('plague', () => {
  it('takes townsfolk while it rages, spreads by road, and burns itself out', () => {
    const ctx = testContext('plague');
    const here = town(ctx);
    const before = people(here);
    ctx.world.plagues.push({
      townId: here.id,
      startedAt: ctx.world.time,
      until: ctx.world.time + 120 * DAY,
      severity: 1,
      dead: 0,
      fromId: null,
    });
    for (let d = 0; d < 130; d++) {
      ctx.world.time += DAY;
      plagueDay(ctx);
    }
    const plague = ctx.world.plagues[0]!;
    expect(plague.dead).toBeGreaterThan(0);
    expect(people(here)).toBe(before - plague.dead);
    expect(raging(ctx, here.id)).toBeUndefined();
    expect(ctx.events.some((e) => e.type === 'plague.end')).toBe(true);
    // A town it has passed through is spared for years.
    expect(ctx.world.plagues.filter((p) => p.townId === here.id)).toHaveLength(1);
    const spread = ctx.world.plagues.filter((p) => p.fromId === here.id);
    for (const p of spread) expect(p.severity).toBeLessThan(1);
  });

  it('breaks out a few times a century, and is told', () => {
    const ctx = testContext('pestilence');
    for (let d = 0; d < 300 * 360; d++) {
      ctx.world.time += DAY;
      plagueDay(ctx);
    }
    const outbreaks = ctx.events.filter((e) => e.type === 'plague.outbreak').length;
    // About three a century, give or take: not none, and nothing like every year.
    expect(outbreaks).toBeGreaterThanOrEqual(3);
    expect(outbreaks).toBeLessThanOrEqual(20);
  });
});
