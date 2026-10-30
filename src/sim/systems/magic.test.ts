import { describe, expect, it } from 'vitest';

import { spellDef } from '../../content';
import { testCharacter, testContext } from '../test-support';
import { cast, costsFor, learnSpells, successChance } from './magic';
import { refreshMaxima, xpForLevel } from './progress';

/** A practiced caster, high enough level that test casts can't level them up. */
function mage(seed = 'magic') {
  const ctx = testContext(seed);
  const c = testCharacter(ctx);
  c.skills.arcana = 30;
  c.spells = ['ember-bolt', 'mend-flesh'];
  c.level = 50;
  c.xp = xpForLevel(50);
  refreshMaxima(c);
  const rested = () => {
    c.statuses = [];
    c.hp = c.maxHp;
    c.stamina = c.maxStamina;
  };
  rested();
  return { ctx, c, rested };
}

describe('casting', () => {
  it('produces every outcome, mostly successes for a practiced caster', () => {
    const { ctx, c, rested } = mage();
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      rested();
      const { outcome } = cast(ctx, c, 'mend-flesh', c.homeId, null, null);
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    }
    expect([...outcomes.keys()].sort()).toEqual(['backlash', 'failure', 'partial', 'success']);
    expect(outcomes.get('success')!).toBeGreaterThan(1000);
  });

  it('backlashes more often while dizzy', () => {
    const backlashRate = (dizzy: boolean) => {
      const { ctx, c, rested } = mage(`dizzy-${dizzy}`);
      let backlashes = 0;
      for (let i = 0; i < 2000; i++) {
        rested();
        if (dizzy) c.statuses = [{ kind: 'dizzy', until: ctx.world.time + 1 }];
        if (cast(ctx, c, 'ember-bolt', c.homeId, null, null).outcome === 'backlash') backlashes++;
      }
      return backlashes / 2000;
    };
    expect(backlashRate(true)).toBeGreaterThan(backlashRate(false) * 2);
  });

  it('always costs something, and a backlash costs double plus a burn', () => {
    const { ctx, c, rested } = mage();
    for (let i = 0; i < 300; i++) {
      rested();
      // Casting practices arcana, which lowers later costs, so check each cast's own.
      const costs = costsFor(c, spellDef('mend-flesh'));
      const before = c.hp;
      const { outcome, amount } = cast(ctx, c, 'mend-flesh', c.homeId, null, null);
      const event = ctx.events.at(-1)!;
      if (event.type !== 'magic.cast') throw new Error('expected a cast event');
      const health = event.data.paid.health;
      if (outcome === 'backlash') expect(health).toBeGreaterThan(costs.health * 2);
      else expect(health).toBe(costs.health);
      expect(c.hp).toBe(before - health);
      if (outcome === 'failure' || outcome === 'backlash') expect(amount).toBe(0);
    }
  });

  it('shrinks costs with mastery', () => {
    const { c } = mage();
    c.skills.arcana = 0;
    const novice = costsFor(c, spellDef('ward-of-ash')).stamina;
    c.skills.arcana = 90;
    const master = costsFor(c, spellDef('ward-of-ash')).stamina;
    expect(master).toBeLessThan(novice);
  });

  it('can kill a caster with nothing left to give', () => {
    const ctx = testContext('fatal');
    const c = testCharacter(ctx);
    c.skills.arcana = 30;
    c.spells = ['mend-flesh'];
    let died = false;
    for (let i = 0; i < 200 && !died; i++) {
      c.hp = 3;
      c.statuses = [];
      died = cast(ctx, c, 'mend-flesh', c.homeId, null, null).fatal;
    }
    expect(died).toBe(true);
    expect(c.death?.cause).toEqual({ kind: 'magic', spell: 'mend-flesh' });
  });

  it('gives better odds to the more skilled', () => {
    const { ctx, c } = mage();
    c.skills.arcana = 0;
    const novice = successChance(c, spellDef('quickening'), ctx.world.time);
    c.skills.arcana = 80;
    expect(successChance(c, spellDef('quickening'), ctx.world.time)).toBeGreaterThan(novice);
  });
});

describe('learnSpells', () => {
  it('teaches every spell the arcana allows, once', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.spells = [];
    c.skills.arcana = 36;
    learnSpells(ctx, c, c.homeId);
    learnSpells(ctx, c, c.homeId);
    expect(c.spells).toEqual(['ember-bolt', 'mend-flesh', 'quickening']);
    expect(ctx.events.filter((e) => e.type === 'magic.learn')).toHaveLength(3);
  });
});
