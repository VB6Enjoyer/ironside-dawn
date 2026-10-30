import type { SchedulerState } from '../core/scheduler';
import type { Character } from './character';
import type { CharacterId, LocationId, RouteId } from './ids';
import type { Job } from './jobs';
import type { Location, Route } from './location';

/**
 * The whole world state: plain data, entities referring to each other by ID
 * (ARCHITECTURE.md §4.3). Behavior lives in systems, never on these objects.
 */
export interface World {
  readonly seed: string;
  /** Current world time, in seconds. */
  time: number;
  readonly characters: Map<CharacterId, Character>;
  readonly locations: Map<LocationId, Location>;
  readonly routes: Map<RouteId, Route>;
  readonly scheduler: SchedulerState<Job>;
  nextCharacterNumber: number;
  nextEventId: number;
}
