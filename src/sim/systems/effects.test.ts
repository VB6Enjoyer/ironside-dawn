import { describe, expect, it } from 'vitest';

import { DAY, HOUR } from '../core/time';
import type { Effect } from '../model';
import { testCharacter, testContext } from '../test-support';
import { adventurerFighter, fleeThreshold, recover, statValue } from './condition';
import { createSimulation } from '../simulation';
import { addEffect, dizziness, drain, expireEffects, grant } from './effects';
import { aspectOf, carries, courageOf, strengthAt } from './effects-core';

function someone() {
  const ctx = testContext('effects');
  const c = testCharacter(ctx);
  return { ctx, c, now: ctx.world.time };
}

/** A benefit or ailment for the tests: full for `full` hours, then fading over `fade` more. */
const effect = (
  kind: Effect['kind'],
  mods: Effect['mods'],
  now: number,
  full: number,
  fade = 0,
): Effect => ({
  kind,
  mods,
  since: now,
  fadeFrom: now + full * HOUR,
  until: now + (full + fade) * HOUR,
});

describe('lasting effects', () => {
  it('hold full strength, then fade evenly to nothing at their end', () => {
    const e = effect('rested', { recovery: 0.4 }, 0, 4, 4);
    expect(strengthAt(e, 0)).toBe(1);
    expect(strengthAt(e, 3 * HOUR)).toBe(1);
    expect(strengthAt(e, 6 * HOUR)).toBeCloseTo(0.5);
    expect(strengthAt(e, 8 * HOUR)).toBe(0);
    // Without the time, a carried effect counts in full.
    expect(strengthAt(e)).toBe(1);
  });

  it('keep only the stronger of a kind, never stacking benefits', () => {
    const { c, now } = someone();
    expect(addEffect(c, effect('rested', { recovery: 0.2 }, now, 8), now)).toBe(true);
    expect(addEffect(c, effect('rested', { recovery: 0.4 }, now, 8), now)).toBe(true);
    expect(c.effects).toHaveLength(1);
    expect(aspectOf(c, 'recovery', now)).toBeCloseTo(0.4);
    // A weaker one is turned away while the strong one lasts...
    expect(addEffect(c, effect('rested', { recovery: 0.1 }, now, 8), now)).toBe(false);
    expect(aspectOf(c, 'recovery', now)).toBeCloseTo(0.4);
    // ...but wins once the strong one has faded below it.
    const later = now + 7 * HOUR;
    c.effects = [effect('rested', { recovery: 0.4 }, now, 6, 2)];
    expect(addEffect(c, effect('rested', { recovery: 0.3 }, later, 8), later)).toBe(true);
    expect(aspectOf(c, 'recovery', later)).toBeCloseTo(0.3);
  });

  it('let costs stack, up to their cap', () => {
    const { c, now } = someone();
    const base = statValue(c, 'agility', now);
    addEffect(c, drain('agility', 3, now, 3), now);
    addEffect(c, drain('agility', 3, now, 3), now);
    expect(statValue(c, 'agility', now)).toBe(base - 6);
    for (let i = 0; i < 5; i++) addEffect(c, drain('agility', 3, now, 3), now);
    expect(statValue(c, 'agility', now)).toBe(base - 9);
    // Dizziness is as bad once as twice: it only lasts the longer.
    addEffect(c, dizziness(now, 10), now);
    addEffect(c, dizziness(now, 30), now);
    expect(aspectOf(c, 'attack', now)).toBe(-2);
    expect(carries(c, 'dizzy', now + 20 * 60)).toBe(true);
  });

  it('weaken a fighter, and are gone once over', () => {
    const { ctx, c, now } = someone();
    const encounter = { quickened: {}, wards: {} } as never;
    const before = adventurerFighter(c, now, encounter, 0, 1);
    addEffect(c, dizziness(now, 10), now);
    const dizzy = adventurerFighter(c, now, encounter, 0, 1);
    expect(dizzy.attack).toBe(before.attack - 2);
    expect(dizzy.defense).toBe(before.defense - 2);
    ctx.world.time = now + HOUR;
    expireEffects(c, ctx.world.time);
    expect(c.effects).toHaveLength(0);
    expect(adventurerFighter(c, ctx.world.time, encounter, 0, 1).attack).toBe(before.attack);
  });

  it('lower and give back maximum health', () => {
    const { c, now } = someone();
    const full = c.maxHp;
    addEffect(c, effect('weakened', { health: -0.25 }, now, 48), now);
    expect(c.maxHp).toBe(Math.round(full * 0.75));
    expect(c.hp).toBeLessThanOrEqual(c.maxHp);
    expireEffects(c, now + 49 * HOUR);
    expect(c.maxHp).toBe(full);
  });

  it('quicken recovery', () => {
    const { c, now } = someone();
    c.hp = 1;
    recover(c, 'inn', HOUR);
    const plain = c.hp - 1;
    c.hp = 1;
    addEffect(c, effect('rested', { recovery: 0.5 }, now, 8), now);
    recover(c, 'inn', HOUR);
    expect(c.hp - 1).toBeCloseTo(plain * 1.5);
  });

  it('steady or shake nerve, within bravery’s bounds', () => {
    const { c, now } = someone();
    c.traits = { ...c.traits, bravery: 0.5 };
    const plain = fleeThreshold(c, now);
    addEffect(c, effect('rested', { nerve: 0.3 }, now, 8), now);
    expect(courageOf(c, now)).toBeCloseTo(0.8);
    // The steadier hold on longer before running.
    expect(fleeThreshold(c, now)).toBeLessThan(plain);
    c.effects = [effect('weakened', { nerve: -0.9 }, now, 8)];
    expect(courageOf(c, now)).toBe(0);
  });
});

describe('where lasting effects come from', () => {
  it('grants a kind at its own strength and length, and tells of it', () => {
    const { ctx, c, now } = someone();
    expect(grant(ctx, c, 'rested', 'inn', c.homeId)).toBe(true);
    const [effect] = c.effects;
    expect(effect!.mods).toEqual({ recovery: 0.4, stamina: 0.1 });
    expect(effect!.fadeFrom - now).toBe(10 * HOUR);
    expect(effect!.until - now).toBe(24 * HOUR);
    const told = ctx.events.at(-1)!;
    expect(told.type).toBe('character.effect');
    expect(told.data).toMatchObject({ effect: 'rested', source: 'inn' });
    // Another as strong, later, renews it rather than stacking.
    ctx.world.time = now + 12 * HOUR;
    expect(grant(ctx, c, 'rested', 'inn', c.homeId)).toBe(true);
    expect(c.effects).toHaveLength(1);
    expect(c.effects[0]!.until).toBe(now + 36 * HOUR);
  });

  it('come from the world as it runs: fine beds, feasts, meals, marches and tonics', () => {
    const sources = new Map<string, number>();
    const kinds = new Set<string>();
    const sim = createSimulation({
      seed: 'comforts',
      characterCount: 30,
      onEvent: (e) => {
        if (e.type !== 'character.effect') return;
        sources.set(e.data.source, (sources.get(e.data.source) ?? 0) + 1);
        kinds.add(e.data.effect);
      },
    });
    sim.advance(sim.world.time + 2 * 360 * DAY);
    for (const source of ['inn', 'feast', 'meal', 'march', 'tonic'] as const) {
      expect(sources.get(source) ?? 0, source).toBeGreaterThan(0);
    }
    // Only effects the world gives out are granted, never a cost.
    for (const kind of kinds) expect(['dizzy', 'drained']).not.toContain(kind);
    // Two years of a world, every event told: slower than most tests.
  }, 60_000);
});
