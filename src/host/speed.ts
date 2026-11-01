import { DAY, HOUR, Importance, MINUTE } from '../sim';

export type SpeedId = 'realtime' | 'minute' | 'hour' | 'day' | 'season' | 'max';

export interface SpeedTier {
  readonly id: SpeedId;
  readonly label: string;
  /** In-game seconds per real second. Infinity runs as fast as the machine allows. */
  readonly rate: number;
  /** The lowest importance the log shows at this speed, unless the user overrides it. */
  readonly defaultFloor: Importance;
  /**
   * Run slightly ahead and let events out at their own times, so the log
   * reads smoothly instead of in bursts (the playback buffer).
   */
  readonly playback: boolean;
}

/** Speed tiers (ARCHITECTURE.md §4.2). Fast-forward is a separate action. */
export const SPEED_TIERS: readonly SpeedTier[] = [
  { id: 'realtime', label: 'Real-time', rate: 1, defaultFloor: Importance.Trivial, playback: true },
  { id: 'minute', label: 'Minute', rate: MINUTE, defaultFloor: Importance.Trivial, playback: true },
  { id: 'hour', label: 'Hour', rate: HOUR, defaultFloor: Importance.Normal, playback: false },
  { id: 'day', label: 'Day', rate: DAY, defaultFloor: Importance.Notable, playback: false },
  {
    id: 'season',
    label: 'Season',
    rate: 90 * DAY,
    defaultFloor: Importance.Notable,
    playback: false,
  },
  { id: 'max', label: 'Max', rate: Infinity, defaultFloor: Importance.Notable, playback: false },
];

export function speedTier(id: SpeedId): SpeedTier {
  const tier = SPEED_TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown speed tier: ${id}`);
  return tier;
}
