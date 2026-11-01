import {
  DAY,
  HOUR,
  MINUTE,
  roleOf,
  YEAR,
  toCalendar,
  type Character,
  type Occupation,
} from '../sim';

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

const OCCUPATION_TITLES: Record<Occupation, string> = {
  innkeeper: 'Innkeeper',
  smith: 'Smith',
  trainer: 'Weapons master',
  farmer: 'Farmer',
  clerk: 'Clerk',
};

/** "Level 7 fighter", "Merchant", "Retired smith" or "Child", for headings. */
export function callingTitle(c: Character): string {
  switch (c.calling) {
    case 'adventurer':
      return `Level ${c.level} ${roleOf(c)}`;
    case 'merchant':
      return 'Merchant';
    case 'child':
      return 'Child';
    case 'townsfolk': {
      const trade = c.occupation ? OCCUPATION_TITLES[c.occupation] : 'Townsfolk';
      // Those who once adventured have earned some levels on the way.
      return c.level > 1 ? `Retired ${trade.toLowerCase()}` : trade;
    }
  }
}

/** "b. 12" or "12–80" in years of the chronicle; years before it began count down from 0. */
export function lifeYears(born: number, died: number | null): string {
  const year = (t: number) =>
    t < 0 ? `${Math.floor(t / YEAR) + 1}`.replace('-', '−') : String(toCalendar(t).year);
  return died === null ? `b. ${year(born)}` : `${year(born)}–${year(died)}`;
}
