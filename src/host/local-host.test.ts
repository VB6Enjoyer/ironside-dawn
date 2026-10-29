import { describe, expect, it } from 'vitest';

import { createSimulation, DAY, Importance, StreamHash, WORLD_START, type SimEvent } from '../sim';
import { createLocalHost, type FrameScheduler } from './local-host';
import { SPEED_TIERS } from './speed';

/** Frames that run only when the test says so. */
class ManualFrames implements FrameScheduler {
  #queue: (() => void)[] = [];
  request(callback: () => void) {
    this.#queue.push(callback);
    return callback;
  }
  cancel(handle: unknown) {
    this.#queue = this.#queue.filter((cb) => cb !== handle);
  }
  run(count: number) {
    for (let i = 0; i < count; i++) {
      const queue = this.#queue;
      this.#queue = [];
      queue.forEach((cb) => cb());
    }
  }
}

/** A clock that moves forward a little every time it's read, like a real one. */
function fakeClock() {
  let ms = 0;
  return {
    now: () => (ms += 1),
    skip: (by: number) => (ms += by),
  };
}

function setup(seed = 'host') {
  const frames = new ManualFrames();
  const clock = fakeClock();
  const host = createLocalHost({ seed, frames, now: clock.now, logLimit: 1_000_000 });
  const runFrames = (count: number) => {
    for (let i = 0; i < count; i++) {
      clock.skip(16);
      frames.run(1);
    }
  };
  return { host, frames, clock, runFrames };
}

const hashOf = (events: readonly SimEvent[]) => {
  const hash = new StreamHash();
  for (const e of events) hash.update(JSON.stringify(e));
  return hash.digest();
};

describe('local host', () => {
  it('produces the same history as a direct run, whatever speeds it was driven at', () => {
    const { host, runFrames } = setup();
    host.setFloor(Importance.Trivial); // log everything, to compare full histories
    host.start();
    for (const tier of SPEED_TIERS) {
      host.setSpeed(tier.id);
      runFrames(20);
    }
    host.pause();
    const { log, time } = host.getSnapshot();

    const direct: SimEvent[] = [];
    const sim = createSimulation({ seed: 'host', onEvent: (e) => direct.push(e) });
    sim.advance(time);

    expect(log.length).toBeGreaterThan(100);
    expect(hashOf(log)).toBe(hashOf(direct));
  });

  it('moves the clock at roughly the chosen rate', () => {
    const { host, runFrames } = setup();
    host.setSpeed('hour');
    host.start();
    const before = host.getSnapshot().time;
    runFrames(63); // ~1 real second of 16 ms frames
    const elapsed = host.getSnapshot().time - before;
    expect(elapsed).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(4200);
  });

  it('hides events below the floor and counts them', () => {
    const { host, runFrames } = setup();
    host.setSpeed('max'); // default floor: notable
    host.start();
    runFrames(50); // long enough to reach the first season change
    const snapshot = host.getSnapshot();
    expect(snapshot.floor).toBe(Importance.Notable);
    expect(snapshot.hiddenCount).toBeGreaterThan(0);
    // Introductions at world creation were logged under the starting speed's floor.
    const sinceCreation = snapshot.log.filter((e) => e.t > WORLD_START);
    expect(sinceCreation.length).toBeGreaterThan(0);
    expect(sinceCreation.every((e) => e.importance >= Importance.Notable)).toBe(true);
    expect(snapshot.eventCount).toBe(snapshot.hiddenCount + snapshot.log.length);
  });

  it('does not move while paused', () => {
    const { host, runFrames } = setup();
    host.start();
    runFrames(5);
    host.pause();
    const time = host.getSnapshot().time;
    runFrames(50);
    expect(host.getSnapshot().time).toBe(time);
  });

  it('steps to the next event the log would show', () => {
    const { host } = setup();
    host.setSpeed('hour'); // floor: normal
    const before = host.getSnapshot().log.length;
    host.step();
    const { log, time } = host.getSnapshot();
    expect(log.length).toBe(before + 1);
    expect(log.at(-1)!.importance).toBeGreaterThanOrEqual(Importance.Normal);
    expect(log.at(-1)!.t).toBe(time);
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
    const frames = new ManualFrames();
    const clock = fakeClock();
    const host = createLocalHost({ seed: 'cap', frames, now: clock.now, logLimit: 50 });
    host.setFloor(Importance.Trivial);
    host.start();
    host.setSpeed('max');
    for (let i = 0; i < 20; i++) {
      clock.skip(200);
      frames.run(1);
    }
    const { log, eventCount } = host.getSnapshot();
    expect(eventCount).toBeGreaterThan(50);
    expect(log).toHaveLength(50);
    expect(log.at(-1)!.id).toBe(eventCount);
  });

  it('caps the catch-up after a long pause between frames', () => {
    const { host, frames, clock } = setup();
    host.setSpeed('day');
    host.start();
    frames.run(1);
    const before = host.getSnapshot().time;
    // A minute-long gap (a background tab) counts as at most 250 ms.
    clock.skip(60_000);
    frames.run(1);
    expect(host.getSnapshot().time - before).toBeLessThanOrEqual(DAY * 0.25 + 1);
  });
});
