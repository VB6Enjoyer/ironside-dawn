import { describe, expect, it } from 'vitest';

import { itemAffixDef, itemBase } from '../../content';
import { testCharacter, testContext } from '../test-support';
import { gearScore, gearTotals, generateItem, itemEffects, takeGear } from './items';

describe('generateItem', () => {
  const ctx = testContext('items');
  const rng = ctx.rng.items;
  const many = (depth: number, n = 3000) =>
    Array.from({ length: n }, () => generateItem(ctx, rng, { culture: 'generic', depth }));

  it('makes deeper finds rarer and finer', () => {
    const share = (items: ReturnType<typeof many>) =>
      items.filter((i) => i.rarity === 'rare' || i.rarity === 'legendary').length / items.length;
    expect(share(many(10))).toBeGreaterThan(share(many(0)) * 1.5);
  });

  it('never makes a plain trinket', () => {
    const trinkets = many(0).filter((i) => itemBase(i.base).slot === 'trinket');
    expect(trinkets.length).toBeGreaterThan(100);
    expect(trinkets.every((i) => i.rarity !== 'common' && i.affixes.length > 0)).toBe(true);
  });

  it('gives at most one prefix and one suffix, all fitting the slot', () => {
    for (const item of many(5)) {
      const affixes = item.affixes.map(itemAffixDef);
      expect(affixes.filter((a) => a.position === 'prefix').length).toBeLessThanOrEqual(1);
      expect(affixes.filter((a) => a.position === 'suffix').length).toBeLessThanOrEqual(1);
      const slot = itemBase(item.base).slot;
      for (const a of affixes) expect(a.slots).toContain(slot);
    }
  });

  it('names legendary items, and only them, without repeats', () => {
    const legendCtx = testContext('legends');
    const names: string[] = [];
    for (let i = 0; i < 60; i++) {
      const item = generateItem(legendCtx, legendCtx.rng.items, {
        culture: 'generic',
        depth: 0,
        rarity: 'legendary',
      });
      legendCtx.world.legends.set(item.id, { item, holder: null, lostAt: null, owners: [] });
      names.push(item.uniqueName!);
    }
    expect(new Set(names).size).toBe(names.length);
    expect(
      many(0, 200)
        .filter((i) => i.rarity !== 'legendary')
        .every((i) => !i.uniqueName),
    ).toBe(true);
  });

  it('gives every item a unique ID and a positive value', () => {
    const items = many(3, 500);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => i.value > 0)).toBe(true);
  });
});

describe('gear effects', () => {
  it('adds weapon accuracy, material and affixes', () => {
    const ctx = testContext();
    const sword = generateItem(ctx, ctx.rng.items, {
      culture: 'generic',
      depth: 0,
      base: 'shortsword',
      material: 'steel',
      rarity: 'common',
    });
    expect(itemEffects(sword)).toMatchObject({ attack: 2, damage: 0, defense: 0 });
  });

  it('sums everything worn', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const armor = itemEffects(c.equipment.armor!).defense;
    expect(gearTotals(c).defense).toBe(armor);
  });
});

describe('takeGear', () => {
  it('wears a clear upgrade and packs the old piece to sell', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const old = c.equipment.armor!;
    const plate = generateItem(ctx, ctx.rng.items, {
      culture: 'generic',
      depth: 0,
      base: 'plate',
      material: 'steel',
      rarity: 'common',
    });
    takeGear(ctx, c, plate, c.homeId);
    expect(c.equipment.armor).toBe(plate);
    expect(c.pack).toContainEqual({ gear: old, value: old.value });
    expect(ctx.events.at(-1)?.type).toBe('item.equip');
  });

  it('packs something worse without wearing it', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const worn = c.equipment.weapon;
    const rusty = generateItem(ctx, ctx.rng.items, {
      culture: 'generic',
      depth: 0,
      base: 'shortsword',
      material: 'rusted',
      rarity: 'common',
    });
    expect(gearScore(rusty, c)).toBeLessThan(gearScore(worn, c));
    takeGear(ctx, c, rusty, c.homeId);
    expect(c.equipment.weapon).toBe(worn);
    expect(c.pack).toContainEqual({ gear: rusty, value: rusty.value });
  });
});
