import type { CultureId } from './cultures';
import type { SkillId, WeaponSkill } from './skills';
import type { StatId } from './stats';

/**
 * Equipment (ROADMAP.md Phase 3). An item is a base (longsword, chain shirt,
 * ring) made of a material, of some rarity, with up to two affixes. Rare
 * legendary items get a unique name and are remembered by the world.
 */

export type Slot = 'weapon' | 'armor' | 'trinket';

export interface WeaponBase {
  readonly id: string;
  readonly slot: 'weapon';
  readonly culture: CultureId;
  readonly name: string;
  readonly skill: WeaponSkill;
  /** Damage dice, e.g. "1d8". */
  readonly damage: string;
  /** Bonus (or penalty) to hit. */
  readonly accuracy: number;
  readonly value: number;
  readonly weight: number;
}

export interface ArmorBase {
  readonly id: string;
  readonly slot: 'armor';
  readonly culture: CultureId;
  readonly name: string;
  readonly defense: number;
  /** Only metal armor takes a material (steel, dwarven-steel…). */
  readonly metal: boolean;
  readonly value: number;
  readonly weight: number;
}

export interface TrinketBase {
  readonly id: string;
  readonly slot: 'trinket';
  readonly culture: CultureId;
  readonly name: string;
  readonly value: number;
  readonly weight: number;
}

// prettier-ignore
export const WEAPONS = [
  { id: 'longsword', slot: 'weapon', culture: 'generic', name: 'longsword', skill: 'blades', damage: '1d8', accuracy: 0, value: 30, weight: 3 },
  { id: 'shortsword', slot: 'weapon', culture: 'generic', name: 'shortsword', skill: 'blades', damage: '1d6', accuracy: 1, value: 20, weight: 2 },
  { id: 'spear', slot: 'weapon', culture: 'generic', name: 'spear', skill: 'polearms', damage: '1d8', accuracy: 0, value: 15, weight: 2 },
  { id: 'mace', slot: 'weapon', culture: 'generic', name: 'mace', skill: 'blunt', damage: '1d6+1', accuracy: 0, value: 20, weight: 2 },
  { id: 'axe', slot: 'weapon', culture: 'deephold', name: 'axe', skill: 'axes', damage: '1d8', accuracy: 0, value: 25, weight: 2 },
  { id: 'warhammer', slot: 'weapon', culture: 'deephold', name: 'warhammer', skill: 'blunt', damage: '1d10', accuracy: -1, value: 35, weight: 1 },
  { id: 'leafblade', slot: 'weapon', culture: 'sylvan', name: 'leaf-bladed sword', skill: 'blades', damage: '1d6', accuracy: 2, value: 35, weight: 1 },
  { id: 'greatsword', slot: 'weapon', culture: 'generic', name: 'greatsword', skill: 'blades', damage: '2d6', accuracy: -1, value: 60, weight: 1 },
  { id: 'battleaxe', slot: 'weapon', culture: 'deephold', name: 'battleaxe', skill: 'axes', damage: '1d12', accuracy: -1, value: 50, weight: 1 },
] as const satisfies readonly WeaponBase[];

// prettier-ignore
export const ARMORS = [
  { id: 'padded', slot: 'armor', culture: 'generic', name: 'padded jack', defense: 2, metal: false, value: 10, weight: 3 },
  { id: 'leather', slot: 'armor', culture: 'generic', name: 'leather jerkin', defense: 3, metal: false, value: 20, weight: 4 },
  { id: 'scale', slot: 'armor', culture: 'generic', name: 'scale coat', defense: 4, metal: true, value: 45, weight: 2 },
  { id: 'chain', slot: 'armor', culture: 'generic', name: 'chain shirt', defense: 5, metal: true, value: 80, weight: 1 },
  { id: 'plate', slot: 'armor', culture: 'deephold', name: 'plate harness', defense: 6, metal: true, value: 150, weight: 0.3 },
] as const satisfies readonly ArmorBase[];

