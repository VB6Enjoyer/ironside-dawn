import type { CultureId } from './cultures';
import type { StatId } from './stats';
import type { LanguageId } from './languages';
import type { TraitTendencies } from './traits';
import type { ArmorId, WeaponId } from './items';

/** Peoples (WORLD.md §2): everything species-specific is data. */
export interface SpeciesDef {
  readonly id: string;
  /** The culture its people are usually raised in. */
  readonly culture: CultureId;
  readonly statModifiers: Partial<Record<StatId, number>>;
  /** Typical lifespan in years. Aging arrives in Phase 8. */
  readonly lifespan: number;
  /** Baseline feelings toward other peoples, -1 (hostile) to 1 (friendly). Used from Phase 5. */
  readonly attitudes: Readonly<Record<string, number>>;
  /** Relative preference among starting weapons and armor. */
  readonly weapons: Partial<Record<WeaponId, number>>;
  readonly armor: Partial<Record<ArmorId, number>>;
  /** Chance of being born with the gift for magic (WORLD.md §4). */
  readonly giftChance: number;
  /** How the people's personalities lean (WORLD.md §3). */
  readonly traits: TraitTendencies;
  readonly language: LanguageId;
}

export const SPECIES = {
  human: {
    id: 'human',
    culture: 'generic',
    statModifiers: {},
    lifespan: 70,
    attitudes: { human: 0.3, elf: 0, dwarf: 0 },
    weapons: { longsword: 3, shortsword: 2, spear: 2, mace: 2, axe: 1 },
    armor: { padded: 1, leather: 2, scale: 1 },
    giftChance: 0.05,
    traits: { sociability: { mean: 0.55 } },
    language: 'common',
  },
  elf: {
    id: 'elf',
    culture: 'sylvan',
    statModifiers: { agility: 2, wits: 1, spirit: 1, toughness: -1, might: -1 },
    lifespan: 600,
    attitudes: { elf: 0.5, human: -0.1, dwarf: -0.3 },
    weapons: { leafblade: 4, longsword: 2, spear: 1 },
    armor: { padded: 1, leather: 3 },
    giftChance: 0.18,
    traits: { patience: { mean: 0.65 }, curiosity: { mean: 0.6 }, sociability: { mean: 0.42 } },
    language: 'sylvan',
  },
  dwarf: {
    id: 'dwarf',
    culture: 'deephold',
    statModifiers: { toughness: 2, might: 1, agility: -1, presence: -1 },
    lifespan: 250,
    attitudes: { dwarf: 0.5, human: 0, elf: -0.3 },
    weapons: { axe: 4, warhammer: 3, mace: 1 },
    armor: { leather: 1, scale: 2 },
    giftChance: 0.03,
    traits: {
      honor: { mean: 0.62 },
      greed: { mean: 0.58 },
      bravery: { mean: 0.6 },
      sociability: { mean: 0.45 },
    },
    language: 'deeptongue',
  },
} as const satisfies Record<string, SpeciesDef>;

export type SpeciesId = keyof typeof SPECIES;
