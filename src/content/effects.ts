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
  /** For anything else: what it does at full strength. */
  readonly mods?: Partial<Record<Aspect, number>>;
  /** Hours at full strength, then hours fading to nothing. */
  readonly hours?: readonly [full: number, fade: number];
}

// prettier-ignore
export const EFFECTS = {
  /** Reeling: worse in a fight, and readier to botch a spell. */
  dizzy: { name: 'dizzy', cost: true, cap: 2 },
  /** An attribute weakened, usually by a spell's cost. */
  drained: { name: 'drained', cost: true, cap: 9 },
  /** A night in the best room of a good inn: quicker to mend, more in reserve. */
  rested: { name: 'well rested', cost: false, mods: { recovery: 0.4, stamina: 0.1 }, hours: [10, 14] },
  /** A night at home with their family: at ease, and steadier for it. */
  home: { name: 'at ease', cost: false, mods: { recovery: 0.3, nerve: 0.1 }, hours: [12, 12] },
  /** A feast stood at the tavern: bold with good company and better wine. */
  spirits: { name: 'in good spirits', cost: false, mods: { nerve: 0.15 }, hours: [12, 12] },
  /** A particularly good meal: more in reserve, and mending well. */
  fed: { name: 'well fed', cost: false, mods: { stamina: 0.1, recovery: 0.2 }, hours: [8, 8] },
  /** A stroke of luck, a great find: sure that fortune is with them. */
  lucky: { name: 'lucky', cost: false, mods: { nerve: 0.2 }, hours: [24, 48] },
  /** An alchemist's tonic of vigor: more breath, and quicker to get it back. */
  vigor: { name: 'full of vigor', cost: false, mods: { stamina: 0.2, recovery: 0.25 }, hours: [4, 2] },
  /** An alchemist's calming draught: steady hands in the dark. */
  calm: { name: 'calm', cost: false, mods: { nerve: 0.2 }, hours: [4, 2] },
  /** A shrine's blessing, stronger for the faithful (`grant` scales it). */
  blessed: { name: 'blessed', cost: false, mods: { nerve: 0.1, recovery: 0.15 }, hours: [8, 8] },
  /** Sick (0.4.0): what each sickness does is in `illness.ts`; its course is the sickness's. */
  sick: { name: 'sick', cost: false },
  /** Curses (0.4.0, step 8): their lengths are set by `curses.ts`, and some last until lifted. */
  'ill-luck': { name: 'ill-starred', cost: false, mods: { attack: -2, defense: -2 } },
  wasting: { name: 'wasting', cost: false, mods: { health: -0.2, recovery: -0.4 } },
  weakness: { name: 'cursed with weakness', cost: false, mods: { might: -3 } },
  /** The mark: people are wary of them, and it shows a little in their nerve. */
  marked: { name: 'marked', cost: false, mods: { nerve: -0.05 } },
  /** Slow to mend after a brush with death: less health, and slower to heal, for days. */
  weakened: { name: 'weakened', cost: false, mods: { health: -0.15, recovery: -0.25 }, hours: [72, 48] },
  /** Worn out by a long march: slower in a fight, and slow to recover. */
  worn: { name: 'worn out', cost: false, mods: { attack: -1, defense: -1, recovery: -0.2 }, hours: [8, 8] },
} as const satisfies Record<string, EffectDef>;

export type EffectId = keyof typeof EFFECTS;

/** How strong a dizzy spell is: so much worse to hit, and to dodge. */
export const DIZZY_PENALTY = 2;

/** Where a lasting effect came from (0.4.0), as the log tells it. */
export type EffectSource =
  'inn' | 'home' | 'feast' | 'meal' | 'luck' | 'shrine' | 'tonic' | 'near-death' | 'march';

/** The curses (0.4.0): lasting effects laid on someone, lifted by time, priests or wise folk. */
export const CURSES = ['ill-luck', 'wasting', 'weakness', 'marked'] as const;
export type CurseId = (typeof CURSES)[number];

/** Where a curse came from. */
export type CurseSource = 'item' | 'haunt' | 'undead' | 'dread' | 'dying';
