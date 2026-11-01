import type { DungeonTemplateId } from './dungeons';
import type { ProfessionId } from './economy';
import type { PeopleId } from './species';

/**
 * The lands a generated world is made of (ROADMAP.md Phase 9). Each region of
 * the map has one biome, which sets who makes their home there, what their
 * towns live on, what lurks in the dungeons, how hard the going is, and what
 * the weather does.
 */
export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  /** Road hours per league, against open plains at 1. */
  readonly travel: number;
  /** Who settles here, by weight: each town is of one people, drawn from these. */
  readonly peoples: Partial<Record<PeopleId, number>>;
  /** How many towns the biome holds, against plains at 1. Wastes hold none. */
  readonly settled: number;
  /** Commoners in a town here. */
  readonly townSize: readonly [number, number];
  /** Region names: "the " + a word from each list, joined by `join` ("the Silverwood"). */
  readonly regionNames: NameParts;
  /** Names of the wild places on the roads. */
  readonly wildNames: NameParts;
  /** How the townsfolk make a living; shares add up to 1. Miners only where there's a mine. */
  readonly workforce: Partial<Record<ProfessionId, number>>;
  /** Chance a town here has an iron mine. */
  readonly mine: number;
  /** Chance a town here has a library or mentors. */
  readonly academy: number;
  /** What kinds of dungeon lie here, by weight. */
  readonly dungeons: Partial<Record<DungeonTemplateId, number>>;
  /** How wet, cold and hot the land runs, 0 to 1: the weather follows. */
  readonly climate: { readonly wet: number; readonly cold: number; readonly hot: number };
}

export interface NameParts {
  readonly first: readonly string[];
  readonly second: readonly string[];
  readonly join: '' | ' ';
}

