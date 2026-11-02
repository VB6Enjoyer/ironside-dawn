import { describe, expect, it } from 'vitest';

import { CULTURES, packCultures, packOf, WEAPONS, type CultureDef } from '../../content';
import { generateMap } from '../gen/geography';
import { createCharacter } from '../gen/people';
import { testCharacter, testContext } from '../test-support';
import { die } from './death';
import { generateItem } from './items';
import { learnSpells } from './magic';
import { creatureKilled, mythFear } from './myths';

function world(seed: string) {
  const map = generateMap(seed, 'medium');
  return { map, ctx: testContext(seed, map) };
}

/** A world with a haunted ford in it, and the ford. */
function withFord(seed: string) {
  for (let i = 0; ; i++) {
    const { ctx } = world(`${seed}${i}`);
    const ford = [...ctx.world.locations.values()].find((l) => l.haunt);
    if (ford) return { ctx, ford };
  }
}

const townOf = (ctx: ReturnType<typeof testContext>, culture: string) =>
  [...ctx.world.locations.values()].find((l) => l.kind === 'town' && l.culture === culture);

describe('culture packs', () => {
  it('each take a cluster of a medium world’s regions, never the wastes', () => {
    for (const seed of ['one', 'two', 'three']) {
      const { map } = world(seed);
      for (const culture of packCultures()) {
        const lands = map.regions!.filter((r) => r.culture === culture);
        expect(lands.length, `${seed} ${culture}`).toBeGreaterThan(0);
        expect(lands.every((r) => r.biome !== 'wastes')).toBe(true);
      }
    }
  });

  it('raise the peoples of their lands in their ways, and name their towns', () => {
    const { map } = world('raised');
    const regions = new Map(map.regions!.map((r) => [r.id, r]));
    for (const town of map.locations.filter((l) => l.kind === 'town')) {
      const region = regions.get(town.region!)!;
      const people = Object.keys(town.population ?? {})[0] as 'human';
      const pack = region.culture ? packOf(region.culture) : null;
      if (pack?.peoples[people]) expect(town.culture).toBe(region.culture);
      else expect(town.culture).not.toBe('japonic');
    }
  });

  it('haunt the fords of Japonic lands with kappa', () => {
    const { ctx } = world('fords');
    const haunted = [...ctx.world.locations.values()].filter((l) => l.haunt);
    expect(haunted.length).toBeGreaterThan(0);
    for (const l of haunted) {
      expect(l.culture).toBe('japonic');
      expect(l.roaming.kappa).toBeGreaterThan(0);
    }
  });

  it('give those raised in them local names and arms', () => {
    const { ctx } = world('ronin');
    const home = townOf(ctx, 'japonic')!;
    const japonic = CULTURES.japonic as CultureDef;
    for (let i = 0; i < 20; i++) {
      const c = createCharacter(ctx, home, { newcomer: false, firstWakeWithin: 0 });
      if (c.species !== 'human') continue;
      expect(c.culture).toBe('japonic');
      expect(japonic.givenNames).toContain(c.givenName);
      expect(['katana', 'naginata', 'yumi']).toContain(c.equipment.weapon.base);
    }
  });

  it('keep their own arms mostly in their own lands', () => {
    const ctx = testContext('arms');
    let foreign = 0;
    for (let i = 0; i < 400; i++) {
      const item = generateItem(ctx, ctx.rng.items, {
        culture: 'generic',
        depth: 3,
        slot: 'weapon',
      });
      if (WEAPONS.find((w) => w.id === item.base)!.culture === 'japonic') foreign++;
    }
    expect(foreign).toBeLessThan(400 * 0.03);
  });

  it('teach their own magic, and not another culture’s', () => {
    const { ctx } = world('magic');
    const c = createCharacter(ctx, townOf(ctx, 'japonic')!, {
      newcomer: false,
      firstWakeWithin: 0,
    });
    (c as { culture: string }).culture = 'japonic';
    c.skills.arcana = 60;
    learnSpells(ctx, c, c.homeId);
    expect(c.spells).toContain('foxfire');
    expect(c.spells).not.toContain('thunder-rune');
  });
});

describe('myths', () => {
  it('grow out of deaths at a wild place, and frighten those raised on them', () => {
    const { ctx, ford } = withFord('kappa');
    for (let i = 0; i < 3; i++) creatureKilled(ctx, ford, 'kappa');
    expect(ctx.world.myths).toHaveLength(1);
    expect(ctx.events.some((e) => e.type === 'myth.born')).toBe(true);

    const local = createCharacter(ctx, townOf(ctx, 'japonic')!, {
      newcomer: false,
      firstWakeWithin: 0,
    });
    (local as { culture: string }).culture = 'japonic';
    const stranger = testCharacter(ctx);
    (stranger as { culture: string }).culture = 'generic';
    ctx.world.time += 86_400;
    expect(mythFear(ctx.world, local, ford.id)).toBeGreaterThan(0);
    expect(mythFear(ctx.world, stranger, ford.id)).toBe(0);
  });

  it('count deaths in the world as they happen', () => {
    const { ctx, ford } = withFord('deaths');
    for (let i = 0; i < 3; i++) {
      const victim = testCharacter(ctx);
      victim.locationId = ford.id;
      die(ctx, victim, {
        kind: 'creature',
        creature: { species: 'kappa', affix: null, ordinal: 0 },
      });
    }
    expect(ctx.world.myths[0]?.subject).toEqual({ kind: 'creature', creature: 'kappa' });
  });
});
