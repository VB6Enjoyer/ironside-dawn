/**
 * The economy as data (ROADMAP.md Phase 7): the goods that change hands, the
 * trades that make them, and what townsfolk need to live. Units are abstract
 * ("a measure of food", "a crate of tools"); values are a starting point
 * only, since markets set the real prices.
 */

export interface GoodDef {
  readonly id: string;
  readonly name: string;
  /** "measures of food", "pieces of armor". */
  readonly plural: string;
  /** Rough worth of one unit in gold, where prices start. */
  readonly value: number;
}

// prettier-ignore
export const GOODS = [
  { id: 'food', name: 'food', plural: 'measures of food', value: 1 },
  { id: 'ore', name: 'iron ore', plural: 'loads of iron ore', value: 4 },
  { id: 'hides', name: 'hides', plural: 'bundles of hides', value: 6 },
  { id: 'herbs', name: 'herbs', plural: 'bundles of herbs', value: 3 },
  { id: 'silk', name: 'spider silk', plural: 'bolts of spider silk', value: 10 },
  { id: 'reagents', name: 'reagents', plural: 'jars of reagents', value: 12 },
  { id: 'tools', name: 'tools', plural: 'crates of tools', value: 12 },
  { id: 'clothes', name: 'clothes', plural: 'bales of clothes', value: 8 },
  { id: 'potions', name: 'healing draughts', plural: 'healing draughts', value: 15 },
  { id: 'arms', name: 'arms', plural: 'weapons', value: 40 },
  { id: 'armor', name: 'armor', plural: 'suits of armor', value: 50 },
] as const satisfies readonly GoodDef[];

export type GoodId = (typeof GOODS)[number]['id'];
export type Goods = Partial<Record<GoodId, number>>;

export function goodDef(id: GoodId): GoodDef {
  return GOODS.find((g) => g.id === id)!;
}

/** One way to turn work (and inputs) into goods. */
export interface Recipe {
  readonly inputs: Goods;
  readonly outputs: Goods;
}

export interface ProfessionDef {
  readonly id: string;
  /** "farmers". */
  readonly name: string;
  /** Recipes run per worker per day. */
  readonly work: number;
  /** The worker picks whichever pays best. */
  readonly recipes: readonly Recipe[];
  /** Only where the town has this. */
  readonly needs?: 'mine';
}

// prettier-ignore
export const PROFESSIONS = [
  { id: 'farmers', name: 'farmers', work: 1, recipes: [{ inputs: {}, outputs: { food: 0.3 } }] },
  { id: 'miners', name: 'miners', work: 1, needs: 'mine', recipes: [{ inputs: {}, outputs: { ore: 0.06 } }] },
  { id: 'hunters', name: 'hunters', work: 1, recipes: [{ inputs: {}, outputs: { hides: 0.05 } }] },
  { id: 'herbalists', name: 'herbalists', work: 1, recipes: [{ inputs: {}, outputs: { herbs: 0.2 } }] },
  {
    id: 'smiths', name: 'smiths', work: 0.05,
    recipes: [
      { inputs: { ore: 1 }, outputs: { tools: 1 } },
      { inputs: { ore: 2 }, outputs: { arms: 1 } },
      { inputs: { ore: 2, hides: 1 }, outputs: { armor: 1 } },
    ],
  },
  {
    id: 'alchemists', name: 'alchemists', work: 0.1,
    recipes: [
      { inputs: { herbs: 2, reagents: 0.25 }, outputs: { potions: 1.5 } },
      { inputs: { herbs: 3 }, outputs: { potions: 1 } },
    ],
  },
  {
    id: 'tailors', name: 'tailors', work: 0.08,
    recipes: [
      { inputs: { hides: 1 }, outputs: { clothes: 1 } },
      { inputs: { silk: 1 }, outputs: { clothes: 3 } },
    ],
  },
] as const satisfies readonly ProfessionDef[];

export type ProfessionId = (typeof PROFESSIONS)[number]['id'];

export function professionDef(id: ProfessionId): ProfessionDef {
  return PROFESSIONS.find((p) => p.id === id)!;
}

/** What every townsperson uses up in a day, whatever their trade. The arms and armor equip the town watch. */
export const NEEDS_PER_HEAD: Goods = {
  food: 0.1,
  tools: 0.002,
  clothes: 0.003,
  potions: 0.0004,
  arms: 0.0002,
  armor: 0.0001,
};

/** Troubles that hit a town's trades, or close a road, for a while. */
export interface ShockDef {
  readonly id: string;
  /** Who it hits, or a road. */
  readonly target: ProfessionId | 'road';
  /** Their output is multiplied by this while it lasts. */
  readonly output: number;
  /** Daily chance, per town (or per road). */
  readonly chance: number;
  readonly days: readonly [number, number];
}

// prettier-ignore
export const SHOCKS = [
  { id: 'failed-harvest', target: 'farmers', output: 0.4, chance: 1 / 500, days: [60, 120] },
  { id: 'mine-collapse', target: 'miners', output: 0.1, chance: 1 / 700, days: [30, 90] },
  { id: 'rich-vein', target: 'miners', output: 2, chance: 1 / 700, days: [90, 180] },
  { id: 'blight', target: 'herbalists', output: 0.3, chance: 1 / 600, days: [40, 90] },
  { id: 'blockade', target: 'road', output: 0, chance: 1 / 900, days: [15, 40] },
] as const satisfies readonly ShockDef[];

export type ShockId = (typeof SHOCKS)[number]['id'];

export function shockDef(id: ShockId): ShockDef {
  return SHOCKS.find((s) => s.id === id)!;
}
