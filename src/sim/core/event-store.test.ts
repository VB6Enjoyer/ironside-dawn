import { describe, expect, it } from 'vitest';

import type { SimEvent } from '../model';
import { EventStore } from './event-store';

const event = (id: number, importance = 2, actors: string[] = []) =>
  ({
    id,
    t: id,
    type: 'world.created',
    data: { seed: 's' },
    importance,
    actors,
    locationId: null,
  }) as unknown as SimEvent;

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
    expect(() => new EventStore({ normal: -1 })).toThrow(RangeError);
  });

  it('forgets trivial events long before notable ones', () => {
    const store = new EventStore({ trivial: 2, normal: 3, notable: 100, legendary: Infinity });
    for (let id = 1; id <= 40; id++) store.append(event(id, id % 4));
    const kept = store.toArray();
    expect(kept.filter((e) => e.importance === 0).map((e) => e.id)).toEqual([36, 40]);
    expect(kept.filter((e) => e.importance === 1).map((e) => e.id)).toEqual([29, 33, 37]);
    expect(kept.filter((e) => e.importance >= 2)).toHaveLength(20);
    // Still in order across the tiers.
    expect(kept.map((e) => e.id)).toEqual([...kept.map((e) => e.id)].sort((a, b) => a - b));
  });

  it('finds the most recent events matching a query', () => {
    const store = new EventStore(100);
    for (let id = 1; id <= 20; id++) store.append(event(id, id % 4, id % 2 ? ['c1'] : ['c2']));
    const ids = (q: Parameters<EventStore['query']>[0]) => store.query(q).map((e) => e.id);
    expect(ids({ actor: 'c1' as never, minImportance: 2, limit: 3 })).toEqual([11, 15, 19]);
    expect(ids({ actor: 'c2' as never, beforeId: 9, limit: 2 })).toEqual([6, 8]);
    expect(ids({ from: 5, until: 8 })).toEqual([5, 6, 7]);
  });

  it('takes back saved events without telling subscribers', () => {
    const store = new EventStore(10);
    const seen: number[] = [];
    store.subscribe((e) => seen.push(e.id));
    store.restore([event(1), event(2, 3)]);
    expect(store.size).toBe(2);
    expect(seen).toEqual([]);
  });
});
