import { DAY, HOUR, MINUTE } from '../sim';

const number = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return number.format(n);
}

/** "≈ 1.0 hours per second" for a measured in-game seconds per real second. */
export function formatRate(rate: number): string {
  if (rate <= 0) return 'paused';
  if (rate >= DAY / 2) return `≈ ${(rate / DAY).toFixed(1)} days per second`;
  if (rate >= HOUR / 2) return `≈ ${(rate / HOUR).toFixed(1)} hours per second`;
  if (rate >= MINUTE / 2) return `≈ ${(rate / MINUTE).toFixed(1)} minutes per second`;
  return `≈ ${rate.toFixed(1)} seconds per second`;
}
