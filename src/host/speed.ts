import { DAY, HOUR, Importance, MINUTE } from '../sim';

export type SpeedId = 'realtime' | 'minute' | 'hour' | 'day' | 'max';

export interface SpeedTier {
  readonly id: SpeedId;
  readonly label: string;
  /** In-game seconds per real second. Infinity runs as fast as the machine allows. */
  readonly rate: number;
  /** The lowest importance the log shows at this speed, unless the user overrides it. */
  readonly defaultFloor: Importance;
}

/** Speed tiers (ARCHITECTURE.md §4.2). Season and fast-forward arrive in Phase 6. */
export const SPEED_TIERS: readonly SpeedTier[] = [
  { id: 'realtime', label: 'Real-time', rate: 1, defaultFloor: Importance.Trivial },
  { id: 'minute', label: 'Minute', rate: MINUTE, defaultFloor: Importance.Trivial },
  { id: 'hour', label: 'Hour', rate: HOUR, defaultFloor: Importance.Normal },
  { id: 'day', label: 'Day', rate: DAY, defaultFloor: Importance.Notable },
  { id: 'max', label: 'Max', rate: Infinity, defaultFloor: Importance.Notable },
];

export function speedTier(id: SpeedId): SpeedTier {
  const tier = SPEED_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown speed tier: ${id}`);
  return tier;
}
