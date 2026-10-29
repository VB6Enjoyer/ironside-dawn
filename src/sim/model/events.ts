import type { PastimeId } from '../../content';
import type { CharacterId, EntityId, EventId, LocationId } from './ids';

/**
 * Structured events: the single source of truth for "what happened"
 * (ARCHITECTURE.md §4.4). The simulation never builds display text; the
 * renderer in `src/text` turns these into prose.
 */

export const Importance = {
  Trivial: 0,
  Normal: 1,
  Notable: 2,
  Legendary: 3,
} as const;
export type Importance = (typeof Importance)[keyof typeof Importance];

export type EventBody =
  | { readonly type: 'world.created'; readonly data: { readonly seed: string } }
  | {
      readonly type: 'calendar.season';
      readonly data: { readonly year: number; readonly season: number };
    }
  | {
      readonly type: 'character.introduced';
      readonly data: { readonly characterId: CharacterId; readonly homeId: LocationId };
    }
  | {
      readonly type: 'character.pastime';
      readonly data: {
        readonly characterId: CharacterId;
        readonly locationId: LocationId;
        readonly pastime: PastimeId;
      };
    }
  | {
      readonly type: 'character.rest';
      readonly data: { readonly characterId: CharacterId; readonly locationId: LocationId };
    }
  | {
      readonly type: 'travel.depart';
      readonly data: {
        readonly characterId: CharacterId;
        readonly fromId: LocationId;
        readonly destinationId: LocationId;
        /** Typical duration of the whole journey, in seconds. */
        readonly expectedDuration: number;
      };
    }
  | {
      readonly type: 'travel.pass';
      readonly data: {
        readonly characterId: CharacterId;
        readonly locationId: LocationId;
        readonly destinationId: LocationId;
      };
    }
  | {
      readonly type: 'travel.arrive';
      readonly data: { readonly characterId: CharacterId; readonly locationId: LocationId };
    };

export type EventType = EventBody['type'];

export type SimEvent = EventBody & {
  readonly id: EventId;
  /** World time, in seconds. */
  readonly t: number;
  readonly importance: Importance;
  /** Who was involved, for filtering, following and (later) memory. */
  readonly actors: readonly EntityId[];
  readonly locationId: LocationId | null;
};

export type EventOfType<T extends EventType> = Extract<SimEvent, { readonly type: T }>;

/** How much each kind of event matters. Decided here, not at each emit site. */
export const EVENT_IMPORTANCE: Record<EventType, Importance> = {
  'world.created': Importance.Notable,
  'calendar.season': Importance.Notable,
  'character.introduced': Importance.Normal,
  'character.pastime': Importance.Trivial,
  'character.rest': Importance.Trivial,
  'travel.depart': Importance.Normal,
  'travel.pass': Importance.Trivial,
  'travel.arrive': Importance.Normal,
};
