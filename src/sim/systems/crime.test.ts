import { describe, expect, it } from 'vitest';

import type { Character, LocationId } from '../model';
import { DAY } from '../core/time';
import { testCharacter, testContext } from '../test-support';
import { canFence, commitCrime, dayCrimes, fence, nightWork, waylayCaravan } from './crime';
import { standingIn } from './notoriety';

const concordale = 'concordale' as LocationId;
const saltmere = 'saltmere' as LocationId;
const woods = 'witherwood' as LocationId;

const outlawRecord = (c: Character) =>
  (c.outlaw = { since: 0, crimes: 0, murders: 0, lastCrimeAt: 0, lastSeenAt: concordale });
const handsOf = (c: Character, skill: number) => {
  c.skills = { ...c.skills, stealth: skill, lockpicking: skill };
};
/** Someone who would take a chance: little honor or kindness, and a thief's skills. */
const thiefAtHeart = (c: Character) => {
  c.traits = { ...c.traits, honor: 0.05, compassion: 0.1, greed: 0.8 };
  handsOf(c, 95);
};

describe('crimes against the nameless', () => {
  it('a deft burglar empties a purse in town, and nobody knows who', () => {
    const ctx = testContext('burgle');
    const town = ctx.world.locations.get(concordale)!;
    const market = ctx.world.markets.get(concordale)!;
    const before = market.agents.reduce((s, a) => s + a.gold, 0);
    const thief = testCharacter(ctx);
    outlawRecord(thief);
    handsOf(thief, 100);
    thief.gold = 0;
    let tried = false;
    for (let i = 0; i < 50 && !tried; i++) tried = nightWork(ctx, thief, town);
    const event = ctx.events.find((e) => e.type === 'crime.commit');
    expect(event?.type === 'crime.commit' && event.data.crime).toBe('burglary');
    expect(event?.type === 'crime.commit' && event.data.known).toBe(false);
    expect(thief.gold).toBeGreaterThan(0);
    expect(market.agents.reduce((s, a) => s + a.gold, 0)).toBe(before - thief.gold);
    expect(standingIn(thief, concordale)).toBe('welcome');
  });

  it('a holdup is done to people’s faces: the town knows at once', () => {
    const ctx = testContext('holdup');
    const town = ctx.world.locations.get(concordale)!;
    const robber = testCharacter(ctx);
    outlawRecord(robber);
    robber.level = 20;
    commitCrime(ctx, robber, town, 'holdup');
    expect(robber.crimes[0]?.kind).toBe('holdup');
    expect(standingIn(robber, concordale)).not.toBe('welcome');
    expect(ctx.world.bounties.get(robber.id)?.townId).toBe(concordale);
  });

  it('a caught thief who is no outlaw pays a fine, or is outlawed if they cannot', () => {
    const ctx = testContext('fined');
    const town = ctx.world.locations.get(concordale)!;
    const clumsy = testCharacter(ctx);
    handsOf(clumsy, 0);
    clumsy.gold = 500;
    let caught = false;
    for (let i = 0; i < 30 && !caught; i++) {
      commitCrime(ctx, clumsy, town, 'theft');
      caught = clumsy.crimes.some((c) => c.known);
    }
    expect(clumsy.gold).toBeLessThan(500);
    expect(clumsy.outlaw).toBeNull();
    const broke = testCharacter(ctx);
    handsOf(broke, 0);
    broke.gold = 0;
    for (let i = 0; i < 30 && !broke.outlaw; i++) commitCrime(ctx, broke, town, 'theft');
    expect(broke.outlaw).not.toBeNull();
  });

  it('fences take stolen goods far from where they were taken, never there', () => {
    const ctx = testContext('fence');
    const thief = testCharacter(ctx);
    thief.cargo = { silk: 5 };
    thief.stolenFrom = [concordale];
    const here = ctx.world.locations.get(concordale)!;
    const there = ctx.world.locations.get(saltmere)!;
    expect(canFence(thief, here)).toBe(false);
    expect(canFence(thief, there)).toBe(true);
    const gold = thief.gold;
    fence(ctx, thief, there);
    expect(thief.gold).toBeGreaterThan(gold);
    expect(thief.cargo).toEqual({});
    expect(thief.stolenFrom).toEqual([]);
  });

  it('tempts the willing now and then, never at home, and never the decent', () => {
    const ctx = testContext('willing');
    const there = ctx.world.locations.get(saltmere)!;
    const home = ctx.world.locations.get(concordale)!;
    const willing = testCharacter(ctx);
    thiefAtHeart(willing);
    willing.gold = 0;
    expect(dayCrimes(ctx, willing, there).map((c) => c.crime)).toEqual(['theft']);
    expect(dayCrimes(ctx, willing, home)).toEqual([]);
    // Not again so soon after the last time.
    willing.crimes.push({
      kind: 'theft',
      at: ctx.world.time - 10 * DAY,
      locationId: concordale,
      townId: concordale,
      value: 10,
      known: false,
    });
    expect(dayCrimes(ctx, willing, there)).toEqual([]);
    const decent = testCharacter(ctx);
    handsOf(decent, 95);
    decent.traits = { ...decent.traits, honor: 0.9, compassion: 0.9 };
    decent.gold = 0;
    expect(dayCrimes(ctx, decent, there)).toEqual([]);
  });

  it('caravans on the road are held up, and their loads never reach the town', () => {
    const ctx = testContext('caravan');
    const place = ctx.world.locations.get(woods)!;
    const gang = testCharacter(ctx);
    outlawRecord(gang);
    gang.level = 25;
    gang.locationId = woods;
    for (let i = 0; i < 200 && gang.crimes.length === 0; i++) waylayCaravan(ctx, gang, place, 9);
    const event = ctx.events.find((e) => e.type === 'crime.commit');
    expect(event?.type === 'crime.commit' && event.data.crime).toBe('waylay');
    // Bound for one of the towns the road joins.
    expect(event?.type === 'crime.commit' ? event.data.townId : null).toMatch(
      /concordale|saltmere/,
    );
  });
});
