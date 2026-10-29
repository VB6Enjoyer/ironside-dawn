import { describe, expect, it } from 'vitest';

import {
  DAY,
  DAYS_PER_YEAR,
  HOUR,
  MINUTE,
  nextTimeOfDay,
  SEASON,
  startOfNextSeason,
  toCalendar,
  YEAR,
} from './time';

describe('toCalendar', () => {
  it('starts at midnight on day 1 of year 1', () => {
    expect(toCalendar(0)).toEqual({
      year: 1,
      dayOfYear: 1,
      season: 0,
      dayOfSeason: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it('splits a time of day into hours, minutes and seconds', () => {
    const c = toCalendar(11 * DAY + 9 * HOUR + 5 * MINUTE + 7);
    expect([c.dayOfYear, c.hour, c.minute, c.second]).toEqual([12, 9, 5, 7]);
  });

  it('rolls over seasons and years at the right moments', () => {
    expect(toCalendar(SEASON - 1)).toMatchObject({ season: 0, dayOfSeason: 90, hour: 23 });
    expect(toCalendar(SEASON)).toMatchObject({ season: 1, dayOfSeason: 1, dayOfYear: 91 });
    expect(toCalendar(YEAR - 1)).toMatchObject({ year: 1, season: 3, dayOfYear: DAYS_PER_YEAR });
    expect(toCalendar(YEAR)).toMatchObject({ year: 2, season: 0, dayOfYear: 1 });
  });

  it('rejects invalid times', () => {
    expect(() => toCalendar(-1)).toThrow(RangeError);
    expect(() => toCalendar(1.5)).toThrow(RangeError);
  });
});

describe('startOfNextSeason', () => {
  it('is strictly after the given time', () => {
    expect(startOfNextSeason(0)).toBe(SEASON);
    expect(startOfNextSeason(SEASON - 1)).toBe(SEASON);
    expect(startOfNextSeason(SEASON)).toBe(2 * SEASON);
  });
});

describe('nextTimeOfDay', () => {
  it('finds today if still ahead, otherwise tomorrow', () => {
    expect(nextTimeOfDay(5 * HOUR, 6 * HOUR)).toBe(6 * HOUR);
    expect(nextTimeOfDay(6 * HOUR, 6 * HOUR)).toBe(DAY + 6 * HOUR);
    expect(nextTimeOfDay(22 * HOUR, 6 * HOUR)).toBe(DAY + 6 * HOUR);
  });
});
