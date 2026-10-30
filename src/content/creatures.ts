import type { CultureId } from './cultures';
import type { LootId } from './loot';

/**
 * Creatures (WORLD.md §2): beasts and mindless things. Unlike characters they
 * have no mind or memory, just combat numbers and instincts.
 */
export type CreatureFamily = 'beast' | 'undead' | 'demon';

export interface CreatureDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly name: string;
  readonly plural: string;
  readonly family: CreatureFamily;
  /** Rough threat, 1 (a nuisance) to 5 (deadly). Deeper rooms favor higher levels. */
  readonly level: number;
  /** Hit point dice, e.g. "2d6+4". */
  readonly hp: string;
  readonly attack: number;
  readonly damage: string;
  readonly defense: number;
  /** Modifier for initiative and fleeing. */
  readonly agility: number;
  /** Tries to flee below this fraction of its hit points (0: never flees). */
  readonly fleeBelow: number;
  /** How many show up together. */
  readonly group: readonly [min: number, max: number];
  readonly gold: { readonly dice: string; readonly chance: number } | null;
  readonly drops: readonly { readonly loot: LootId; readonly chance: number }[];
}

// prettier-ignore
export const CREATURES = [
  {
    id: 'giant-rat', culture: 'generic', name: 'giant rat', plural: 'giant rats', family: 'beast',
    level: 1, hp: '1d6+1', attack: 1, damage: '1d3', defense: 11, agility: 2, fleeBelow: 0.4,
    group: [1, 3], gold: null, drops: [{ loot: 'rat-tail', chance: 0.3 }],
  },
  {
    id: 'wolf', culture: 'generic', name: 'wolf', plural: 'wolves', family: 'beast',
    level: 2, hp: '2d6+2', attack: 2, damage: '1d4+1', defense: 12, agility: 2, fleeBelow: 0.3,
    group: [1, 2], gold: null, drops: [{ loot: 'wolf-pelt', chance: 0.6 }],
  },
  {
    id: 'warg', culture: 'generic', name: 'warg', plural: 'wargs', family: 'beast',
    level: 3, hp: '3d6+3', attack: 3, damage: '1d6+1', defense: 12, agility: 1, fleeBelow: 0.25,
    group: [1, 2], gold: null, drops: [{ loot: 'warg-pelt', chance: 0.6 }],
  },
  {
    id: 'giant-spider', culture: 'generic', name: 'giant spider', plural: 'giant spiders', family: 'beast',
    level: 3, hp: '2d8+2', attack: 3, damage: '1d6', defense: 13, agility: 2, fleeBelow: 0.2,
    group: [1, 2], gold: null, drops: [{ loot: 'spider-silk', chance: 0.5 }],
  },
  {
    id: 'cave-bear', culture: 'generic', name: 'cave bear', plural: 'cave bears', family: 'beast',
    level: 5, hp: '4d8+8', attack: 4, damage: '2d6', defense: 12, agility: 0, fleeBelow: 0.15,
    group: [1, 1], gold: null, drops: [{ loot: 'bear-claw', chance: 0.8 }],
  },
  {
    id: 'skeleton', culture: 'generic', name: 'skeleton', plural: 'skeletons', family: 'undead',
    level: 2, hp: '2d6+3', attack: 2, damage: '1d6', defense: 12, agility: 0, fleeBelow: 0,
    group: [1, 2], gold: { dice: '1d4', chance: 0.4 },
    drops: [{ loot: 'bone-charm', chance: 0.3 }, { loot: 'rusted-blade', chance: 0.2 }],
  },
  {
    id: 'zombie', culture: 'generic', name: 'zombie', plural: 'zombies', family: 'undead',
    level: 2, hp: '3d6+4', attack: 1, damage: '1d6+1', defense: 10, agility: -2, fleeBelow: 0,
    group: [1, 2], gold: { dice: '1d6', chance: 0.3 }, drops: [{ loot: 'grave-ring', chance: 0.15 }],
  },
  {
    id: 'infernal-imp', culture: 'generic', name: 'infernal imp', plural: 'infernal imps', family: 'demon',
    level: 2, hp: '2d4+2', attack: 3, damage: '1d4+1', defense: 14, agility: 3, fleeBelow: 0.3,
    group: [1, 2], gold: { dice: '2d4', chance: 0.5 }, drops: [{ loot: 'imp-horn', chance: 0.5 }],
  },
  {
    id: 'hellhound', culture: 'generic', name: 'hellhound', plural: 'hellhounds', family: 'demon',
    level: 4, hp: '4d8+4', attack: 4, damage: '1d8+2', defense: 13, agility: 2, fleeBelow: 0.1,
    group: [1, 1], gold: null, drops: [{ loot: 'hellhound-fang', chance: 0.7 }],
  },
] as const satisfies readonly CreatureDef[];

export type CreatureId = (typeof CREATURES)[number]['id'];

export function creatureDef(id: CreatureId): CreatureDef {
  return CREATURES.find((c) => c.id === id)!;
}

/** Occasional variants that make a creature more dangerous ("an enraged warg"). */
export interface AffixDef {
  readonly id: string;
  readonly name: string;
  readonly attack: number;
  readonly damageBonus: number;
  readonly defense: number;
  readonly agility: number;
  readonly hpMultiplier: number;
  readonly weight: number;
}

// prettier-ignore
export const AFFIXES = [
  { id: 'enraged', name: 'enraged', attack: 2, damageBonus: 2, defense: -1, agility: 0, hpMultiplier: 1, weight: 3 },
  { id: 'ancient', name: 'ancient', attack: 1, damageBonus: 1, defense: 1, agility: 0, hpMultiplier: 1.5, weight: 2 },
  { id: 'swift', name: 'swift', attack: 1, damageBonus: 0, defense: 2, agility: 3, hpMultiplier: 1, weight: 2 },
] as const satisfies readonly AffixDef[];

export type AffixId = (typeof AFFIXES)[number]['id'];

/** Chance that a creature in an encounter has an affix. */
export const AFFIX_CHANCE = 0.08;

export function affixDef(id: AffixId): AffixDef {
  return AFFIXES.find((a) => a.id === id)!;
}
