import { EFFECTS, type Aspect, type EffectDef } from '../../content';
import type { Character, Effect } from '../model';

/**
 * Reading lasting effects (0.4.0): how strong one is at a moment, and what
 * all of a character's together do to an aspect. Pure: nothing here changes a
 * character (see `effects.ts` for that).
 */

/**
 * An effect's strength at `now`, 0 to 1: full until it starts to fade, then
 * falling off evenly to nothing at its end. With no `now`, as long as it is
 * carried it counts in full (what callers without the time see).
 */
export function strengthAt(effect: Effect, now?: number): number {
  if (now === undefined) return 1;
  if (now >= effect.until) return 0;
  if (now < effect.fadeFrom) return 1;
  return (effect.until - now) / (effect.until - effect.fadeFrom);
}

/**
 * What a character's effects together do to one aspect at `now`. Costs of a
 * kind add up to their cap; of anything else only one of a kind is carried.
 */
export function aspectOf(character: Character, aspect: Aspect, now?: number): number {
  if (character.effects.length === 0) return 0;
  let total = 0;
  const costs = new Map<string, number>();
  for (const effect of character.effects) {
    const mod = effect.mods[aspect];
    if (!mod) continue;
    const value = mod * strengthAt(effect, now);
    const def: EffectDef = EFFECTS[effect.kind];
    if (def.cost) costs.set(effect.kind, (costs.get(effect.kind) ?? 0) + value);
    else total += value;
  }
  for (const [kind, sum] of costs) {
    const cap = (EFFECTS[kind as keyof typeof EFFECTS] as EffectDef).cap ?? Infinity;
    total += Math.max(-cap, Math.min(cap, sum));
  }
  return total;
}

/** Whether a character carries an effect of this kind at `now`. */
export function carries(character: Character, kind: Effect['kind'], now: number): boolean {
  return character.effects.some((e) => e.kind === kind && e.until > now);
}

/** Bravery as it stands now: the trait, steadied or shaken by nerve, 0 to 1. */
export function courageOf(character: Character, now?: number): number {
  return Math.max(0, Math.min(1, character.traits.bravery + aspectOf(character, 'nerve', now)));
}
