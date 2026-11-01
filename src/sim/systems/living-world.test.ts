import { describe, expect, it } from 'vitest';

import { HOMELANDS, PEOPLES, type MapDef } from '../../content';
import { DAY, YEAR } from '../core/time';
import { generateMap } from '../gen/geography';
import type { Character, Location } from '../model';
import { testCharacter, testContext } from '../test-support';
import { die } from './death';
import { dreadDay, dreadFell, raiseInitialDread } from './dread';
import { lordsDay, seatLords } from './lords';
import { raidTown } from './raids';
import { findPath } from './roads';
import { travelFactor, weatherDay } from './weather';
import { waylay, wildsDay } from './wilds';
import { moveTo } from './whereabouts';

type Ctx = ReturnType<typeof testContext>;

function world(seed = 'living', size: 'small' | 'medium' = 'small') {
  const map = generateMap(seed, size);
  return { map, ctx: testContext(seed, map) };
}

const of = (ctx: Ctx, kind: Location['kind']) =>
  [...ctx.world.locations.values()].filter((l) => l.kind === kind);

describe('generated worlds', () => {
  it('are the same for the same seed, and different for another', () => {
    expect(generateMap('alpha', 'small')).toEqual(generateMap('alpha', 'small'));
    const names = (m: MapDef) => m.locations.map((l) => l.name).join();
    expect(names(generateMap('alpha', 'small'))).not.toBe(names(generateMap('beta', 'small')));
  });

  it('give every people a home in its own land, and keep the wastes for the dread', () => {
    for (const seed of ['one', 'two', 'three']) {
      const map = generateMap(seed, 'medium');
      const regions = new Map(map.regions!.map((r) => [r.id, r]));
      for (const people of PEOPLES) {
        const homes = map.locations.filter(
          (l) => l.kind === 'town' && (l.population?.[people] ?? 0) > 0,
        );
        expect(homes.length, `${seed}: ${people}`).toBeGreaterThan(0);
        expect(homes.some((l) => regions.get(l.region!)!.biome === HOMELANDS[people])).toBe(true);
      }
      const wastes = map.locations.filter((l) => regions.get(l.region!)!.biome === 'wastes');
      expect(wastes.every((l) => l.kind !== 'town')).toBe(true);
      // A few border towns take in two peoples.
      const mixed = map.locations.filter((l) => Object.keys(l.population ?? {}).length > 1);
      expect(mixed.length).toBeGreaterThan(0);
    }
  });

  it('join every place by road', () => {
    const { ctx } = world('roads', 'medium');
    const [first, ...rest] = [...ctx.world.locations.keys()];
    for (const id of rest) expect(findPath(ctx.world, first!, id), id).not.toBeNull();
  });

  it('give each fortress some lands to hold', () => {
    const { ctx } = world();
    const fortresses = of(ctx, 'fortress');
    expect(fortresses.length).toBeGreaterThan(0);
    for (const f of fortresses) expect(f.fortress!.territory.length).toBeGreaterThan(0);
  });
});

