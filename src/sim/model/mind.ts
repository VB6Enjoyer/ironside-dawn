import type { SpellId } from '../../content';
import type { CreatureRef } from './encounter';
import type { LocationId } from './ids';

/**
 * A character's mind (ROADMAP.md Phase 4, ARCHITECTURE.md §4.5–4.6): the
 * drives that push them, what they remember, and what they have learned to
 * expect of places.
 */

/**
 * Drives that build up over time and are satisfied by doing things, from 0
 * (content) to 1 (pressing). Health and wealth are not stored: they are read
 * from hit points, stamina and gold when needed.
 */
export interface Drives {
  /** Wants deeds, kills and fame. Grows with bravery and curiosity. */
  glory: number;
  /** Wants company. Grows with sociability; eased at taverns. */
  companionship: number;
  /** Restlessness: wants to be out adventuring. Grows faster in the impatient. */
  purpose: number;
}

export type DriveId = keyof Drives | 'health' | 'wealth';

/** Something that happened, held as a fading memory (episodic memory, §4.6). */
export type MemoryEvent =
  | {
      readonly kind: 'near-death';
      readonly locationId: LocationId;
      readonly creature: CreatureRef | null;
    }
  | { readonly kind: 'triumph'; readonly locationId: LocationId; readonly creature: CreatureRef }
  | {
      readonly kind: 'fled';
      readonly locationId: LocationId;
      readonly creatures: readonly CreatureRef[];
    }
  | { readonly kind: 'treasure'; readonly locationId: LocationId; readonly itemName: string }
  | { readonly kind: 'backlash'; readonly locationId: LocationId; readonly spell: SpellId }
  | { readonly kind: 'level'; readonly level: number };

export type Memory = MemoryEvent & {
  readonly at: number;
  /** How vivid it was at the time, 0 to 1. Fades with age. */
  readonly salience: number;
};

/**
 * What a character has learned to expect of delving a place (learned
 * expectations, §4.6): averages over their own trips, weighting recent ones
 * more.
 */
export interface Expectation {
  trips: number;
  /** Gold and item value per trip. */
  reward: number;
  /** 0 (safe) to 1 (nearly died every time): how much of their health it cost. */
  danger: number;
  lastAt: number;
}

/** A reason behind a decision, shown in the log and on the character card. */
export type Motive =
  | { readonly kind: 'drive'; readonly drive: DriveId }
  | { readonly kind: 'fond'; readonly locationId: LocationId }
  | { readonly kind: 'novelty'; readonly locationId: LocationId }
  | { readonly kind: 'home' }
  | { readonly kind: 'loot' };

/** What a character is currently trying to do, and why. */
export interface Goal {
  readonly kind:
    | 'delve'
    | 'heal'
    | 'sell'
    | 'socialize'
    | 'train'
    | 'study'
    | 'pray'
    | 'browse'
    | 'forage'
    | 'travel'
    | 'home'
    | 'rest'
    | 'wait';
  readonly locationId: LocationId | null;
  readonly why: readonly Motive[];
}
