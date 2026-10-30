import type { CultureId } from './cultures';
import type { StatId } from './stats';
import type { WeaponId } from './weapons';

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
  /** Relative preference among weapons. */
  readonly weapons: Partial<Record<WeaponId, number>>;
}

export const SPECIES = {
  human: {
    id: 'human',
    culture: 'generic',
    statModifiers: {},
    lifespan: 70,
    attitudes: { human: 0.3, elf: 0, dwarf: 0 },
    weapons: { longsword: 3, shortsword: 2, spear: 2, mace: 2, axe: 1 },
  },
  elf: {
    id: 'elf',
    culture: 'sylvan',
    statModifiers: { agility: 2, wits: 1, spirit: 1, toughness: -1, might: -1 },
    lifespan: 600,
    attitudes: { elf: 0.5, human: -0.1, dwarf: -0.3 },
    weapons: { leafblade: 4, longsword: 2, spear: 1 },
  },
  dwarf: {
    id: 'dwarf',
    culture: 'deephold',
    statModifiers: { toughness: 2, might: 1, agility: -1, presence: -1 },
    lifespan: 250,
    attitudes: { dwarf: 0.5, human: 0, elf: -0.3 },
    weapons: { axe: 4, warhammer: 3, mace: 1 },
  },
} as const satisfies Record<string, SpeciesDef>;

export type SpeciesId = keyof typeof SPECIES;
