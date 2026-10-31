import { describe, expect, it } from 'vitest';

import { StreamHash } from './core/hash';
import { DAY } from './core/time';
import type { CharacterId, SimEvent } from './model';
import { checkSave, decode, encode } from './save';
import { createSimulation, DETAIL_EVENTS, type Watch } from './simulation';

const fingerprint = (events: readonly SimEvent[]) => {
  const hash = new StreamHash();
  for (const event of events) hash.update(JSON.stringify(event));
  return hash.digest();
};

describe('saves', () => {
  it('encodes maps and sets as plain data and back', () => {
    const value = { m: new Map([['a', { s: new Set([1, 2]) }]]), list: [1, 'x', null] };
    const plain = JSON.parse(JSON.stringify(encode(value)));
    expect(decode(plain)).toEqual(value);
  });

  it('carries on exactly where the world left off', () => {
    const seed = 'saved';
    const halfway = 60 * DAY;
    const end = 120 * DAY;

    const straight: SimEvent[] = [];
    const sim = createSimulation({ seed, characterCount: 40, onEvent: (e) => straight.push(e) });
    sim.advance(sim.world.time + halfway);
    // Through JSON, as a save file would go.
    const save = JSON.parse(JSON.stringify(sim.save()));
    const before = straight.length;
    sim.advance(sim.world.time + (end - halfway));

    const resumed: SimEvent[] = [];
    const loaded = createSimulation({
      seed: 'ignored',
      restore: save,
      onEvent: (e) => resumed.push(e),
    });
    expect(loaded.world.seed).toBe(seed);
    loaded.advance(loaded.world.time + (end - halfway));

    expect(resumed.length).toBe(straight.length - before);
    expect(fingerprint(resumed)).toBe(fingerprint(straight.slice(before)));
    expect(JSON.stringify(loaded.save())).toBe(JSON.stringify(sim.save()));
  });

  it('refuses what is not a save', () => {
    expect(() => checkSave({ hello: 1 })).toThrow(/Not an Ironside Dawn/);
    expect(() => checkSave({ format: 'ironside-dawn/world', version: 99 })).toThrow(/version 99/);
  });
});

describe('silent detail', () => {
  const run = (watch: Watch) => {
    const events: SimEvent[] = [];
    const sim = createSimulation({
      seed: 'detail',
      characterCount: 30,
      watch,
      onEvent: (e) => events.push(e),
    });
    sim.advance(sim.world.time + 20 * DAY);
    return { events, save: JSON.stringify(sim.save()) };
  };
  const all = run('all');
  const none = run('none');
  const someone = 'c3' as CharacterId;
  const one = run({ characters: new Set([someone]), locations: new Set() });
  const outline = (events: readonly SimEvent[]) => events.filter((e) => !DETAIL_EVENTS.has(e.type));

  it('reports blow-by-blow detail only for those watched', () => {
    expect(all.events.some((e) => DETAIL_EVENTS.has(e.type))).toBe(true);
    expect(none.events.some((e) => DETAIL_EVENTS.has(e.type))).toBe(false);
    const detail = one.events.filter((e) => DETAIL_EVENTS.has(e.type));
    expect(detail.length).toBeGreaterThan(0);
    expect(detail.every((e) => e.actors.includes(someone))).toBe(true);
  });

  it('never changes what happens, or any other event', () => {
    expect(none.save).toBe(all.save);
    expect(one.save).toBe(all.save);
    expect(fingerprint(outline(none.events))).toBe(fingerprint(outline(all.events)));
    expect(fingerprint(outline(one.events))).toBe(fingerprint(outline(all.events)));
  });
});
