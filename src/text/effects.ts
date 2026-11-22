import { EFFECTS, STATS, type Aspect, type EffectDef, type EffectId } from '../content';
import type { Character } from '../sim';
import { describeDuration } from './calendar';

/** A lasting effect as the character card shows it (0.4.0). */
export interface EffectLine {
  readonly kind: EffectId;
  /** "well rested", "weakened". */
  readonly name: string;
  /** Good for them, or bad. */
  readonly good: boolean;
  /** "about 9 hours left". */
  readonly left: string;
  /** What it does, in numbers: "+40% recovery, +10% stamina". */
  readonly detail: string;
}

const ASPECT_NAMES: Record<Exclude<Aspect, (typeof STATS)[number]>, string> = {
  health: 'health',
  stamina: 'stamina',
  attack: 'attack',
  defense: 'defense',
  recovery: 'recovery',
  nerve: 'nerve',
};

/** Shares are shown as percentages, the rest as points. */
const SHARES: ReadonlySet<Aspect> = new Set(['health', 'stamina', 'recovery', 'nerve']);

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** What some aspects' mods add up to, in words with numbers. */
export function describeMods(mods: Partial<Record<Aspect, number>>): string {
  return (Object.entries(mods) as [Aspect, number][])
    .filter(([, n]) => n !== 0)
    .map(([aspect, n]) =>
      SHARES.has(aspect)
        ? `${signed(Math.round(n * 100))}% ${ASPECT_NAMES[aspect as keyof typeof ASPECT_NAMES]}`
        : `${signed(n)} ${ASPECT_NAMES[aspect as keyof typeof ASPECT_NAMES] ?? aspect}`,
    )
    .join(', ');
}

/**
 * The lasting effects someone carries now, one line for each kind (costs of a
 * kind together), longest-lasting first among equals.
 */
export function effectLines(character: Character, now: number): EffectLine[] {
  const byKind = new Map<EffectId, { until: number; mods: Partial<Record<Aspect, number>> }>();
  for (const effect of character.effects) {
    if (effect.until <= now) continue;
    const seen = byKind.get(effect.kind);
    const mods = { ...(seen?.mods ?? {}) };
    for (const [aspect, n] of Object.entries(effect.mods) as [Aspect, number][]) {
      mods[aspect] = (mods[aspect] ?? 0) + n;
    }
    const def: EffectDef = EFFECTS[effect.kind];
    // Costs of a kind add up to their cap.
    if (def.cost && def.cap !== undefined) {
      for (const aspect of Object.keys(mods) as Aspect[]) {
        mods[aspect] = Math.max(-def.cap, Math.min(def.cap, mods[aspect]!));
      }
    }
    byKind.set(effect.kind, { until: Math.max(seen?.until ?? 0, effect.until), mods });
  }
  return [...byKind].map(([kind, { until, mods }]) => {
    const total = Object.values(mods).reduce<number>((sum, n) => sum + (n ?? 0), 0);
    return {
      kind,
      name: EFFECTS[kind].name,
      good: total > 0,
      left: `${describeDuration(until - now)} left`,
      detail: describeMods(mods),
    };
  });
}
