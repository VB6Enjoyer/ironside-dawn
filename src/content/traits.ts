/**
 * Personality (ROADMAP.md Phase 4). Each trait runs from 0 to 1; 0.5 is
 * ordinary. Species shift where their people tend to land (WORLD.md §3), but
 * individuals vary widely.
 */
export const TRAITS = [
  'bravery',
  'greed',
  'curiosity',
  'sociability',
  'patience',
  'compassion',
  'honor',
] as const;
export type TraitId = (typeof TRAITS)[number];
export type Traits = Readonly<Record<TraitId, number>>;

/** Where a people's traits center, and how widely they spread. Defaults: 0.5 ± 0.18. */
export type TraitTendencies = Partial<
  Record<TraitId, { readonly mean: number; readonly sd?: number }>
>;

export const DEFAULT_TRAIT_MEAN = 0.5;
export const DEFAULT_TRAIT_SD = 0.18;

/** Words for the two ends of each trait, for the character card. */
export const TRAIT_POLES: Record<TraitId, readonly [low: string, high: string]> = {
  bravery: ['timid', 'fearless'],
  greed: ['generous', 'greedy'],
  curiosity: ['incurious', 'curious'],
  sociability: ['solitary', 'gregarious'],
  patience: ['impatient', 'patient'],
  compassion: ['cruel', 'compassionate'],
  honor: ['treacherous', 'honorable'],
};
