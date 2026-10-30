import { describe, expect, it } from 'vitest';

import type { SimEvent } from '../model';
import { EventStore } from './event-store';

const event = (id: number) =>
  ({
    id,
    t: id,
    type: 'world.created',
    data: { seed: 's' },
    importance: 2,
    actors: [],
    locationId: null,
  }) as SimEvent;

describe('EventStore', () => {
  it('keeps events in order until full, then drops the oldest', () => {
    const store = new EventStore(3);
    [1, 2, 3, 4, 5].forEach((id) => store.append(event(id)));
    expect(store.size).toBe(3);
    expect(store.toArray().map((e) => e.id)).toEqual([3, 4, 5]);
  });

  it('returns events after a given ID', () => {
    const store = new EventStore(10);
    [1, 2, 3, 4].forEach((id) => store.append(event(id)));
    expect(store.since(2).map((e) => e.id)).toEqual([3, 4]);
    expect(store.since(0).map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(store.since(4)).toEqual([]);
  });

  it('returns what it still has when asked for dropped events', () => {
    const store = new EventStore(2);
    [1, 2, 3, 4].forEach((id) => store.append(event(id)));
    expect(store.since(0).map((e) => e.id)).toEqual([3, 4]);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const store = new EventStore(10);
    const seen: number[] = [];
    const unsubscribe = store.subscribe((e) => seen.push(e.id));
    store.append(event(1));
    unsubscribe();
    store.append(event(2));
    expect(seen).toEqual([1]);
  });

  it('rejects an invalid capacity', () => {
    expect(() => new EventStore(0)).toThrow(RangeError);
  });
});
