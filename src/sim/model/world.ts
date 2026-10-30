import type { SchedulerState } from '../core/scheduler';
import type { Character } from './character';
import type { Encounter } from './encounter';
import type { CharacterId, EncounterId, LocationId, RouteId } from './ids';
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
  /** Every character who ever lived, including the dead. */
  readonly characters: Map<CharacterId, Character>;
  readonly locations: Map<LocationId, Location>;
  readonly routes: Map<RouteId, Route>;
  /** Fights in progress. */
  readonly encounters: Map<EncounterId, Encounter>;
  readonly scheduler: SchedulerState<Job>;
  /** Full names in use, so new characters get distinct ones. */
  readonly takenNames: Set<string>;
  nextCharacterNumber: number;
  nextEncounterNumber: number;
  nextEventId: number;
}