// prettier-ignore
export const BIOMES = {
  plains: {
    id: 'plains', name: 'plains', travel: 1, peoples: { human: 1 }, settled: 1.4,
    townSize: [500, 1400],
    regionNames: { first: ['Green', 'Fair', 'Low', 'Middle', 'Golden', 'Broad', 'Wide'], second: ['Vale', 'Shire', 'Lowlands', 'March', 'Fields'], join: ' ' },
    wildNames: { first: ['Hay', 'Gallows', 'Wind', 'Bramble', 'Crow', 'Long', 'Old'], second: ['heath', 'moor', 'down', 'common', 'cross'], join: '' },
    workforce: { farmers: 0.6, hunters: 0.06, herbalists: 0.06, smiths: 0.12, tailors: 0.1, alchemists: 0.06 },
    mine: 0.05, academy: 0.35,
    dungeons: { ruin: 2, crypt: 2, cave: 0.5 },
    climate: { wet: 0.5, cold: 0.3, hot: 0.3 },
  },
  forest: {
    id: 'forest', name: 'forest', travel: 1.4, peoples: { elf: 1, human: 0.2 }, settled: 0.9,
    townSize: [300, 900],
    regionNames: { first: ['Silver', 'Elder', 'Whisper', 'Green', 'Deep', 'Moon', 'Thorn'], second: ['wood', 'weald', 'holt', 'shaw'], join: '' },
    wildNames: { first: ['Wither', 'Dark', 'Gloom', 'Briar', 'Owl', 'Mossy', 'Fox'], second: ['wood', 'thicket', 'holt', 'glen'], join: '' },
    workforce: { farmers: 0.45, herbalists: 0.2, hunters: 0.15, alchemists: 0.1, tailors: 0.1 },
    mine: 0, academy: 0.6,
    dungeons: { den: 2, cave: 1, ruin: 1 },
    climate: { wet: 0.7, cold: 0.3, hot: 0.2 },
  },
  hills: {
    id: 'hills', name: 'hills', travel: 1.3, peoples: { human: 0.6, dwarf: 0.4 }, settled: 0.9,
    townSize: [300, 1000],
    regionNames: { first: ['Barrow', 'Rolling', 'Bracken', 'Chalk', 'Windy', 'Stony'], second: ['Downs', 'Hills', 'Tors', 'Wolds'], join: ' ' },
    wildNames: { first: ['Hag', 'Grey', 'Raven', 'Cold', 'Hollow', 'Giant'], second: ['tor', 'barrow', 'combe', 'ridge'], join: '' },
    workforce: { farmers: 0.45, miners: 0.15, hunters: 0.1, smiths: 0.12, tailors: 0.08, herbalists: 0.05, alchemists: 0.05 },
    mine: 0.4, academy: 0.25,
    dungeons: { crypt: 2, cave: 2, ruin: 1 },
    climate: { wet: 0.5, cold: 0.4, hot: 0.2 },
  },
  mountains: {
    id: 'mountains', name: 'mountains', travel: 2, peoples: { dwarf: 1 }, settled: 0.8,
    townSize: [300, 900],
    regionNames: { first: ['Grey', 'Iron', 'Frost', 'Storm', 'Dragon', 'Anvil', 'Cloud'], second: ['Peaks', 'Mountains', 'Spires', 'Crags'], join: ' ' },
    wildNames: { first: ['Iron', 'Frost', 'Eagle', 'Widow', 'Storm', 'High'], second: ['pass', 'gap', 'crag', 'scree'], join: '' },
    workforce: { miners: 0.35, farmers: 0.35, smiths: 0.15, hunters: 0.08, tailors: 0.04, alchemists: 0.03 },
    mine: 0.9, academy: 0.15,
    dungeons: { cave: 2, troll: 2, ruin: 0.5 },
    climate: { wet: 0.4, cold: 0.9, hot: 0 },
  },
  steppe: {
    id: 'steppe', name: 'steppe', travel: 0.8, peoples: { centaur: 1 }, settled: 0.8,
    townSize: [300, 800],
    regionNames: { first: ['Ashen', 'Golden', 'Endless', 'Wind', 'Thunder', 'Red'], second: ['Steppe', 'Plains', 'Sea of Grass', 'Grasslands'], join: ' ' },
    wildNames: { first: ['Dust', 'Bone', 'Dry', 'Lone', 'Kite', 'Salt'], second: ['flats', 'barrens', 'wash', 'stones'], join: '' },
    workforce: { farmers: 0.5, hunters: 0.25, tailors: 0.1, herbalists: 0.1, alchemists: 0.05 },
    mine: 0, academy: 0.15,
    dungeons: { den: 2, crypt: 1, ruin: 0.5 },
    climate: { wet: 0.2, cold: 0.4, hot: 0.6 },
  },
  marsh: {
    id: 'marsh', name: 'marshes', travel: 1.7, peoples: { human: 1 }, settled: 0.4,
    townSize: [200, 600],
    regionNames: { first: ['Grey', 'Black', 'Sallow', 'Drowned', 'Reed', 'Mist'], second: ['Fens', 'Marshes', 'Mire', 'Bogs'], join: ' ' },
    wildNames: { first: ['Grey', 'Black', 'Sedge', 'Sink', 'Eel', 'Murk'], second: ['fen', 'mire', 'bog', 'slough'], join: '' },
    workforce: { farmers: 0.45, herbalists: 0.25, hunters: 0.15, alchemists: 0.1, tailors: 0.05 },
    mine: 0, academy: 0.2,
    dungeons: { crypt: 2, ruin: 1 },
    climate: { wet: 0.9, cold: 0.3, hot: 0.3 },
  },
  wastes: {
    id: 'wastes', name: 'wastes', travel: 1.5, peoples: {}, settled: 0,
    townSize: [0, 0],
    regionNames: { first: ['Blighted', 'Burning', 'Sundered', 'Ashen', 'Weeping', 'Cursed'], second: ['Wastes', 'Barrens', 'Scar', 'Badlands'], join: ' ' },
    wildNames: { first: ['Ash', 'Cinder', 'Bone', 'Sorrow', 'Brimstone', 'Scorch'], second: ['scar', 'reach', 'waste', 'pits'], join: '' },
    workforce: {},
    mine: 0, academy: 0,
    dungeons: { rift: 3, ruin: 1, crypt: 1 },
    climate: { wet: 0.1, cold: 0.2, hot: 0.9 },
  },
} as const satisfies Record<string, BiomeDef>;

export type BiomeId = keyof typeof BIOMES;

export function biomeDef(id: BiomeId): BiomeDef {
  return BIOMES[id];
}

/** The land each people calls home, where its towns cluster. */
export const HOMELANDS = {
  human: 'plains',
  elf: 'forest',
  dwarf: 'mountains',
  centaur: 'steppe',
} as const satisfies Record<PeopleId, BiomeId>;

/** Kinds of weather, and how much longer a road takes in each. */
// prettier-ignore
export const WEATHERS = {
  fair: { name: 'fair', travel: 1 },
  rain: { name: 'rain', travel: 1.1 },
  storm: { name: 'storms', travel: 1.35 },
  snow: { name: 'snow', travel: 1.5 },
  heat: { name: 'scorching heat', travel: 1.15 },
} as const satisfies Record<string, { readonly name: string; readonly travel: number }>;

export type WeatherId = keyof typeof WEATHERS;
