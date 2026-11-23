import { isDread } from '../../content';
import type { Rng } from '../core/rng';
import type { Character, CrimeKind, LocationId, World } from '../model';

/**
 * Faith (0.4.0, ROADMAP.md "Body and Soul", step 4): how much someone
 * believes, 0 (none) to 1 (devout). Hidden: told in words, never shown as a
 * number. Pure helpers, with no other system's imports, so anything may
 * move it (see `faith.ts` for prayer and priests).
 */

/** How devout a culture's people are on the whole; the grave and infernal have no faith. */
const CULTURE_PIETY: Readonly<Record<string, number>> = {
  generic: 0.45,
  sylvan: 0.4,
  deephold: 0.5,
  steppe: 0.5,
  japonic: 0.55,
  norse: 0.5,
};
const FAITHLESS_CULTURES: ReadonlySet<string> = new Set(['grave', 'infernal']);

/** How much faith steadies nerve in danger, at its fullest. */
export const FAITH_NERVE = 0.1;

/** Whether someone can have faith at all: the grave, infernal and dread have none (for now). */
export function hasFaith(c: Character): boolean {
  return c.calling !== 'dread' && !isDread(c.species) && !FAITHLESS_CULTURES.has(c.culture);
}

/** A stable number in [0, 1) from text, for things a world decides once and never stores. */
function hashUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100_000) / 100_000;
}

/** How religious a town is beside its culture's usual, from −0.15 to +0.15. */
export function townPiety(world: World, townId: LocationId): number {
  return (hashUnit(`${world.seed}/piety/${townId}`) - 0.5) * 0.3;
}

/** Priests in a town, by its size, more where it is religious. */
export function priestsIn(world: World, townId: LocationId): number {
  const town = world.locations.get(townId);
  if (!town || town.kind !== 'town') return 0;
  const people = Object.values(town.population).reduce<number>((s, n) => s + (n ?? 0), 0);
  return Math.max(1, Math.round((people / 2000) * (1 + 2 * townPiety(world, townId))));
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Where someone's faith starts: a child takes their parents', give or take a
 * little; anyone else by their culture, their town, and their nature
 * (the honorable and compassionate lean to belief), varying a good deal.
 */
export function startingFaith(
  rng: Rng,
  world: World,
  c: Character,
  parents?: readonly Character[],
): number {
  if (!hasFaith(c)) return 0;
  if (parents && parents.length > 0) {
    const mean = parents.reduce((s, p) => s + p.faith, 0) / parents.length;
    return clamp01(mean + rng.gaussian(0, 0.08));
  }
  const base = CULTURE_PIETY[c.culture] ?? 0.45;
  return clamp01(
    base +
      townPiety(world, c.homeId) +
      0.25 * (c.traits.honor - 0.5) +
      0.2 * (c.traits.compassion - 0.5) +
      rng.gaussian(0, 0.18),
  );
}

/**
 * The faith someone's nature leans to, which theirs drifts back toward over
 * the years: their culture, town and traits, and a leaning of their own,
 * fixed for life.
 */
export function natureOf(world: World, c: Character): number {
  if (!hasFaith(c)) return 0;
  return clamp01(
    (CULTURE_PIETY[c.culture] ?? 0.45) +
      townPiety(world, c.homeId) +
      0.25 * (c.traits.honor - 0.5) +
      0.2 * (c.traits.compassion - 0.5) +
      (hashUnit(`${world.seed}/nature/${c.id}`) - 0.5) * 0.5,
  );
}

/** How far faith drifts back toward someone's nature in a day. */
const DRIFT = 0.001;

/** A day's drift of faith back toward what their nature leans to. */
export function driftFaith(world: World, c: Character): void {
  if (!hasFaith(c)) return;
  shiftFaith(c, (natureOf(world, c) - c.faith) * DRIFT);
}

/** Moves someone's faith, keeping track of the most they ever had. */
export function shiftFaith(c: Character, delta: number): void {
  if (!hasFaith(c)) return;
  c.faith = clamp01(c.faith + delta);
  c.faithPeak = Math.max(c.faithPeak, c.faith);
}

/** What each kind of crime costs a believer, the graver the more. */
const SIN: Readonly<Record<CrimeKind, number>> = {
  murder: 0.3,
  robbery: 0.08,
  holdup: 0.08,
  waylay: 0.06,
  extortion: 0.06,
  burglary: 0.05,
  theft: 0.03,
  vandalism: 0.03,
};

/**
 * A crime erodes faith. What a priest can give back is kept as `sins`: all
 * of it for lesser crimes, only half for a murder.
 */
export function sin(c: Character, kind: CrimeKind): void {
  if (!hasFaith(c)) return;
  const before = c.faith;
  shiftFaith(c, -SIN[kind] * (0.5 + c.faith));
  const lost = before - c.faith;
  c.sins += kind === 'murder' ? lost / 2 : lost;
}

/**
 * A memorable deed or a lucky escape raises faith, each less than the last:
 * `count` is how many of the kind they have had before.
 */
export function blessing(c: Character, amount: number, count: number): void {
  shiftFaith(c, (amount * (1 - c.faith)) / (1 + 0.5 * count));
}

/** Faith in words, as a life story tells it; null for those who have none. */
export type FaithWord = 'devout' | 'believer' | 'doubter' | 'skeptic' | 'faithless' | 'corrupted';

export function faithWord(c: Character): FaithWord | null {
  if (!hasFaith(c)) return null;
  if (c.faith >= 0.8) return 'devout';
  if (c.faith >= 0.55) return 'believer';
  if (c.faith >= 0.3) return 'doubter';
  // Lost, rather than never had: to grave crimes, or to despair.
  if (c.faithPeak >= 0.5) {
    return c.crimes.some((crime) => crime.kind === 'murder') ? 'corrupted' : 'faithless';
  }
  return 'skeptic';
}
