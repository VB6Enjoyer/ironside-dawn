import type { CultureId } from './cultures';
import type { LocationKind } from './locations';

/**
 * Things characters do while they stay somewhere. Phase 1 behavior is mostly
 * travel and these; Phase 2 replaces dungeon pastimes with real delves.
 */
export interface PastimeDef {
  readonly id: string;
  readonly culture: CultureId;
  readonly kind: LocationKind;
  readonly minHours: number;
  readonly maxHours: number;
  /** Relative chance among pastimes available at the same kind of place. */
  readonly weight: number;
}

export const PASTIMES = [
  { id: 'tavern', culture: 'generic', kind: 'town', minHours: 1, maxHours: 4, weight: 4 },
  { id: 'market', culture: 'generic', kind: 'town', minHours: 1, maxHours: 3, weight: 3 },
  { id: 'training', culture: 'generic', kind: 'town', minHours: 1, maxHours: 3, weight: 2 },
  { id: 'shrine', culture: 'generic', kind: 'town', minHours: 0.5, maxHours: 1.5, weight: 1 },
  { id: 'explore', culture: 'generic', kind: 'dungeon', minHours: 1, maxHours: 5, weight: 3 },
  { id: 'scout', culture: 'generic', kind: 'dungeon', minHours: 0.5, maxHours: 2, weight: 2 },
  { id: 'forage', culture: 'generic', kind: 'wilderness', minHours: 1, maxHours: 4, weight: 3 },
  { id: 'hunt', culture: 'generic', kind: 'wilderness', minHours: 2, maxHours: 5, weight: 2 },
] as const satisfies readonly PastimeDef[];

export type PastimeId = (typeof PASTIMES)[number]['id'];
