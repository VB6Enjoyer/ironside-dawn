import { describe, expect, it } from 'vitest';

import {
  createSimulation,
  DAY,
  DETAIL_EVENTS,
  Importance,
  type CharacterId,
  type SimEvent,
} from '../sim';
import type { Timer } from './engine';
import { createInProcessHost } from './in-process';
import { isDigest, type InitOptions, type LogEntry } from './protocol';
import { SPEED_TIERS } from './speed';

/** Timeouts that run only when the test says so. */
class ManualTimer implements Timer {
  #queue: (() => void)[] = [];
  set(callback: () => void) {
    this.#queue.push(callback);
    return callback;
  }
  clear(handle: unknown) {
    this.#queue = this.#queue.filter((cb) => cb !== handle);
  }
  run() {
    const queue = this.#queue;
    this.#queue = [];
    queue.forEach((cb) => cb());
  }
}

/** A clock that moves forward a little every time it's read, like a real one. */
function fakeClock() {
  let ms = 0;
  return { now: () => (ms += 1), skip: (by: number) => (ms += by) };
}

function setup(init: Partial<InitOptions> = {}, logLimit = 1_000_000) {
  const timer = new ManualTimer();
  const clock = fakeClock();
  const host = createInProcessHost({ seed: 'host', ...init }, { timer, now: clock.now, logLimit });
  const runTicks = (count: number) => {
    for (let i = 0; i < count; i++) {
      clock.skip(16);
      timer.run();
    }
  };
  return { host, timer, clock, runTicks };
}

/** How many events a log stands for, digest lines included. */
const represented = (log: readonly LogEntry[]) =>
  log.reduce((n, e) => n + (isDigest(e) ? e.count : 1), 0);

