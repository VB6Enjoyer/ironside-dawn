import { lootDef, type LootId } from '../../content';
import type { Rng } from '../core/rng';
import type { LootItem } from '../model';

/** A found item, its value varying a little around the typical one. */
export function rollLootItem(rng: Rng, loot: LootId): LootItem {
  const typical = lootDef(loot).value;
  const value = Math.max(
    1,
    Math.round(typical * Math.min(1.5, Math.max(0.6, rng.gaussian(1, 0.15)))),
  );
  return { loot, value };
}
