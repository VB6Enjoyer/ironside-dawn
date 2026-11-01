import type { EntityId, EventId, EventType, LocationId, SimEvent } from '../model';

export type EventListener = (event: SimEvent) => void;

/** How many events of each importance to keep. Older ones are dropped first. */
export interface Retention {
  readonly trivial: number;
  readonly normal: number;
  readonly notable: number;
  readonly legendary: number;
}

/**
 * Trivial goings-on are soon forgotten, the everyday a while later; notable
 * events make up the chronicle and legendary ones are kept forever
 * (ARCHITECTURE.md §4.4).
 */
export const DEFAULT_RETENTION: Retention = {
  trivial: 2_000,
  normal: 20_000,
  notable: 100_000,
  legendary: Infinity,
};

export interface EventQuery {
  /** Only events with this character or place among their actors. */
  readonly actor?: EntityId;
  /** Only events that happened here. */
  readonly locationId?: LocationId;
  readonly types?: readonly EventType[];
  /** Lowest importance to include. */
  readonly minImportance?: number;
  /** Only events with an ID below this, for paging back through history. */
  readonly beforeId?: EventId;
  /** Only events at or after this time. */
  readonly from?: number;
  /** Only events before this time. */
  readonly until?: number;
  /** The most recent this many matches. */
  readonly limit?: number;
}

/** A ring buffer: once full, the oldest entry is overwritten. */
class Ring {
  readonly #items: SimEvent[] = [];
  #start = 0;
  constructor(readonly capacity: number) {}

  get size(): number {
    return this.#items.length;
  }

  push(event: SimEvent): void {
    if (this.capacity === 0) return;
    if (this.#items.length < this.capacity) {
      this.#items.push(event);
    } else {
      this.#items[this.#start] = event;
      this.#start = (this.#start + 1) % this.#items.length;
    }
  }

  /** Oldest first. */
  toArray(): SimEvent[] {
    return [...this.#items.slice(this.#start), ...this.#items.slice(0, this.#start)];
  }
}

/**
 * In-memory store of past events with subscribers. Each importance has its
 * own ring, so a flood of trivial events never pushes out the chronicle, and
 * memory stays bounded over long runs.
 */
export class EventStore {
  readonly retention: Retention;
  readonly #rings: readonly Ring[];
  readonly #listeners = new Set<EventListener>();

  /** A number keeps that many of each importance. */
  constructor(retention: number | Partial<Retention> = DEFAULT_RETENTION) {
    const limits =
      typeof retention === 'number'
        ? { trivial: retention, normal: retention, notable: retention, legendary: retention }
        : { ...DEFAULT_RETENTION, ...retention };
    for (const [importance, n] of Object.entries(limits)) {
      if (!(n === Infinity || (Number.isSafeInteger(n) && n >= 0))) {
        throw new RangeError(`Retention for ${importance} events must be a count, got ${n}`);
      }
    }
    if (Object.values(limits).every((n) => n === 0)) {
      throw new RangeError('An event store must keep something');
    }
    this.retention = limits;
    this.#rings = [limits.trivial, limits.normal, limits.notable, limits.legendary].map(
      (n) => new Ring(n),
    );
  }

  get size(): number {
    return this.#rings.reduce((total, ring) => total + ring.size, 0);
  }

  append(event: SimEvent): void {
    this.#rings[event.importance]!.push(event);
    for (const listener of this.#listeners) listener(event);
  }

  /** Puts back events from a save, without telling subscribers. */
  restore(events: readonly SimEvent[]): void {
    for (const event of events) this.#rings[event.importance]!.push(event);
  }

  /** Stored events with an ID greater than `afterId`, oldest first. */
  since(afterId: EventId): SimEvent[] {
    return this.toArray().filter((e) => e.id > afterId);
  }

  /** All stored events, oldest first. */
  toArray(): SimEvent[] {
    return merge(this.#rings.map((ring) => ring.toArray()));
  }

  /** Stored events matching every given condition, oldest first. */
  query(q: EventQuery): SimEvent[] {
    const types = q.types ? new Set<string>(q.types) : null;
    const matches = (e: SimEvent) =>
      (q.actor === undefined || e.actors.includes(q.actor)) &&
      (q.locationId === undefined || e.locationId === q.locationId) &&
      (types === null || types.has(e.type)) &&
      (q.beforeId === undefined || e.id < q.beforeId) &&
      (q.from === undefined || e.t >= q.from) &&
      (q.until === undefined || e.t < q.until);
    const min = q.minImportance ?? 0;
    const found = merge(this.#rings.slice(min).map((ring) => ring.toArray().filter(matches)));
    return q.limit === undefined ? found : found.slice(Math.max(0, found.length - q.limit));
  }

  /** Calls `listener` for every event appended from now on. Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/** Merges lists each sorted by ID into one. */
function merge(lists: SimEvent[][]): SimEvent[] {
  const nonEmpty = lists.filter((l) => l.length > 0);
  if (nonEmpty.length <= 1) return nonEmpty[0] ?? [];
  return nonEmpty.flat().sort((a, b) => a.id - b.id);
}
