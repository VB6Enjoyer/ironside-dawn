import type { CultureId } from './cultures';

/** Phase 2 weapons: every adventurer carries one. Equipment slots arrive in Phase 3. */
export interface WeaponDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  /** Damage dice, e.g. "1d8". */
  readonly damage: string;
  /** Bonus (or penalty) to hit. */
  readonly accuracy: number;
}

export const WEAPONS = [
  { id: 'longsword', culture: 'generic', name: 'longsword', damage: '1d8', accuracy: 0 },
  { id: 'shortsword', culture: 'generic', name: 'shortsword', damage: '1d6', accuracy: 1 },
  { id: 'spear', culture: 'generic', name: 'spear', damage: '1d8', accuracy: 0 },
  { id: 'mace', culture: 'generic', name: 'mace', damage: '1d6+1', accuracy: 0 },
  { id: 'axe', culture: 'deephold', name: 'axe', damage: '1d8', accuracy: 0 },
  { id: 'warhammer', culture: 'deephold', name: 'warhammer', damage: '1d10', accuracy: -1 },
  { id: 'leafblade', culture: 'sylvan', name: 'leaf-bladed sword', damage: '1d6', accuracy: 2 },
] as const satisfies readonly WeaponDef[];

export type WeaponId = (typeof WEAPONS)[number]['id'];

export function weaponDef(id: WeaponId): WeaponDef {
  return WEAPONS.find((w) => w.id === id)!;
}
