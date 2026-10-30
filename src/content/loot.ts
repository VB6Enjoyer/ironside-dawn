import type { CultureId } from './cultures';

/** Things worth carrying home. Sold at a fixed price for now; markets arrive in Phase 7. */
export interface LootDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  readonly plural: string;
  /** Typical value in gold. Each find varies around it. */
  readonly value: number;
}

// prettier-ignore
export const LOOT = [
  // Creature parts and belongings
  { id: 'rat-tail', culture: 'generic', name: 'rat tail', plural: 'rat tails', value: 1 },
  { id: 'wolf-pelt', culture: 'generic', name: 'wolf pelt', plural: 'wolf pelts', value: 10 },
  { id: 'warg-pelt', culture: 'generic', name: 'warg pelt', plural: 'warg pelts', value: 22 },
  { id: 'spider-silk', culture: 'generic', name: 'bundle of spider silk', plural: 'bundles of spider silk', value: 16 },
  { id: 'bear-claw', culture: 'generic', name: 'cave bear claw', plural: 'cave bear claws', value: 45 },
  { id: 'bone-charm', culture: 'generic', name: 'bone charm', plural: 'bone charms', value: 6 },
  { id: 'rusted-blade', culture: 'generic', name: 'rusted blade', plural: 'rusted blades', value: 4 },
  { id: 'grave-ring', culture: 'generic', name: 'grave ring', plural: 'grave rings', value: 14 },
  { id: 'imp-horn', culture: 'generic', name: 'imp horn', plural: 'imp horns', value: 20 },
  { id: 'hellhound-fang', culture: 'generic', name: 'hellhound fang', plural: 'hellhound fangs', value: 60 },
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
