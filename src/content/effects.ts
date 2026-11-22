import type { StatId } from './stats';

/**
 * Lasting effects (0.4.0, ROADMAP.md "Body and Soul"): what a character can
 * carry for a while, good or bad. Each acts on one or more aspects of them:
 *
 * - `health`, `stamina`: their maximum, as a share (−0.15 is 15% less);
 * - `attack`, `defense`: points in a fight;
 * - an attribute (`might`, `agility`, ...): points;
 * - `recovery`: how fast they heal and get their breath back, as a share;
 * - `nerve`: added to their bravery (0 to 1) when they choose to flee, press
 *   on, delve, fight or cast.
 */
export type Aspect = 'health' | 'stamina' | 'attack' | 'defense' | 'recovery' | 'nerve' | StatId;

export interface EffectDef {
  readonly name: string;
  /**
   * A price paid for something (a spell's cost, a trap's blow). Costs of one
   * kind stack, up to `cap` on each aspect; any other effect is a benefit or
   * an ailment of which only one of a kind is carried, the stronger winning.
   */
  readonly cost: boolean;
  /** For a cost: the most all those of this kind together can do to an aspect. */
  readonly cap?: number;
}

export const EFFECTS = {
  /** Reeling: worse in a fight, and readier to botch a spell. */
  dizzy: { name: 'dizzy', cost: true, cap: 2 },
  /** An attribute weakened, usually by a spell's cost. */
  drained: { name: 'drained', cost: true, cap: 9 },
  /** A good night's sleep in a good bed: quicker to recover, a little more in reserve. */
  rested: { name: 'well rested', cost: false },
  /** Slow to mend after a brush with death: less health for days. */
  weakened: { name: 'weakened', cost: false },
} as const satisfies Record<string, EffectDef>;

export type EffectId = keyof typeof EFFECTS;

/** How strong a dizzy spell is: so much worse to hit, and to dodge. */
export const DIZZY_PENALTY = 2;
