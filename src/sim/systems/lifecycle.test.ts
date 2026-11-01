import { describe, expect, it } from 'vitest';

import { SPECIES } from '../../content';
import { DAY, YEAR } from '../core/time';
import type { Character } from '../model';
import { testCharacter, testContext, town } from '../test-support';
import { die } from './death';
import { generateItem } from './items';
import { ageOf, lifecycleDay } from './lifecycle';
import { adjustOpinion, isKin, socialize } from './social';

type Ctx = ReturnType<typeof testContext>;

/** Runs the daily round for some days. */
function days(ctx: Ctx, n: number, target = 20) {
  for (let i = 0; i < n; i++) {
    ctx.world.time += DAY;
    lifecycleDay(ctx, target);
  }
}

/** Makes a character this many years old, in place. */
function ageTo(c: Character, now: number, years: number) {
  (c as { born: number }).born = now - years * YEAR;
}

function couple(ctx: Ctx) {
  const a = testCharacter(ctx);
  const b = testCharacter(ctx);
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    adjustOpinion(x, y.id, { affinity: 1, trust: 1, familiarity: 1 }, ctx.world.time);
    x.opinions[y.id]!.bond = 'friend';
  }
  return { a, b };
}

describe('ages', () => {
  it('start grown-ups within their people’s starting ages', () => {
    const ctx = testContext('ages');
    for (let i = 0; i < 30; i++) {
      const c = testCharacter(ctx);
      const [youngest, oldest] = SPECIES[c.species].startingAge;
      expect(ageOf(c, ctx.world.time)).toBeGreaterThanOrEqual(youngest);
      expect(ageOf(c, ctx.world.time)).toBeLessThanOrEqual(oldest);
    }
  });

  it('end, in the end, in death of old age', () => {
    const ctx = testContext('old');
    const elder = testCharacter(ctx);
    elder.calling = 'townsfolk';
    elder.activity = { kind: 'living' };
    ageTo(elder, ctx.world.time, SPECIES[elder.species].lifespan * 1.2);
    days(ctx, 3 * 360);
    expect(elder.death?.cause.kind).toBe('age');
  });
});

describe('retirement', () => {
  it('settles an elder adventurer in town, in a trade, off the scheduler', () => {
    const ctx = testContext('retire');
    const veteran = testCharacter(ctx);
    ageTo(veteran, ctx.world.time, SPECIES[veteran.species].lifespan * 0.7);
    const token = veteran.wakeToken;
    for (let i = 0; i < 2000 && veteran.calling === 'adventurer'; i++) days(ctx, 1);
    expect(['townsfolk', 'merchant']).toContain(veteran.calling);
    expect(ctx.events.some((e) => e.type === 'character.retire')).toBe(true);
    if (veteran.calling === 'townsfolk') {
      expect(veteran.occupation).not.toBeNull();
      expect(veteran.activity.kind).toBe('living');
      expect(veteran.wakeToken).toBeGreaterThan(token);
    }
  });
});

describe('families', () => {
  it('marry those who love each other, and never close kin', () => {
    const ctx = testContext('wedding');
    const { a, b } = couple(ctx);
    const here = town(ctx);
    for (let i = 0; i < 3000 && !a.spouseId; i++) {
      a.activity = { kind: 'pastime', pastime: 'tavern', since: 0, until: 1e12 };
      b.activity = { kind: 'pastime', pastime: 'tavern', since: 0, until: 1e12 };
      socialize(ctx, a, here);
    }
    expect(a.spouseId).toBe(b.id);
    expect(b.spouseId).toBe(a.id);
    expect(isKin(a, b)).toBe(false);
  });

  it('have children who take a family name, and come of age', () => {
    const ctx = testContext('children');
    const { a, b } = couple(ctx);
    (a as { species: string }).species = 'human';
    (b as { species: string }).species = 'human';
    ageTo(a, ctx.world.time, 25);
    ageTo(b, ctx.world.time, 25);
    a.spouseId = b.id;
    b.spouseId = a.id;
    for (let i = 0; i < 20 * 360 && a.children.length === 0; i++) days(ctx, 1);
    const child = ctx.world.characters.get(a.children[0]!)!;
    expect(child.calling).toBe('child');
    expect(child.parents).toEqual(expect.arrayContaining([a.id, b.id]));
    expect([a.familyName, b.familyName]).toContain(child.familyName);
    expect(b.children).toContain(child.id);
    expect(isKin(child, a)).toBe(true);

    days(ctx, (SPECIES.human.adultAge + 1) * 360);
    expect(['adventurer', 'townsfolk']).toContain(child.calling);
    expect(ctx.events.some((e) => e.type === 'family.comeOfAge')).toBe(true);
  });

  it('leave gold and gear to the heir when someone dies at home', () => {
    const ctx = testContext('heir');
    const { a, b } = couple(ctx);
    a.spouseId = b.id;
    b.spouseId = a.id;
    a.gold = 300;
    const heirloom = generateItem(ctx, ctx.rng.items, {
      culture: 'generic',
      depth: 5,
      rarity: 'legendary',
      slot: 'trinket',
    });
    ctx.world.legends.set(heirloom.id, { item: heirloom, holder: a.id, lostAt: null, owners: [] });
    a.pack.push({ gear: heirloom, value: heirloom.value });
    const before = b.gold;
    die(ctx, a, { kind: 'age', age: 80 });
    expect(b.gold).toBe(before + 300);
    expect(ctx.world.legends.get(heirloom.id)!.holder).toBe(b.id);
    expect(ctx.events.some((e) => e.type === 'family.inherit')).toBe(true);
  });

  it('let lone townsfolk of a crowded people move on, unmourned', () => {
    const ctx = testContext('movers');
    const loners: Character[] = [];
    for (let i = 0; i < 40; i++) {
      const c = testCharacter(ctx);
      c.calling = 'townsfolk';
      c.activity = { kind: 'living' };
      loners.push(c);
    }
    days(ctx, 10 * 360, 2);
    const gone = loners.filter((c) => c.death?.cause.kind === 'departed');
    expect(gone.length).toBeGreaterThan(0);
    expect(ctx.events.some((e) => e.type === 'social.mourn')).toBe(false);
  });

  it('let married townsfolk of a crowded people move on together', () => {
    const ctx = testContext('couples');
    const couples: [Character, Character][] = [];
    for (let i = 0; i < 20; i++) {
      const { a, b } = couple(ctx);
      for (const c of [a, b]) {
        c.calling = 'townsfolk';
        c.activity = { kind: 'living' };
        ageTo(c, ctx.world.time, SPECIES[c.species].lifespan * 0.7); // past having children
      }
      a.spouseId = b.id;
      b.spouseId = a.id;
      couples.push([a, b]);
    }
    days(ctx, 10 * 360, 2);
    const gone = couples.filter(
      ([a, b]) => a.death?.cause.kind === 'departed' || b.death?.cause.kind === 'departed',
    );
    expect(gone.length).toBeGreaterThan(0);
    for (const [a, b] of gone) {
      // Whoever went first, the other followed the same day, unless age took them before.
      const kinds = [a.death?.cause.kind, b.death?.cause.kind];
      if (kinds.includes('age')) continue;
      expect(kinds).toEqual(['departed', 'departed']);
      expect(a.death!.at).toBe(b.death!.at);
    }
  });
});
