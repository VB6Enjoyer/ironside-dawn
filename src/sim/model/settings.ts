import type { PeopleId } from '../../content';

/** How big a generated world is. */
export type WorldSize = 'small' | 'medium' | 'large';

/**
 * Choices made when a world is created (ROADMAP.md Phase 11), kept with it so
 * a saved world carries on as it began.
 */
export interface WorldSettings {
  readonly size: WorldSize;
  /** How deadly the dungeons are, and how many of the dread lurk. */
  readonly danger: 'gentle' | 'normal' | 'deadly';
  /** How often the gift for magic is born. */
  readonly magic: 'rare' | 'normal' | 'common';
  /** The peoples living in the world. Humans, at least. */
  readonly peoples: readonly PeopleId[];
  /** The most named characters alive at once: past it, no births and no newcomers. */
  readonly populationCap: number | null;
}
