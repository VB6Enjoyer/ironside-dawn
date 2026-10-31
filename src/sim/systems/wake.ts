import { schedule } from '../core/scheduler';
import type { SimContext } from '../context';
import type { Character } from '../model';

/**
 * Schedules a character's next wake-up. Only the most recently scheduled
 * wake-up counts: when an activity is cut short (joining a party, an ambush),
 * the old one is left in the queue but ignored when it comes due.
 */
export function wakeAt(ctx: SimContext, character: Character, at: number): void {
  character.wakeToken++;
  schedule(ctx.world.scheduler, at, {
    kind: 'character.wake',
    characterId: character.id,
    token: character.wakeToken,
  });
}

/** Leaves any scheduled wake-up stale, for characters whose time is now run by someone else. */
export function cancelWake(character: Character): void {
  character.wakeToken++;
}
