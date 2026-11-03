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
  { id: 'boar-tusk', culture: 'generic', name: 'boar tusk', plural: 'boar tusks', value: 18, good: 'hides', units: 2 },
  { id: 'troll-hide', culture: 'generic', name: 'troll hide', plural: 'troll hides', value: 55, good: 'hides', units: 6 },
  { id: 'ghoul-claw', culture: 'generic', name: 'ghoul claw', plural: 'ghoul claws', value: 14, good: 'reagents', units: 1 },
  { id: 'wraith-essence', culture: 'generic', name: 'phial of wraith essence', plural: 'phials of wraith essence', value: 50, good: 'reagents', units: 4 },
  { id: 'kappa-shell', culture: 'japonic', name: 'kappa shell', plural: 'kappa shells', value: 15, good: 'hides', units: 2 },
  { id: 'fox-tail', culture: 'japonic', name: 'fox tail', plural: 'fox tails', value: 20, good: 'reagents', units: 1.5 },
  { id: 'tengu-feather', culture: 'japonic', name: 'tengu feather', plural: 'tengu feathers', value: 30, good: 'reagents', units: 2.5 },
  { id: 'oni-horn', culture: 'japonic', name: 'oni horn', plural: 'oni horns', value: 60, good: 'reagents', units: 5 },
  { id: 'jotunn-tooth', culture: 'norse', name: 'jötunn tooth', plural: 'jötunn teeth', value: 70, good: 'reagents', units: 6 },
  // Treasure
  { id: 'mourning-comb', culture: 'japonic', name: 'lacquered mourning comb', plural: 'lacquered mourning combs', value: 25 },
  { id: 'barrow-silver', culture: 'norse', name: 'piece of barrow silver', plural: 'pieces of barrow silver', value: 35 },
  { id: 'silver-ring', culture: 'generic', name: 'silver ring', plural: 'silver rings', value: 15 },
  { id: 'gilded-goblet', culture: 'generic', name: 'gilded goblet', plural: 'gilded goblets', value: 30 },
  { id: 'jeweled-dagger', culture: 'generic', name: 'jeweled dagger', plural: 'jeweled daggers', value: 45 },
  { id: 'ancient-amulet', culture: 'generic', name: 'ancient amulet', plural: 'ancient amulets', value: 90 },
] as const satisfies readonly LootDef[];

export type LootId = (typeof LOOT)[number]['id'];

export function lootDef(id: LootId): LootDef {
  return LOOT.find((l) => l.id === id)!;
}
