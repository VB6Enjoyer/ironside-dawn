import {
  createSimulation,
  DAY,
  type Importance,
  type SimEvent,
  type Simulation,
  type World,
} from '../sim';
import { speedTier, type SpeedId } from './speed';

/**
 * Runs the simulation on the main thread (ARCHITECTURE.md §5). It moves into
 * a Web Worker behind this same interface in Phase 6.
 */
export interface SimHost {
  /** The live world, for name lookups. Read-only for the UI. */
  readonly world: World;
  getSnapshot(): HostSnapshot;
  /** Called (at most ~10 times a second) whenever the snapshot changes. */
  subscribe(listener: () => void): () => void;
  start(): void;
  pause(): void;
  setSpeed(speed: SpeedId): void;
  /** Overrides the speed's default log floor; null goes back to the default. */
  setFloor(floor: Importance | null): void;
  /** While paused: runs until the next event the log would show (at most one in-game day). */
  step(): void;
}

export interface HostSnapshot {
  readonly seed: string;
  readonly time: number;
  readonly running: boolean;
  readonly speed: SpeedId;
  readonly floorOverride: Importance | null;
  /** The floor in effect: the override, or the speed's default. */
  readonly floor: Importance;
  /** Events at or above the floor when they happened, oldest first. */
  readonly log: readonly SimEvent[];
  readonly eventCount: number;
  /** Events not added to the log because they were below the floor. */
  readonly hiddenCount: number;
  /** Adventurers alive now, and those who have died. */
  readonly livingCount: number;
  readonly fallenCount: number;
  /** Measured in-game seconds per real second, smoothed. */
  readonly measuredRate: number;
}

export interface FrameScheduler {
  request(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export interface LocalHostOptions {
  readonly seed: string;
  readonly frames: FrameScheduler;
  /** Wall clock in milliseconds. Defaults to `performance.now()`. */
  readonly now?: () => number;
  /** Most log entries kept for the UI. Defaults to 20,000. */
  readonly logLimit?: number;
  readonly characterCount?: number;
}

/** A long pause between frames (a background tab) is not caught up on. */
const MAX_FRAME_GAP_MS = 250;
/** Max-speed work per frame, leaving the rest of the frame for rendering. */
const MAX_SPEED_BUDGET_MS = 10;
/** Jobs per advance call at max speed, between wall-clock checks. */
const MAX_SPEED_JOB_SLICE = 500;
/** Jobs per frame at timed speeds. If exceeded, the backlog is dropped and time slows. */
const FRAME_JOB_BUDGET = 20_000;
const NOTIFY_INTERVAL_MS = 100;
const RATE_SMOOTHING = 0.1;

export function createLocalHost(options: LocalHostOptions): SimHost {
  const now = options.now ?? (() => performance.now());
  const logLimit = options.logLimit ?? 20_000;
  const { frames } = options;

  let speed: SpeedId = 'minute';
  let floorOverride: Importance | null = null;
  let running = false;
  let frameHandle: unknown = null;
  let lastFrameAt = 0;
  let lastNotifyAt = -Infinity;
  /** Fractional in-game time the clock is heading for at timed speeds. */
  let target = 0;
  let measuredRate = 0;

  let log: readonly SimEvent[] = [];
  let pending: SimEvent[] = [];
  let eventCount = 0;
  let hiddenCount = 0;
  let dirty = true;
  let snapshot: HostSnapshot | null = null;
  const listeners = new Set<() => void>();

  const floor = () => floorOverride ?? speedTier(speed).defaultFloor;

  const intake = (event: SimEvent) => {
    eventCount++;
    if (event.importance >= floor()) pending.push(event);
    else hiddenCount++;
  };

  const sim: Simulation = createSimulation({
    seed: options.seed,
    characterCount: options.characterCount,
    onEvent: intake,
  });
  target = sim.world.time;

  function flush(force: boolean): void {
    const at = now();
    if (!force && at - lastNotifyAt < NOTIFY_INTERVAL_MS) return;
    if (pending.length > 0) {
      const merged = log.concat(pending);
      log = merged.length > logLimit ? merged.slice(merged.length - logLimit) : merged;
      pending = [];
      dirty = true;
    }
    if (!dirty) return;
    snapshot = null;
    dirty = false;
    lastNotifyAt = at;
    for (const listener of listeners) listener();
  }

  function changed(): void {
    dirty = true;
    flush(true);
  }

  function frame(): void {
    frameHandle = null;
    if (!running) return;

    const at = now();
    const elapsedMs = Math.min(at - lastFrameAt, MAX_FRAME_GAP_MS);
    lastFrameAt = at;
    const before = sim.world.time;
    const tier = speedTier(speed);

    if (tier.rate === Infinity) {
      const deadline = at + MAX_SPEED_BUDGET_MS;
      do {
        sim.advance(sim.world.time + DAY, { maxJobs: MAX_SPEED_JOB_SLICE });
      } while (now() < deadline);
      target = sim.world.time;
    } else {
      target += (elapsedMs / 1000) * tier.rate;
      const until = Math.floor(target);
      if (until > sim.world.time) {
        const result = sim.advance(until, { maxJobs: FRAME_JOB_BUDGET });
        if (!result.reachedTarget) target = sim.world.time;
      }
    }

    if (elapsedMs > 0) {
      const rate = (sim.world.time - before) / (elapsedMs / 1000);
      measuredRate += (rate - measuredRate) * RATE_SMOOTHING;
    }
    if (sim.world.time !== before) dirty = true;
    flush(false);
    frameHandle = frames.request(frame);
  }

  function stopLoop(): void {
    if (frameHandle !== null) frames.cancel(frameHandle);
    frameHandle = null;
  }

  return {
    world: sim.world,

    getSnapshot() {
      snapshot ??= {
        seed: sim.world.seed,
        time: sim.world.time,
        running,
        speed,
        floorOverride,
        floor: floor(),
        log,
        // Events still waiting to be flushed into the log aren't counted yet.
        eventCount: eventCount - pending.length,
        hiddenCount,
        ...countLiving(sim.world),
        measuredRate: running ? measuredRate : 0,
      };
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (running) return;
      running = true;
      target = sim.world.time;
      lastFrameAt = now();
      measuredRate = 0;
      frameHandle = frames.request(frame);
      changed();
    },

    pause() {
      if (!running) return;
      running = false;
      stopLoop();
      changed();
    },

    setSpeed(next) {
      speedTier(next); // validates
      speed = next;
      target = sim.world.time;
      measuredRate = 0;
      changed();
    },

    setFloor(next) {
      floorOverride = next;
      changed();
    },

    step() {
      if (running) return;
      const limit = sim.world.time + DAY;
      const shownBefore = pending.length;
      while (pending.length === shownBefore) {
        if (sim.advance(limit, { maxJobs: 1 }).reachedTarget) break;
      }
      target = sim.world.time;
      changed();
    },
  };
}

function countLiving(world: World): { livingCount: number; fallenCount: number } {
  let livingCount = 0;
  for (const character of world.characters.values()) if (character.death === null) livingCount++;
  return { livingCount, fallenCount: world.characters.size - livingCount };
}
