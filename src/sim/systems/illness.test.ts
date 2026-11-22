import { describe, expect, it } from 'vitest';

import { DAY, YEAR } from '../core/time';
import { createSimulation } from '../simulation';
import { testCharacter, testContext } from '../test-support';
import { isFitToDelve, needsRecovery } from './condition';
import { fallIll, frailty, illnessDay, sicknessLevels } from './illness';
import { takedownChance } from './justice';

function someone(seed = 'illness') {
  const ctx = testContext(seed);
  const c = testCharacter(ctx);
  c.activity = { kind: 'idle' };
  return { ctx, c };
}

describe('illness', () => {
  it('weakens while it lasts, and is told', () => {
    const { ctx, c } = someone();
    const might = c.stats.might;
    fallIll(ctx, c, 'fever', c.homeId);
    expect(c.illness?.sickness).toBe('fever');
    expect(c.effects.some((e) => e.kind === 'sick' && e.mods.might === -2)).toBe(true);
    expect(ctx.events.at(-1)!.type).toBe('character.sick');
    expect(c.stats.might).toBe(might);
    // The sick don't delve, and lie up if they can afford it.
    expect(isFitToDelve(c, ctx.world.time)).toBe(false);
    c.gold = 100;
    expect(needsRecovery(c)).toBe(true);
  });

  it('passes, or kills, and the old die of it far more often', () => {
    const outcomes = (age: number) => {
      let deaths = 0;
      for (let i = 0; i < 200; i++) {
        const { ctx, c } = someone(`course-${age}-${i}`);
        (c as { born: number }).born = ctx.world.time - age * YEAR;
        fallIll(ctx, c, 'fever', c.homeId);
        const levels = sicknessLevels(ctx, [c]);
        for (let d = 0; d < 12 && !c.death && c.illness; d++) {
          ctx.world.time += DAY;
          illnessDay(ctx, c, levels, false);
        }
        if (c.death) deaths++;
        else expect(c.illness).toBeNull();
      }
      return deaths;
    };
    expect(outcomes(25)).toBeLessThan(outcomes(68));
  });

  it('is caught more readily by the frail, the old and children', () => {
    const { ctx, c } = someone();
    (c as { born: number }).born = ctx.world.time - 25 * YEAR;
    const grown = frailty(c, ctx.world.time);
    (c as { born: number }).born = ctx.world.time - 66 * YEAR;
    expect(frailty(c, ctx.world.time)).toBeGreaterThan(grown);
    (c as { born: number }).born = ctx.world.time - 6 * YEAR;
    expect(frailty(c, ctx.world.time)).toBeGreaterThan(grown);
  });

  it('makes an outlaw easier to take', () => {
    const { ctx, c } = someone();
    const outlaw = testCharacter(ctx);
    const well = takedownChance(c, outlaw, 0);
    fallIll(ctx, outlaw, 'fever', outlaw.homeId);
    expect(takedownChance(c, outlaw, 0)).toBeGreaterThan(well);
  });

  it('comes and goes in a living world, and now and then kills', () => {
    const counts = { sick: 0, recover: 0, died: 0 };
    const sim = createSimulation({
      seed: 'sickness',
      characterCount: 30,
      onEvent: (e) => {
        if (e.type === 'character.sick') counts.sick++;
        if (e.type === 'character.recover') counts.recover++;
        if (e.type === 'character.death' && e.data.cause.kind === 'illness') counts.died++;
      },
    });
    sim.advance(sim.world.time + 3 * 360 * DAY);
    expect(counts.sick).toBeGreaterThan(10);
    expect(counts.recover).toBeGreaterThan(counts.died);
  }, 60_000);
});
