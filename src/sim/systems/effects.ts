import { DIZZY_PENALTY, EFFECTS, type StatId } from '../../content';
import { HOUR, MINUTE } from '../core/time';
import type { Character, Effect } from '../model';
import { strengthAt } from './effects-core';
import { refreshMaxima } from './progress';

/**
 * Lasting effects (0.4.0, ROADMAP.md "Body and Soul", step 2): timed effects
 * any character can carry, good or bad, each with a strength, an end, and a
 * moment from which it fades. Benefits and ailments don't stack: of one kind
 * only one is carried, and the stronger wins. Costs (a spell's price) do, up
 * to a cap. Nothing is ticked: effects are read when they matter
 * (`effects-core.ts`) and dropped once over.
 */

/** How much an effect does now, all its aspects together, for comparing two of a kind. */
function weight(effect: Effect, now: number): number {
  let total = 0;
  for (const mod of Object.values(effect.mods)) total += Math.abs(mod ?? 0);
  return total * strengthAt(effect, now);
}

const touchesMaxima = (effect: Effect) =>
  effect.mods.health !== undefined || effect.mods.stamina !== undefined;

/**
 * Gives a character an effect. A cost is added to any others of its kind; any
 * other effect replaces one of its kind only if it is stronger now, and is
 * otherwise turned away. Says whether it was taken.
 */
export function addEffect(character: Character, effect: Effect, now: number): boolean {
  expireEffects(character, now);
  if (!EFFECTS[effect.kind].cost) {
    const i = character.effects.findIndex((e) => e.kind === effect.kind);
    if (i >= 0) {
      if (weight(character.effects[i]!, now) > weight(effect, now)) return false;
      character.effects.splice(i, 1);
    }
  }
  character.effects.push(effect);
  if (touchesMaxima(effect)) refreshMaxima(character, now);
  return true;
}

/** Drops effects that are over. */
export function expireEffects(character: Character, now: number): void {
  if (character.effects.length === 0) return;
  const kept = character.effects.filter((e) => e.until > now);
  if (kept.length === character.effects.length) return;
  const maxima = character.effects.some((e) => e.until <= now && touchesMaxima(e));
  character.effects = kept;
  if (maxima) refreshMaxima(character, now);
}

/** A dizzy spell, from a spell's cost, a backlash or a trap: full strength to its end. */
export function dizziness(now: number, minutes: number): Effect {
  const until = now + Math.round(minutes * MINUTE);
  return {
    kind: 'dizzy',
    mods: { attack: -DIZZY_PENALTY, defense: -DIZZY_PENALTY },
    since: now,
    fadeFrom: until,
    until,
  };
}

/** An attribute weakened for a while, a spell's cost: full strength to its end. */
export function drain(stat: StatId, amount: number, now: number, hours: number): Effect {
  const until = now + Math.round(hours * HOUR);
  return { kind: 'drained', mods: { [stat]: -amount }, since: now, fadeFrom: until, until };
}
