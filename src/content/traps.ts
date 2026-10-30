import type { CultureId } from './cultures';

export interface TrapDef {
  readonly id: string;
  readonly culture: CultureId;
  /** Damage dice if not avoided. */
  readonly damage: string;
  /** Added to the dungeon's danger-based difficulty. */
  readonly difficulty: number;
  /** Minutes of dizziness on a failed save, if any. */
  readonly dizzyMinutes: number;
  readonly weight: number;
}

export const TRAPS = [
  { id: 'pit', culture: 'generic', damage: '2d4', difficulty: 0, dizzyMinutes: 0, weight: 3 },
  { id: 'darts', culture: 'generic', damage: '1d6', difficulty: 1, dizzyMinutes: 0, weight: 3 },
  { id: 'gas', culture: 'generic', damage: '1d4', difficulty: 0, dizzyMinutes: 40, weight: 2 },
  {
    id: 'falling-stones',
    culture: 'generic',
    damage: '2d6',
    difficulty: 2,
    dizzyMinutes: 20,
    weight: 1,
  },
] as const satisfies readonly TrapDef[];

export type TrapId = (typeof TRAPS)[number]['id'];