describe('weather', () => {
  it('turns with the seasons, and slows the roads', () => {
    const { ctx } = world('weather');
    const seen = new Set<string>();
    for (let day = 0; day < 360; day++) {
      ctx.world.time += DAY;
      weatherDay(ctx);
      for (const r of ctx.world.regions.values()) seen.add(r.weather);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const region = [...ctx.world.regions.values()][0]!;
    const place = [...ctx.world.locations.values()].find((l) => l.regionId === region.id)!;
    region.weather = 'snow';
    expect(travelFactor(ctx.world, place)).toBeGreaterThan(1);
  });
});

describe('the wilds', () => {
  it('send creatures out of full dungeons, and they fall on travelers', () => {
    const { ctx } = world('wilds');
    for (const d of of(ctx, 'dungeon')) {
      for (const i of d.dungeon!.def.inhabitants) d.dungeon!.population[i.creature] = i.max;
    }
    for (let day = 0; day < 200; day++) {
      ctx.world.time += DAY;
      wildsDay(ctx);
    }
    expect(ctx.events.some((e) => e.type === 'creature.migrate')).toBe(true);
    const wild = [...ctx.world.locations.values()].find(
      (l) => l.kind !== 'town' && Object.keys(l.roaming).length > 0,
    );
    expect(wild).toBeDefined();
    Object.assign(wild!.roaming, { wolf: 20 });
    const traveler = testCharacter(ctx);
    moveTo(ctx.world, traveler, wild!.id);
    let attacked = false;
    for (let i = 0; i < 50 && !attacked; i++) attacked = waylay(ctx, traveler, wild!);
    expect(attacked).toBe(true);
    expect(traveler.activity.kind).toBe('fighting');
  });

  it('breed back slowly once cleared', () => {
    const { ctx } = world('cleared');
    const dungeon = of(ctx, 'dungeon')[0]!.dungeon!;
    // The slowest breeders: rats are back within a month, as rats are.
    const [first] = [...dungeon.def.inhabitants].sort(
      (a, b) => a.regrowthPerDay / a.max - b.regrowthPerDay / b.max,
    );
    dungeon.population[first!.creature] = 0;
    for (let day = 0; day < 30; day++) {
      ctx.world.time += DAY;
      wildsDay(ctx);
    }
    // A month on, still far short of a full house.
    expect(dungeon.population[first!.creature] ?? 0).toBeLessThan(first!.max / 2);
  });
});

describe('raids', () => {
  it('plunder a town nobody defends', () => {
    const { ctx } = world('sack');
    const town = of(ctx, 'town')[0]!;
    for (const c of ctx.world.characters.values()) moveTo(ctx.world, c, null);
    const before = Object.values(town.population).reduce((a, n) => a + n!, 0);
    const gold = ctx.world.markets.get(town.id)!.house.gold;
    raidTown(ctx, town, [{ species: 'ghoul', count: 8 }], null, null);
    const after = Object.values(town.population).reduce((a, n) => a + n!, 0);
    expect(after).toBeLessThan(before);
    expect(ctx.world.markets.get(town.id)!.house.gold).toBeLessThan(gold);
    expect(ctx.events.some((e) => e.type === 'raid.sack')).toBe(true);
  });

  it('meet the defenders of a town in a fight', () => {
    const { ctx } = world('defend');
    const town = of(ctx, 'town')[0]!;
    const defender = testCharacter(ctx);
    moveTo(ctx.world, defender, town.id);
    raidTown(ctx, town, [{ species: 'wolf', count: 2 }], null, null);
    expect(defender.activity.kind).toBe('fighting');
  });
});

describe('lords', () => {
  it('hold every fortress, take tithes, and pass the seat to their children', () => {
    const { ctx } = world('lords');
    seatLords(ctx);
    const place = of(ctx, 'fortress')[0]!;
    const lord = ctx.world.characters.get(place.fortress!.lordId!)!;
    expect(lord.calling).toBe('lord');
    expect(lord.locationId).toBe(place.id);
    expect(place.fortress!.garrison).toBeGreaterThan(0);

    const purse = lord.gold;
    for (let day = 0; day < 30; day++) lordsDay(ctx);
    expect(lord.gold).not.toBe(purse);

    const heir = testCharacter(ctx);
    lord.children.push(heir.id);
    (heir as unknown as { parents: string[] }).parents = [lord.id];
    die(ctx, lord, { kind: 'age', age: 70 });
    expect(place.fortress!.lordId).toBeNull();
    lordsDay(ctx);
    expect(place.fortress!.lordId).toBe(heir.id);
    expect(heir.calling).toBe('lord');
    expect(ctx.events.some((e) => e.type === 'lord.seat' && e.data.how === 'inherited')).toBe(true);
  });
});

describe('the dread', () => {
  function lairWithMaster(seed: string): { ctx: Ctx; lair: Location; master: Character } {
    for (let i = 0; ; i++) {
      const { ctx } = world(`${seed}${i}`);
      raiseInitialDread(ctx);
      const lair = of(ctx, 'dungeon').find((d) => d.dungeon!.masterId);
      if (lair) return { ctx, lair, master: ctx.world.characters.get(lair.dungeon!.masterId!)! };
    }
  }

  it('rise in lairs, strong, and never age', () => {
    const { master, lair } = lairWithMaster('rise');
    expect(master.calling).toBe('dread');
    expect(master.locationId).toBe(lair.id);
    expect(master.level).toBeGreaterThanOrEqual(10);
    expect(master.maxHp).toBeGreaterThan(100);
  });

  it('mend between fights, and fall in the end, freeing the lair', () => {
    const { ctx, lair, master } = lairWithMaster('fall');
    master.hp = 1;
    ctx.world.time += YEAR;
    dreadDay(ctx);
    expect(master.hp).toBeGreaterThan(1);

    const heroes = [testCharacter(ctx), testCharacter(ctx)];
    die(ctx, master, { kind: 'character', characterId: heroes[0]!.id });
    dreadFell(ctx, master, heroes, lair.id);
    expect(lair.dungeon!.masterId).toBeNull();
    expect(ctx.world.tally.dreadSlain).toBe(1);
    expect(heroes[1]!.deeds.some((d) => d.kind === 'vanquish')).toBe(true);
    expect(ctx.events.some((e) => e.type === 'dread.fall')).toBe(true);
    // The dread are never remembered as heroes.
    expect(ctx.events.some((e) => e.type === 'legend.hero')).toBe(false);
  });
});
