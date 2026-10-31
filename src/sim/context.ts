import type { Rng } from './core/rng';
import type { EntityId, EventBody, LocationId, World } from './model';

/** What a system gets to work with while handling a job. */
export interface SimContext {
  readonly world: World;
  /** One stream per subsystem (ARCHITECTURE.md §4.1). */
  readonly rng: {
    readonly behavior: Rng;
    readonly travel: Rng;
    readonly people: Rng;
    readonly delve: Rng;
    readonly combat: Rng;
    readonly loot: Rng;
    readonly ecology: Rng;
    readonly magic: Rng;
    readonly items: Rng;
    readonly social: Rng;
    readonly outlaws: Rng;
  };
  /** Reports an event. Detail events nobody is watching are skipped (see `Watch`). */
  emit(body: EventBody, actors: readonly EntityId[], locationId: LocationId | null): void;
}