// prettier-ignore
export const TRINKETS = [
  { id: 'ring', slot: 'trinket', culture: 'generic', name: 'ring', value: 25, weight: 2 },
  { id: 'amulet', slot: 'trinket', culture: 'generic', name: 'amulet', value: 30, weight: 2 },
  { id: 'charm', slot: 'trinket', culture: 'generic', name: 'charm', value: 15, weight: 1 },
] as const satisfies readonly TrinketBase[];

export type WeaponId = (typeof WEAPONS)[number]['id'];
export type ArmorId = (typeof ARMORS)[number]['id'];
export type TrinketId = (typeof TRINKETS)[number]['id'];
export type ItemBaseId = WeaponId | ArmorId | TrinketId;
export type ItemBase = WeaponBase | ArmorBase | TrinketBase;

const BASES: readonly ItemBase[] = [...WEAPONS, ...ARMORS, ...TRINKETS];

export function itemBase(id: ItemBaseId): ItemBase {
  return BASES.find((b) => b.id === id)!;
}

export function weaponBase(id: WeaponId): WeaponBase {
  return WEAPONS.find((w) => w.id === id)!;
}

export interface MaterialDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  readonly slots: readonly Slot[];
  /** Weapons: to hit and damage. Armor: defense. */
  readonly attack: number;
  readonly damage: number;
  readonly defense: number;
  readonly valueMultiplier: number;
  /** Relative chance, and how much deeper chambers favor it. */
  readonly weight: number;
  readonly depthBias: number;
}

// prettier-ignore
export const MATERIALS = [
  { id: 'rusted', culture: 'generic', name: 'rusted iron', slots: ['weapon', 'armor'], attack: -1, damage: 0, defense: -1, valueMultiplier: 0.4, weight: 3, depthBias: -0.3 },
  { id: 'iron', culture: 'generic', name: 'iron', slots: ['weapon', 'armor'], attack: 0, damage: 0, defense: 0, valueMultiplier: 1, weight: 6, depthBias: 0 },
  { id: 'steel', culture: 'generic', name: 'steel', slots: ['weapon', 'armor'], attack: 1, damage: 0, defense: 1, valueMultiplier: 2, weight: 3, depthBias: 0.2 },
  { id: 'dwarven-steel', culture: 'deephold', name: 'dwarven-steel', slots: ['weapon', 'armor'], attack: 1, damage: 1, defense: 1, valueMultiplier: 4, weight: 1, depthBias: 0.4 },
  { id: 'elven-silver', culture: 'sylvan', name: 'elven-silver', slots: ['weapon', 'armor', 'trinket'], attack: 2, damage: 0, defense: 1, valueMultiplier: 5, weight: 0.6, depthBias: 0.5 },
  { id: 'brass', culture: 'generic', name: 'brass', slots: ['trinket'], attack: 0, damage: 0, defense: 0, valueMultiplier: 1, weight: 5, depthBias: 0 },
  { id: 'silver', culture: 'generic', name: 'silver', slots: ['trinket'], attack: 0, damage: 0, defense: 0, valueMultiplier: 2.5, weight: 3, depthBias: 0.2 },
  { id: 'gold', culture: 'generic', name: 'gold', slots: ['trinket'], attack: 0, damage: 0, defense: 0, valueMultiplier: 5, weight: 1, depthBias: 0.4 },
] as const satisfies readonly MaterialDef[];

export type MaterialId = (typeof MATERIALS)[number]['id'];

export function materialDef(id: MaterialId): MaterialDef {
  return MATERIALS.find((m) => m.id === id)!;
}

/** What an affix adds. Skills add proficiency points while the item is worn. */
export interface ItemEffects {
  readonly attack?: number;
  readonly damage?: number;
  readonly defense?: number;
  readonly maxHp?: number;
  readonly maxStamina?: number;
  readonly skills?: Partial<Record<SkillId, number>>;
  readonly stats?: Partial<Record<StatId, number>>;
}

export interface ItemAffixDef {
  readonly id: string;
  readonly culture: CultureId;
  /** Shown before the base ("Keen") or after it ("of the Ember"). */
  readonly position: 'prefix' | 'suffix';
  readonly name: string;
  readonly slots: readonly Slot[];
  readonly effects: ItemEffects;
  readonly weight: number;
}

