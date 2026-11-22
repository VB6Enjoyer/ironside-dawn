import type { Aspect } from './effects';

/**
 * Sicknesses (0.4.0, ROADMAP.md "Body and Soul", steps 5–7). Each is a
 * condition with a course: it weakens while it lasts, then passes, or
 * kills. `deadliness` is the chance it kills a healthy grown person over its
 * whole course; the old, children and the frail die of it far more often.
 */
export interface SicknessDef {
  readonly name: string;
  /** "falls ill with a fever". */
  readonly caught: string;
  /** What it does while it lasts. */
  readonly mods: Partial<Record<Aspect, number>>;
  /** Days it runs, at least and at most. */
  readonly days: readonly [number, number];
  readonly deadliness: number;
  /** Whether it passes from person to person. */
  readonly contagious: boolean;
}

// prettier-ignore
export const SICKNESSES = {
  fever: { name: 'fever', caught: 'a fever', mods: { might: -2, agility: -1, recovery: -0.3 }, days: [4, 10], deadliness: 0.003, contagious: true },
  cough: { name: 'winter cough', caught: 'a winter cough', mods: { stamina: -0.2, recovery: -0.2 }, days: [6, 16], deadliness: 0.0015, contagious: true },
  rot: { name: 'infected wound', caught: 'an infected wound', mods: { health: -0.1, toughness: -2, recovery: -0.5 }, days: [6, 14], deadliness: 0.02, contagious: false },
  plague: { name: 'plague', caught: 'the plague', mods: { might: -3, toughness: -3, health: -0.2, recovery: -0.6 }, days: [7, 14], deadliness: 0.25, contagious: true },
} as const satisfies Record<string, SicknessDef>;

export type SicknessId = keyof typeof SICKNESSES;
