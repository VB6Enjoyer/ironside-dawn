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
  /** Typical lifespan in years: past three-quarters of it, death from old age grows likely. */
  readonly lifespan: number;
  /** Age at which a child comes of age. */
  readonly adultAge: number;
  /** Ages (years) of those who take up adventuring when the world begins. */
  readonly startingAge: readonly [number, number];
  /** Yearly chance a couple in their fertile years has a child, before crowding. */
  readonly fertility: number;
  /** Undead and demons don't age. */
  readonly ageless?: boolean;
  /**
   * The dread peoples (liches, revenants, demon lords) have no commoners and
   * no families: each is a lone power in a lair, commanding creatures.
   */
  readonly dread?: boolean;
  /** Hit points are multiplied by this: the dread are hard to put down. */
  readonly vitality?: number;
  /** Travel speed against a human on foot (centaurs run). */
  readonly travelSpeed?: number;
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

/** Every people's feeling for the dread: loathing. */
const DREADED = { lich: -1, revenant: -1, demon: -1 } as const;
/** The dread's feeling for everyone, themselves included. */
const HATED = {
  human: -1,
  elf: -1,
  dwarf: -1,
  centaur: -1,
  lich: -0.5,
  revenant: -0.5,
  demon: -0.5,
} as const;

export const SPECIES = {
  human: {
    id: 'human',
    culture: 'generic',
    statModifiers: {},
    lifespan: 70,
    adultAge: 16,
    startingAge: [17, 34],
    fertility: 0.45,
    attitudes: { human: 0.3, elf: 0, dwarf: 0, centaur: 0, ...DREADED },
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
    adultAge: 50,
    startingAge: [55, 160],
    fertility: 0.05,
    attitudes: { elf: 0.5, human: -0.1, dwarf: -0.3, centaur: 0.1, ...DREADED },
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
    adultAge: 30,
    startingAge: [32, 80],
    fertility: 0.15,
    attitudes: { dwarf: 0.5, human: 0, elf: -0.3, centaur: -0.1, ...DREADED },
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
  centaur: {
    id: 'centaur',
    culture: 'steppe',
    statModifiers: { might: 1, toughness: 1, agility: 1, wits: -1 },
    lifespan: 90,
    adultAge: 14,
    startingAge: [16, 40],
    fertility: 0.3,
    attitudes: { centaur: 0.5, human: 0, elf: 0.1, dwarf: -0.1, ...DREADED },
    weapons: { spear: 4, longsword: 1, axe: 1 },
    armor: { padded: 2, leather: 2 },
    giftChance: 0.06,
    traits: {
      bravery: { mean: 0.6 },
      curiosity: { mean: 0.6 },
      sociability: { mean: 0.6 },
      patience: { mean: 0.4 },
    },
    language: 'windspeech',
    travelSpeed: 1.4,
  },
  // The dread: sapient undead and demons, each the master of a lair.
  lich: {
    id: 'lich',
    culture: 'grave',
    statModifiers: { wits: 6, spirit: 6, presence: 3, might: -1 },
    lifespan: 1000,
    adultAge: 0,
    startingAge: [150, 600],
    fertility: 0,
    ageless: true,
    dread: true,
    vitality: 3,
    attitudes: HATED,
    weapons: { mace: 1 },
    armor: { padded: 1 },
    giftChance: 1,
    traits: { patience: { mean: 0.85 }, compassion: { mean: 0.05 }, honor: { mean: 0.2 } },
    language: 'common',
  },
  revenant: {
    id: 'revenant',
    culture: 'grave',
    statModifiers: { might: 5, toughness: 5, agility: 1, presence: 2 },
    lifespan: 1000,
    adultAge: 0,
    startingAge: [80, 300],
    fertility: 0,
    ageless: true,
    dread: true,
    vitality: 3,
    attitudes: HATED,
    weapons: { greatsword: 3, battleaxe: 1 },
    armor: { chain: 1, plate: 1 },
    giftChance: 0,
    traits: { bravery: { mean: 0.9 }, compassion: { mean: 0.05 }, patience: { mean: 0.7 } },
    language: 'common',
  },
  demon: {
    id: 'demon',
    culture: 'infernal',
    statModifiers: { might: 6, toughness: 5, agility: 2, presence: 4, spirit: 2 },
    lifespan: 1000,
    adultAge: 0,
    startingAge: [300, 900],
    fertility: 0,
    ageless: true,
    dread: true,
    vitality: 3.5,
    attitudes: HATED,
    weapons: { battleaxe: 2, greatsword: 1 },
    armor: { scale: 1, plate: 1 },
    giftChance: 0.5,
    traits: { bravery: { mean: 0.85 }, compassion: { mean: 0.02 }, greed: { mean: 0.8 } },
    language: 'infernal',
  },
} as const satisfies Record<string, SpeciesDef>;

/** The peoples who live in towns and raise families, as opposed to the dread. */
export const PEOPLES = ['human', 'elf', 'dwarf', 'centaur'] as const;

export type SpeciesId = keyof typeof SPECIES;

export type PeopleId = (typeof PEOPLES)[number];

export function isDread(species: SpeciesId): boolean {
  return (SPECIES[species] as SpeciesDef).dread === true;
}
