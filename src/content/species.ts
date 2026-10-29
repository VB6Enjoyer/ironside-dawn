/**
 * Peoples (WORLD.md §2). Phase 1 has humans only; elves and dwarves join in
 * Phase 2, and stat modifiers, lifespans and attitudes come with them.
 */

export interface SpeciesDef {
  readonly id: string;
}

export const SPECIES = {
  human: { id: 'human' },
} as const satisfies Record<string, SpeciesDef>;

export type SpeciesId = keyof typeof SPECIES;
