import type { CultureId } from './cultures';
import type { StatId } from './stats';

/**
 * Spells (WORLD.md §4). Magic is a gamble: every spell has a cost profile,
 * and the casting roll can succeed, half-work, fail, or backlash.
 */
export interface SpellCosts {
  readonly stamina?: number;
  readonly health?: number;
  /** A temporary loss to an attribute, for some hours. */
  readonly drain?: { readonly stat: StatId; readonly amount: number; readonly hours: number };
  /** Minutes of dizziness. */
  readonly dizzy?: number;
}

export type SpellEffect =
  /** Damage to one foe. */
  | { readonly kind: 'damage'; readonly dice: string }
  /** Heals the caster. */
  | { readonly kind: 'heal'; readonly dice: string }
  /** Bonus to hit and defense for the rest of the fight. */
  | { readonly kind: 'quicken'; readonly attack: number; readonly defense: number }
  /** Absorbs incoming damage until spent. */
  | { readonly kind: 'ward'; readonly dice: string };

export interface SpellDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  readonly effect: SpellEffect;
  /** The casting roll must reach this. */
  readonly difficulty: number;
  readonly costs: SpellCosts;
  /** Arcana needed to learn it. */
  readonly arcana: number;
}

// prettier-ignore
export const SPELLS = [
  { id: 'ember-bolt', culture: 'generic', name: 'Ember Bolt', effect: { kind: 'damage', dice: '2d6' }, difficulty: 12, costs: { stamina: 3, dizzy: 15 }, arcana: 15 },
  { id: 'mend-flesh', culture: 'generic', name: 'Mend Flesh', effect: { kind: 'heal', dice: '2d6+3' }, difficulty: 11, costs: { health: 4 }, arcana: 25 },
  { id: 'quickening', culture: 'generic', name: 'Quickening', effect: { kind: 'quicken', attack: 2, defense: 2 }, difficulty: 13, costs: { stamina: 1, drain: { stat: 'agility', amount: 3, hours: 3 } }, arcana: 35 },
  { id: 'ward-of-ash', culture: 'generic', name: 'Ward of Ash', effect: { kind: 'ward', dice: '2d6+2' }, difficulty: 12, costs: { stamina: 6 }, arcana: 45 },
] as const satisfies readonly SpellDef[];

export type SpellId = (typeof SPELLS)[number]['id'];

export function spellDef(id: SpellId): SpellDef {
  return SPELLS.find((s) => s.id === id)!;
}
