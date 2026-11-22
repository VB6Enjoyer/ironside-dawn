import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import { createSimulation } from '../simulation';
import { testCharacter, testContext, town } from '../test-support';
import { courageOf } from './effects-core';
import { pray } from './faith';
import {
  blessing,
  faithWord,
  hasFaith,
  priestsIn,
  shiftFaith,
  sin,
  startingFaith,
  townPiety,
} from './faith-core';

function believer(faith = 0.6) {
  const ctx = testContext('faith');
  const c = testCharacter(ctx);
  c.faith = faith;
  c.faithPeak = faith;
  c.sins = 0;
  return { ctx, c };
}

describe('faith', () => {
  it('starts by culture, town and nature, and runs in families', () => {
    const { ctx, c } = believer();
    const rng = ctx.rng.people;
    const starts = Array.from({ length: 200 }, () => startingFaith(rng, ctx.world, c));
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...starts)).toBeLessThanOrEqual(1);
    // Some believe and some doubt.
    expect(new Set(starts.map((f) => Math.round(f * 4))).size).toBeGreaterThan(2);
    const devout = [
      { ...c, faith: 0.9 },
      { ...c, faith: 0.9 },
    ];
    const children = Array.from({ length: 50 }, () => startingFaith(rng, ctx.world, c, devout));
    expect(children.reduce((s, f) => s + f, 0) / children.length).toBeGreaterThan(0.8);
    // Towns differ, but not wildly.
    expect(Math.abs(townPiety(ctx.world, c.homeId))).toBeLessThanOrEqual(0.15);
  });

  it('is eroded by crime, the graver the more, and only partly given back for murder', () => {
    const { c } = believer(0.7);
    sin(c, 'theft');
    const afterTheft = c.faith;
    expect(afterTheft).toBeLessThan(0.7);
    expect(c.sins).toBeCloseTo(0.7 - afterTheft);
    const sinsBefore = c.sins;
    sin(c, 'murder');
    const lost = afterTheft - c.faith;
    expect(lost).toBeGreaterThan(0.7 - afterTheft);
    expect(c.sins - sinsBefore).toBeCloseTo(lost / 2);
  });

  it('rises with memorable deeds, each less than the last', () => {
    const { c } = believer(0.3);
    blessing(c, 0.1, 0);
    const first = c.faith - 0.3;
    const before = c.faith;
    blessing(c, 0.1, 3);
    expect(c.faith - before).toBeLessThan(first);
  });

  it('is named in words, and never had by the dread', () => {
    const { c } = believer();
    expect(faithWord({ ...c, faith: 0.9 })).toBe('devout');
    expect(faithWord({ ...c, faith: 0.6 })).toBe('believer');
    expect(faithWord({ ...c, faith: 0.4 })).toBe('doubter');
    expect(faithWord({ ...c, faith: 0.1, faithPeak: 0.2 })).toBe('skeptic');
    expect(faithWord({ ...c, faith: 0.1, faithPeak: 0.7, crimes: [] })).toBe('faithless');
    const murder = { kind: 'murder' as const } as (typeof c.crimes)[number];
    expect(faithWord({ ...c, faith: 0.1, faithPeak: 0.7, crimes: [murder] })).toBe('corrupted');
    expect(hasFaith({ ...c, calling: 'dread' })).toBe(false);
    expect(faithWord({ ...c, culture: 'grave' })).toBeNull();
  });

  it('steadies nerve a little', () => {
    const { c } = believer(0);
    const doubting = courageOf(c, 0);
    shiftFaith(c, 1);
    expect(courageOf(c, 0)).toBeGreaterThan(doubting);
  });

  it('grows with prayer, which blesses the faithful more, and a priest gives back what crime took', () => {
    const { ctx, c } = believer(0.5);
    const here = town(ctx);
    expect(priestsIn(ctx.world, here.id)).toBeGreaterThan(0);
    c.gold = 500;
    c.sins = 0.1;
    c.faith = 0.4;
    pray(ctx, c, here);
    expect(c.faith).toBeGreaterThan(0.45);
    expect(c.sins).toBeCloseTo(0.05);
    // The devout are always blessed, and most strongly.
    c.faith = 1;
    c.effects = [];
    pray(ctx, c, here);
    expect(c.effects.find((e) => e.kind === 'blessed')!.mods.nerve).toBeCloseTo(0.1 * 1.3);
    // Not for an outlaw on the run.
    c.outlaw = { ...(c.outlaw ?? {}), since: 0 } as never;
    const sins = c.sins;
    pray(ctx, c, here);
    expect(c.sins).toBe(sins);
  });

  it('moves over a world’s years: believers, doubters and the lost', () => {
    const sim = createSimulation({ seed: 'faith', characterCount: 30, watch: 'none' });
    sim.advance(sim.world.time + 10 * 360 * DAY);
    const words = new Map<string, number>();
    for (const c of sim.world.characters.values()) {
      const word = faithWord(c);
      if (word) words.set(word, (words.get(word) ?? 0) + 1);
      expect(c.faith).toBeGreaterThanOrEqual(0);
      expect(c.faith).toBeLessThanOrEqual(1);
    }
    expect(words.size).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
