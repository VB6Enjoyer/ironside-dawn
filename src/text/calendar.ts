import { toCalendar } from '../sim';

export const SEASON_NAMES = ['Thaw', 'Highsun', 'Harvest', 'Deepwinter'] as const;

export function seasonName(season: number): string {
  return SEASON_NAMES[season] ?? `Season ${season + 1}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Compact log timestamp: "Y1 · Day 12 · 09:00:00". */
export function formatTimestamp(time: number): string {
  const c = toCalendar(time);
  return `Y${c.year} · Day ${c.dayOfYear} · ${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`;
}

/** Long form for the clock: "Year 1 · Thaw 12 · 09:00:00". */
export function formatDate(time: number): string {
  const c = toCalendar(time);
  return `Year ${c.year} · ${seasonName(c.season)} ${c.dayOfSeason} · ${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}`;
}

/** Rough, readable duration: "about an hour", "about 9 hours", "about 2 days". */
export function describeDuration(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1.5) return 'about an hour';
  if (hours < 30) return `about ${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'about a day' : `about ${days} days`;
}
