import {
  DIZZY_PENALTY,
  EFFECTS,
  type EffectDef,
  type EffectId,
  type EffectSource,
  type StatId,
} from '../../content';
import type { SimContext } from '../context';
import { HOUR, MINUTE } from '../core/time';
import type { Character, Effect, LocationId } from '../model';
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

/**
 * Gives a character one of the lasting effects that come from the world
 * (0.4.0): a good night, a feast, a tonic, a brush with death. Its strength
 * and length are the kind's own; telling of it is a trivial event. Says
 * whether it was taken (a stronger one of the kind may already be carried).
 */
export function grant(
  ctx: SimContext,
  character: Character,
  kind: EffectId,
  source: EffectSource,
  locationId: LocationId,
  /** Stronger or weaker than the kind's own: a blessing by faith. */
  scale = 1,
): boolean {
  const def: EffectDef = EFFECTS[kind];
  if (!def.mods || !def.hours) throw new Error(`${kind} is not an effect that can be granted`);
  const now = ctx.world.time;
  const [full, fade] = def.hours;
  const mods =
    scale === 1
      ? def.mods
      : Object.fromEntries(Object.entries(def.mods).map(([a, n]) => [a, (n ?? 0) * scale]));
  const effect: Effect = {
    kind,
    mods,
    since: now,
    fadeFrom: now + Math.round(full * HOUR),
    until: now + Math.round((full + fade) * HOUR),
  };
  if (!addEffect(character, effect, now)) return false;
  ctx.emit(
    {
      type: 'character.effect',
      data: {
        characterId: character.id,
        locationId,
        effect: kind,
        source,
        ...(scale === 1 ? {} : { scale }),
      },
    },
    [character.id],
    locationId,
  );
  return true;
}
