import type { CultureId } from './cultures';
import type { GoodId } from './economy';

/**
 * Things worth carrying home. Creature parts are sold to the trading house as
 * goods (a pelt is hides) at market prices; treasure is assayed for its
 * metal and stones at its value.
 */
export interface LootDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  readonly plural: string;
  /** Typical value in gold. Each find varies around it. */
  readonly value: number;
  /** What it counts as on the market, and how much of it, for a typical find. Treasure has none. */
  readonly good?: GoodId;
  readonly units?: number;
}

// prettier-ignore
export const LOOT = [
  // Creature parts and belongings
  { id: 'rat-tail', culture: 'generic', name: 'rat tail', plural: 'rat tails', value: 1, good: 'reagents', units: 0.25 },
  { id: 'wolf-pelt', culture: 'generic', name: 'wolf pelt', plural: 'wolf pelts', value: 10, good: 'hides', units: 1.5 },
  { id: 'warg-pelt', culture: 'generic', name: 'warg pelt', plural: 'warg pelts', value: 22, good: 'hides', units: 3 },
  { id: 'spider-silk', culture: 'generic', name: 'bundle of spider silk', plural: 'bundles of spider silk', value: 16, good: 'silk', units: 1.5 },
  { id: 'bear-claw', culture: 'generic', name: 'cave bear claw', plural: 'cave bear claws', value: 45, good: 'reagents', units: 4 },
  { id: 'bone-charm', culture: 'generic', name: 'bone charm', plural: 'bone charms', value: 6, good: 'reagents', units: 0.5 },
  { id: 'rusted-blade', culture: 'generic', name: 'rusted blade', plural: 'rusted blades', value: 4, good: 'ore', units: 1 },
  { id: 'grave-ring', culture: 'generic', name: 'grave ring', plural: 'grave rings', value: 14 },
  { id: 'imp-horn', culture: 'generic', name: 'imp horn', plural: 'imp horns', value: 20, good: 'reagents', units: 1.5 },
  { id: 'hellhound-fang', culture: 'generic', name: 'hellhound fang', plural: 'hellhound fangs', value: 60, good: 'reagents', units: 5 },
  // Treasure
  { id: 'silver-ring', culture: 'generic', name: 'silver ring', plural: 'silver rings', value: 15 },
  { id: 'gilded-goblet', culture: 'generic', name: 'gilded goblet', plural: 'gilded goblets', value: 30 },
  { id: 'jeweled-dagger', culture: 'generic', name: 'jeweled dagger', plural: 'jeweled daggers', value: 45 },
  { id: 'ancient-amulet', culture: 'generic', name: 'ancient amulet', plural: 'ancient amulets', value: 90 },
] as const satisfies readonly LootDef[];

export type LootId = (typeof LOOT)[number]['id'];

export function lootDef(id: LootId): LootDef {
  return LOOT.find((l) => l.id === id)!;
}
