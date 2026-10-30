import type { ItemAffixId, ItemBaseId, MaterialId, Rarity } from '../../content';
import type { CharacterId, ItemId, LocationId } from './ids';

/** A piece of equipment (ROADMAP.md Phase 3). Plain data; effects come from content. */
export interface Item {
  readonly id: ItemId;
  readonly base: ItemBaseId;
  readonly material: MaterialId | null;
  readonly rarity: Rarity;
  readonly affixes: readonly ItemAffixId[];
  /** Legendary items only: "Duskblade". */
  readonly uniqueName: string | null;
  /** What a merchant pays for it. */
  readonly value: number;
}

export interface Equipment {
  weapon: Item;
  armor: Item | null;
  trinket: Item | null;
}

/** The world remembers its legendary items: who found them, who holds them, where they were lost. */
export interface Legend {
  readonly item: Item;
  holder: CharacterId | null;
  /** Where it lies while nobody holds it. */
  lostAt: LocationId | null;
  readonly owners: { readonly characterId: CharacterId; readonly at: number }[];
}
