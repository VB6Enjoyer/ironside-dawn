import type { EventId, SimEvent } from '../model';

export type EventListener = (event: SimEvent) => void;

/**
 * In-memory store of recent events with subscribers. A ring buffer: once full,
 * the oldest events are dropped, so memory stays flat over long runs.
 * Retention by importance (keep notable events forever) arrives in Phase 6.
 */
export class EventStore {
  readonly capacity: number;
  readonly #buffer: SimEvent[] = [];
  #start = 0;
  readonly #listeners = new Set<EventListener>();

  constructor(capacity = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError(`Event store capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
  }

  get size(): number {
    return this.#buffer.length;
  }

  append(event: SimEvent): void {
    if (this.#buffer.length < this.capacity) {
      this.#buffer.push(event);
    } else {
      this.#buffer[this.#start] = event;
      this.#start = (this.#start + 1) % this.capacity;
    }
    for (const listener of this.#listeners) listener(event);
  }

  /** Stored events with an ID greater than `afterId`, oldest first. */
  since(afterId: EventId): SimEvent[] {
    const all = this.toArray();
    const first = all[0];
    if (first === undefined) return [];
    const skip = Math.max(0, afterId - first.id + 1);
    return all.slice(skip);
  }

  /** All stored events, oldest first. */
  toArray(): SimEvent[] {
    return [...this.#buffer.slice(this.#start), ...this.#buffer.slice(0, this.#start)];
  }

  /** Calls `listener` for every event appended from now on. Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
