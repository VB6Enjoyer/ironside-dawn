import { describe, expect, it } from 'vitest';

import { testCharacter, testContext } from '../test-support';
import { gainXp, practice, refreshMaxima, roleOf, skillBonus, xpForLevel } from './progress';

describe('levels', () => {
  it('follows a slowly steepening curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(8)).toBe(2800);
    for (let level = 2; level < 20; level++) {
      const step = xpForLevel(level + 1) - xpForLevel(level);
      expect(step).toBeGreaterThan(xpForLevel(level) - xpForLevel(level - 1));
    }
  });

  it('levels up as many times as the experience allows, with an event each time', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const hpBefore = c.maxHp;
    gainXp(ctx, c, xpForLevel(4) + 10, c.homeId);
    expect(c.level).toBe(4);
    expect(
      ctx.events.filter((e) => e.type === 'character.levelup').map((e) => e.data),
    ).toMatchObject([{ level: 2 }, { level: 3 }, { level: 4 }]);
    expect(c.maxHp).toBe(hpBefore + 9);
    expect(c.hp).toBe(c.maxHp);
    expect(c.deeds.filter((d) => d.kind === 'level')).toHaveLength(3);
  });
});

describe('skills', () => {
  it('improve with practice, more slowly the better they get', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.skills.stealth = 0;
    practice(ctx, c, 'stealth', 10, c.homeId);
    const fromNovice = c.skills.stealth;
    c.skills.stealth = 70;
    practice(ctx, c, 'stealth', 10, c.homeId);
    const fromExpert = c.skills.stealth - 70;
    expect(fromNovice).toBeGreaterThan(fromExpert * 5);
  });

  it('never pass 100', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    for (let i = 0; i < 10_000; i++) practice(ctx, c, 'awareness', 50, c.homeId);
    expect(c.skills.awareness).toBeLessThanOrEqual(100);
  });

  it('announce each new rank once', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.skills.lockpicking = 19;
    practice(ctx, c, 'lockpicking', 3, c.homeId);
    practice(ctx, c, 'lockpicking', 3, c.homeId);
    const ranks = ctx.events.filter((e) => e.type === 'character.skill');
    expect(ranks.map((e) => e.data)).toMatchObject([{ skill: 'lockpicking', rank: 'apprentice' }]);
  });

  it('give +1 per 10 points', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.skills.arcana = 37;
    expect(skillBonus(c, 'arcana')).toBe(3);
  });
});

describe('roles', () => {
  it('follow the best skill', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    expect(roleOf(c)).toBe('fighter');
    c.skills.arcana = 95;
    expect(roleOf(c)).toBe('mystic');
    c.skills.stealth = 99;
    expect(roleOf(c)).toBe('scout');
  });
});

describe('refreshMaxima', () => {
  it('adds gains to current values but only caps on losses', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.hp = 5;
    c.level = 3;
    refreshMaxima(c);
    expect(c.hp).toBe(11);
    c.level = 1;
    refreshMaxima(c);
    expect(c.hp).toBe(11);
  });
});