// prettier-ignore
export const ITEM_AFFIXES = [
  { id: 'keen', culture: 'generic', position: 'prefix', name: 'keen', slots: ['weapon'], effects: { attack: 1 }, weight: 3 },
  { id: 'vicious', culture: 'generic', position: 'prefix', name: 'vicious', slots: ['weapon'], effects: { damage: 2 }, weight: 2 },
  { id: 'balanced', culture: 'generic', position: 'prefix', name: 'balanced', slots: ['weapon'], effects: { attack: 1, defense: 1 }, weight: 2 },
  { id: 'sturdy', culture: 'generic', position: 'prefix', name: 'sturdy', slots: ['armor'], effects: { defense: 1 }, weight: 3 },
  { id: 'silent', culture: 'generic', position: 'prefix', name: 'silent', slots: ['armor', 'trinket'], effects: { skills: { stealth: 10 } }, weight: 2 },
  { id: 'ember', culture: 'generic', position: 'suffix', name: 'of the Ember', slots: ['weapon'], effects: { attack: 1, damage: 1 }, weight: 2 },
  { id: 'warding', culture: 'generic', position: 'suffix', name: 'of Warding', slots: ['armor', 'trinket'], effects: { defense: 1 }, weight: 3 },
  { id: 'vigor', culture: 'generic', position: 'suffix', name: 'of Vigor', slots: ['armor', 'trinket'], effects: { maxHp: 4 }, weight: 3 },
  { id: 'endurance', culture: 'generic', position: 'suffix', name: 'of Endurance', slots: ['armor', 'trinket'], effects: { maxStamina: 3 }, weight: 2 },
  { id: 'magi', culture: 'generic', position: 'suffix', name: 'of the Magi', slots: ['trinket'], effects: { skills: { arcana: 10 } }, weight: 1 },
  { id: 'shadows', culture: 'generic', position: 'suffix', name: 'of Shadows', slots: ['weapon', 'trinket'], effects: { skills: { stealth: 8, awareness: 4 } }, weight: 1 },
  { id: 'might', culture: 'generic', position: 'suffix', name: 'of Might', slots: ['weapon', 'trinket'], effects: { stats: { might: 2 } }, weight: 1 },
] as const satisfies readonly ItemAffixDef[];

export type ItemAffixId = (typeof ITEM_AFFIXES)[number]['id'];

export function itemAffixDef(id: ItemAffixId): ItemAffixDef {
  return ITEM_AFFIXES.find((a) => a.id === id)!;
}

export type Rarity = 'common' | 'fine' | 'rare' | 'legendary';

export const RARITIES: readonly {
  readonly id: Rarity;
  readonly affixes: number;
  readonly weight: number;
  readonly valueMultiplier: number;
}[] = [
  { id: 'common', affixes: 0, weight: 70, valueMultiplier: 1 },
  { id: 'fine', affixes: 1, weight: 22, valueMultiplier: 2 },
  { id: 'rare', affixes: 2, weight: 7, valueMultiplier: 4 },
  { id: 'legendary', affixes: 2, weight: 0.4, valueMultiplier: 10 },
];

/** Legendary items get names like "Duskblade": a first part and an ending that suits the slot. */
export const UNIQUE_NAME_STARTS = [
  'Dusk',
  'Dawn',
  'Grim',
  'Storm',
  'Ash',
  'Frost',
  'Ember',
  'Night',
  'Oath',
  'Wraith',
  'Thorn',
  'Gloom',
  'Star',
  'Iron',
  'Raven',
  'Ruin',
  'Sorrow',
  'Wyrm',
] as const;

export const UNIQUE_NAME_ENDINGS: Record<WeaponSkill | 'armor' | 'trinket', readonly string[]> = {
  blades: ['blade', 'fang', 'edge', 'brand', 'bane'],
  axes: ['cleaver', 'bite', 'splitter', 'reaver'],
  blunt: ['maul', 'breaker', 'fall', 'crusher'],
  polearms: ['spire', 'thorn', 'reach', 'lance'],
  armor: ['ward', 'mantle', 'aegis', 'shroud', 'hide'],
  trinket: ['eye', 'heart', 'star', 'tear', 'whisper'],
};
