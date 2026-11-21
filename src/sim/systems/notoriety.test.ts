import { describe, expect, it } from 'vitest';

import type { Crime, CrimeKind, LocationId } from '../model';
import { DAY } from '../core/time';
import { testCharacter, testContext } from '../test-support';
import { isShunned, newsDay, recordCrime, standingIn } from './notoriety';

const concordale = 'concordale' as LocationId;
const saltmere = 'saltmere' as LocationId;

function crime(at: number, kind: CrimeKind = 'burglary', known = true): Crime {
  return { kind, at, locationId: concordale, townId: concordale, value: 40, known };
}

/** Days pass, a morning's news at a time. */
function days(ctx: ReturnType<typeof testContext>, n: number) {
  for (let i = 0; i < n; i++) {
    ctx.world.time += DAY;
    newsDay(ctx);
  }
}

describe('word of crimes', () => {
  it('is heard at once where it happened, and days later down the road', () => {
    const ctx = testContext('word');
    const thief = testCharacter(ctx);
    recordCrime(ctx, thief, crime(ctx.world.time));
    expect(standingIn(thief, concordale)).toBe('suspected');
    expect(thief.notoriety[saltmere]).toBeUndefined();
    days(ctx, 1);
    expect(thief.notoriety[saltmere]).toBeUndefined();
    days(ctx, 5);
    expect(thief.notoriety[saltmere]?.crimes).toBe(1);
    expect(ctx.world.news).toHaveLength(0);
  });

  it('never tells of a crime nobody saw', () => {
    const ctx = testContext('unseen');
    const thief = testCharacter(ctx);
    recordCrime(ctx, thief, crime(ctx.world.time, 'burglary', false));
    days(ctx, 10);
    expect(thief.notoriety).toEqual({});
    expect(thief.crimes).toHaveLength(1);
  });

  it('shuts doors to a repeat offender, and bars a murderer for good', () => {
    const ctx = testContext('bar');
    const thief = testCharacter(ctx);
    for (let i = 0; i < 3; i++) recordCrime(ctx, thief, crime(ctx.world.time, 'holdup'));
    expect(standingIn(thief, concordale)).toBe('unwelcome');
    expect(isShunned(thief, concordale)).toBe(true);
    const killer = testCharacter(ctx);
    recordCrime(ctx, killer, crime(ctx.world.time, 'murder'));
    days(ctx, 10);
    expect(standingIn(killer, concordale)).toBe('barred');
    expect(standingIn(killer, saltmere)).toBe('barred');
    days(ctx, 360 * 5);
    expect(standingIn(killer, concordale)).toBe('barred');
  });

  it('fades with the years for petty crimes', () => {
    const ctx = testContext('fade');
    const thief = testCharacter(ctx);
    recordCrime(ctx, thief, crime(ctx.world.time));
    expect(standingIn(thief, concordale)).toBe('suspected');
    days(ctx, 360 * 3);
    expect(standingIn(thief, concordale)).toBe('welcome');
    // The count stays: the town remembers there was something.
    expect(thief.notoriety[concordale]?.crimes).toBe(1);
  });

  it('dies with the one it tells of', () => {
    const ctx = testContext('dead');
    const thief = testCharacter(ctx);
    recordCrime(ctx, thief, crime(ctx.world.time));
    thief.death = { at: ctx.world.time, cause: { kind: 'age', age: 80 }, locationId: concordale };
    days(ctx, 10);
    expect(thief.notoriety[saltmere]).toBeUndefined();
    expect(ctx.world.news).toHaveLength(0);
  });
});
