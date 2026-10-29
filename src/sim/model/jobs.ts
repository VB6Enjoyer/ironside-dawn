import type { CharacterId } from './ids';

/** Work the scheduler can run. */
export type Job =
  /** The character's current activity ends; it acts or decides next. */
  | { readonly kind: 'character.wake'; readonly characterId: CharacterId }
  /** A new season begins. */
  | { readonly kind: 'calendar.season' };