describe('engine', () => {
  it('sends the world, its places and everyone’s names straight away', () => {
    const { host } = setup();
    const snapshot = host.getSnapshot();
    expect(snapshot.ready).toBe(true);
    expect(snapshot.livingCount).toBe(20);
    expect(host.places.size).toBeGreaterThan(3);
    const someone = snapshot.log.find((e) => !isDigest(e) && e.type === 'character.introduced');
    expect(
      someone && !isDigest(someone) && host.names.character(someone.actors[0] as CharacterId),
    ).toBeTruthy();
  });

  it('makes the same history as a direct run, whatever speeds it was driven at', async () => {
    const { host, runTicks } = setup();
    host.start();
    for (const tier of SPEED_TIERS) {
      host.setSpeed(tier.id);
      runTicks(tier.rate === Infinity ? 2 : 5);
    }
    host.pause();
    const saved = await host.request({ kind: 'save' });

    const sim = createSimulation({ seed: 'host', watch: 'none' });
    sim.advance(saved.time);
    expect(saved.time).toBeGreaterThan(DAY);
    expect(JSON.stringify(saved.world)).toBe(JSON.stringify(sim.save()));
  });

  it('moves the clock at roughly the chosen rate', () => {
    const { host, runTicks } = setup();
    host.setSpeed('hour');
    host.start();
    const before = host.getSnapshot().time;
    runTicks(63); // ~1 real second of 16 ms ticks
    const elapsed = host.getSnapshot().time - before;
    expect(elapsed).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(4200);
  });

  it('reports a steady speed even when the clock moves in whole seconds', () => {
    const { host, runTicks } = setup();
    host.setSpeed('realtime');
    host.start();
    runTicks(190); // ~3 real seconds
    expect(host.getSnapshot().measuredRate).toBeGreaterThan(0.7);
    expect(host.getSnapshot().measuredRate).toBeLessThan(1.3);
  });

  it('hides events below the floor and counts them', () => {
    const { host, runTicks } = setup();
    host.setSpeed('max'); // default floor: notable
    host.start();
    runTicks(8);
    const snapshot = host.getSnapshot();
    expect(snapshot.floor).toBe(Importance.Notable);
    expect(snapshot.hiddenCount).toBeGreaterThan(0);
    expect(snapshot.eventCount).toBe(snapshot.hiddenCount + represented(snapshot.log));
  });

  it('does not move while paused', () => {
    const { host, runTicks } = setup();
    host.start();
    runTicks(5);
    host.pause();
    const time = host.getSnapshot().time;
    runTicks(50);
    expect(host.getSnapshot().time).toBe(time);
  });

  it('steps to the next event the log would show', () => {
    const { host } = setup();
    host.setSpeed('hour'); // floor: normal
    const before = host.getSnapshot().log.length;
    host.step();
    const { log, time } = host.getSnapshot();
    expect(log.length).toBe(before + 1);
    const last = log.at(-1)!;
    expect(!isDigest(last) && last.importance).toBeGreaterThanOrEqual(Importance.Normal);
    expect(last.t).toBe(time);
  });

  it('plays events back at their own times at slow speeds', () => {
    const { host, runTicks } = setup();
    host.setSpeed('minute');
    host.start();
    for (let i = 0; i < 40; i++) {
      runTicks(5);
      const { log, time } = host.getSnapshot();
      expect(log.every((e) => e.t <= time)).toBe(true);
    }
    expect(host.getSnapshot().log.length).toBeGreaterThan(0);
  });

  it('thins a flood of events into digest lines', () => {
    const { host, runTicks } = setup();
    host.setFloor(Importance.Trivial);
    host.setSpeed('max');
    host.start();
    runTicks(20);
    const { log, eventCount, hiddenCount } = host.getSnapshot();
    expect(log.some(isDigest)).toBe(true);
    expect(represented(log)).toBe(eventCount - hiddenCount);
  });

  it('notifies subscribers and gives a stable snapshot between changes', () => {
    const { host } = setup();
    let notified = 0;
    host.subscribe(() => notified++);
    expect(host.getSnapshot()).toBe(host.getSnapshot());
    host.setSpeed('day');
    expect(notified).toBe(1);
    expect(host.getSnapshot().speed).toBe('day');
  });

  it('keeps at most `logLimit` entries', () => {
    const { host, runTicks } = setup({}, 50);
    host.setFloor(Importance.Trivial);
    host.setSpeed('max');
    host.start();
    runTicks(3);
    expect(host.getSnapshot().eventCount).toBeGreaterThan(50);
    expect(host.getSnapshot().log).toHaveLength(50);
  });

  it('caps the catch-up after a long pause between ticks', () => {
    const { host, timer, clock } = setup();
    host.setSpeed('day');
    host.start();
    timer.run();
    const before = host.getSnapshot().time;
    // A minute-long gap (a background tab) counts as at most 250 ms (plus the
    // few milliseconds since the last update).
    clock.skip(60_000);
    timer.run();
    expect(host.getSnapshot().time - before).toBeLessThanOrEqual(DAY * 0.26);
  });

  it('follows a character blow by blow, whatever the floor', () => {
    const { host, runTicks } = setup({ seed: 'follow' });
    const hero = 'c1' as CharacterId;
    host.follow([hero]);
    host.setSpeed('day'); // floor: notable
    host.start();
    runTicks(200);
    const events = host.getSnapshot().log.filter((e) => !isDigest(e)) as SimEvent[];
    const theirs = events.filter((e) => e.actors.includes(hero));
    expect(theirs.some((e) => e.importance === Importance.Trivial)).toBe(true);
    const detail = events.filter((e) => DETAIL_EVENTS.has(e.type));
    expect(detail.length).toBeGreaterThan(0);
    expect(detail.every((e) => e.actors.includes(hero))).toBe(true);
    expect(host.getSnapshot().following).toEqual([hero]);
  });

  it('skips ahead, then pauses with a digest of what happened', () => {
    const { host, runTicks } = setup({ seed: 'skip' });
    const from = host.getSnapshot().time;
    host.fastForward(from + 360 * DAY);
    expect(host.getSnapshot().fastForward).toEqual({ from, to: from + 360 * DAY });
    runTicks(500);
    const { digest, fastForward, running, time, log } = host.getSnapshot();
    expect(fastForward).toBeNull();
    expect(running).toBe(false);
    expect(time).toBe(from + 360 * DAY);
    expect(digest).not.toBeNull();
    expect(digest!.cancelled).toBe(false);
    expect(digest!.counts['delve.enter']).toBeGreaterThan(0);
    expect(digest!.after.t).toBe(time);
    expect(digest!.highlights.every((e) => e.importance >= Importance.Notable)).toBe(true);
    // Only notable events reach the log while skipping.
    expect(
      log.filter((e) => e.t > from && !isDigest(e) && e.importance < Importance.Notable),
    ).toHaveLength(0);
    host.dismissDigest();
    expect(host.getSnapshot().digest).toBeNull();
  });

  it('can cancel a skip partway', () => {
    const { host, runTicks } = setup({ seed: 'skip' });
    const from = host.getSnapshot().time;
    host.fastForward(from + 100 * 360 * DAY);
    runTicks(3);
    host.cancelFastForward();
    const { digest, fastForward, time } = host.getSnapshot();
    expect(fastForward).toBeNull();
    expect(digest!.cancelled).toBe(true);
    expect(time).toBeGreaterThan(from);
    expect(time).toBeLessThan(from + 100 * 360 * DAY);
  });

  it('saves and carries on in a new engine', async () => {
    const first = setup({ seed: 'carry' });
    first.host.setSpeed('max');
    first.host.start();
    first.runTicks(10);
    first.host.pause();
    const saved = await first.host.request({ kind: 'save' });
    expect(saved.events.length).toBeGreaterThan(0);

    const second = setup({ seed: 'carry', restore: structuredClone(saved) });
    const again = await second.host.request({ kind: 'save' });
    expect(JSON.stringify(again.world)).toBe(JSON.stringify(saved.world));
    expect(second.host.getSnapshot().log.length).toBeGreaterThan(0);
    expect(second.host.getSnapshot().time).toBe(saved.time);
  });

  it('answers questions about the world', async () => {
    const { host, runTicks } = setup({ seed: 'views' });
    host.setSpeed('max');
    host.start();
    runTicks(30);
    host.pause();

    const hero = await host.request({ kind: 'character', id: 'c1' as CharacterId });
    expect(hero?.character.id).toBe('c1');
    expect(hero?.slice.characters.get('c1' as CharacterId)?.name).toBe(
      host.names.character('c1' as CharacterId)?.name,
    );
    expect(hero?.events.length).toBeGreaterThan(0);
    expect(await host.request({ kind: 'character', id: 'nobody' as CharacterId })).toBeNull();

    const town = await host.request({ kind: 'location', id: hero!.character.homeId });
    expect(town?.location.kind).toBe('town');
    expect(town?.events.length).toBeGreaterThan(0);

    const stats = await host.request({ kind: 'stats' });
    expect(stats.history.length).toBeGreaterThan(1);
    expect(Object.values(stats.levels).reduce((a, b) => a + b, 0)).toBe(
      host.getSnapshot().livingCount,
    );

    const chronicle = await host.request({ kind: 'chronicle', year: null });
    expect(chronicle.events.every((e) => e.importance >= Importance.Notable)).toBe(true);

    const halls = await host.request({ kind: 'halls' });
    expect(halls.heroes.length).toBeGreaterThan(0);
    expect(halls.heroes[0]!.level).toBeGreaterThanOrEqual(halls.heroes.at(-1)!.level);

    const name = host.names.character('c1' as CharacterId)!.name;
    const found = await host.request({ kind: 'search', text: name.slice(0, 4).toLowerCase() });
    expect(found.characters.some((c) => c.id === 'c1')).toBe(true);
  });
});
