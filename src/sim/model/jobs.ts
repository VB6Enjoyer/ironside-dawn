import type { CharacterId, EncounterId } from './ids';

/** Work the scheduler can run. */
export type Job =
  /** The character's current activity ends; it acts or decides next. */
  | {
      readonly kind: 'character.wake';
      readonly characterId: CharacterId;
      /** Matches the character's `wakeToken` unless a later wake-up replaced it. */
      readonly token: number;
    }
  /** The next exchange of blows in a fight. */
  | { readonly kind: 'combat.round'; readonly encounterId: EncounterId }
  /** Once a day at midnight: creature populations regrow, newcomers arrive. */
  | { readonly kind: 'world.daily' }
  /** A new season begins. */
  | { readonly kind: 'calendar.season' };
