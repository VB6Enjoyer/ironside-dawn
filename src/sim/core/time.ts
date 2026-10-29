/**
 * World time and the calendar (ARCHITECTURE.md §4.2).
 *
 * World time is a single integer: seconds since the world began, which is
 * midnight on day 1 of year 1. A year has four seasons of 90 days each.
 * Season names are display text and live in `src/text`.
 */

export const SECOND = 1;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_SEASON = 90;
export const DAYS_PER_YEAR = SEASONS_PER_YEAR * DAYS_PER_SEASON;
export const SEASON = DAYS_PER_SEASON * DAY;
export const YEAR = DAYS_PER_YEAR * DAY;

export interface CalendarDate {
  /** 1-based. */
  readonly year: number;
  /** 1-based, 1 to 360. */
  readonly dayOfYear: number;
  /** 0-based, 0 to 3. */
  readonly season: number;
  /** 1-based, 1 to 90. */
  readonly dayOfSeason: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export function toCalendar(time: number): CalendarDate {
  if (!Number.isSafeInteger(time) || time < 0) {
    throw new RangeError(`World time must be a non-negative integer, got ${time}`);
  }
  const daysElapsed = Math.floor(time / DAY);
  const secondOfDay = time - daysElapsed * DAY;
  const dayIndexInYear = daysElapsed % DAYS_PER_YEAR;
  return {
    year: Math.floor(daysElapsed / DAYS_PER_YEAR) + 1,
    dayOfYear: dayIndexInYear + 1,
    season: Math.floor(dayIndexInYear / DAYS_PER_SEASON),
    dayOfSeason: (dayIndexInYear % DAYS_PER_SEASON) + 1,
    hour: Math.floor(secondOfDay / HOUR),
    minute: Math.floor((secondOfDay % HOUR) / MINUTE),
    second: secondOfDay % MINUTE,
  };
}

/** Seconds since midnight. */
export function timeOfDay(time: number): number {
  return time % DAY;
}

/** The first moment of the next season strictly after `time`. */
export function startOfNextSeason(time: number): number {
  return (Math.floor(time / SEASON) + 1) * SEASON;
}

/** The next occurrence of `secondOfDay` strictly after `time`. */
export function nextTimeOfDay(time: number, secondOfDay: number): number {
  const today = time - timeOfDay(time) + secondOfDay;
  return today > time ? today : today + DAY;
}
