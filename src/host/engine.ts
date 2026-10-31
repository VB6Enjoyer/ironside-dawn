import {
  createSimulation,
  DAY,
  Importance,
  worldSample,
  type CharacterId,
  type EventType,
  type LocationId,
  type SimEvent,
  type Simulation,
  type Watch,
  type WorldSample,
} from '../sim';
import type {
  ClientMessage,
  Digest,
  EngineMessage,
  EngineStatus,
  FastForwardDigest,
  InitOptions,
  LogEntry,
  NameEntry,
  Request,
  Responses,
} from './protocol';
import { speedTier, type SpeedId } from './speed';
import {
  characterView,
  chronicleView,
  eventsView,
  fullName,
  hallsView,
  locationView,
  placeEntry,
  placesView,
  savedGame,
  searchView,
  statsView,
} from './views';

/**
 * Runs the simulation and answers the UI (ARCHITECTURE.md §5). It lives in a
 * Web Worker in the browser, but knows nothing about workers: it gets
 * messages through `receive` and sends them with `post`, so tests can drive
 * it directly with a hand-cranked timer.
 */

export interface Timer {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface EngineOptions {
  post(message: EngineMessage): void;
  timer: Timer;
  /** Wall clock in milliseconds. */
  now(): number;
}

export interface Engine {
  receive(message: ClientMessage): void;
}

/** Between ticks at timed speeds. */
const TICK_MS = 16;
/** A long gap between ticks (a throttled tab) is not caught up on. */
const MAX_TICK_GAP_MS = 250;
/** Work per tick when running flat out, before letting messages in. */
const FLAT_OUT_BUDGET_MS = 40;
/** Work per tick at timed speeds. If it isn't enough, time slows down. */
const TIMED_BUDGET_MS = 25;
/** Jobs between clock checks. */
const JOB_SLICE = 500;
const NOTIFY_MS = 100;
/** Faster updates while events are played back at their own times. */
const PLAYBACK_NOTIFY_MS = 40;
/** How far ahead of the shown clock the playback buffer runs, in real seconds. */
const PLAYBACK_LEAD_S = 0.25;
/** More log entries than this in one update are thinned into a digest line. */
const MAX_ENTRIES_PER_UPDATE = 250;
/** The speed shown is measured over this much real time. */
const RATE_WINDOW_MS = 1_000;
/** Highlights kept for a fast-forward digest. */
const MAX_HIGHLIGHTS = 60;
/** Recent saved events put back in the log after loading. */
const RESTORED_LOG = 300;
/** Notable, but too routine to be a highlight. */
const ROUTINE: ReadonlySet<EventType> = new Set(['calendar.season', 'world.created']);

interface FastForward {
  readonly from: number;
  readonly to: number;
  readonly before: WorldSample;
  readonly counts: Partial<Record<EventType, number>>;
  readonly highlights: SimEvent[];
  moreHighlights: number;
}

export function createEngine(options: EngineOptions): Engine {
  const { post, timer, now } = options;
  let state: ReturnType<typeof start> | null = null;

  return {
    receive(message) {
      try {
        if (message.kind === 'init') {
          if (state) throw new Error('The engine is already running a world');
          state = start(message);
          return;
        }
        if (!state) throw new Error('The engine has no world yet');
        state.receive(message);
      } catch (error) {
        post({
          kind: 'error',
          id: message.kind === 'request' ? message.id : null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };

  function start(init: InitOptions) {
    let speed: SpeedId = 'minute';
    let floorOverride: Importance | null = null;
    let running = false;
    let stepping = false;
    let tickHandle: unknown = null;
    let lastTickAt = now();
    let lastNotifyAt = -Infinity;
    let dirty = true;
    let measuredRate = 0;
    /** Recent [wall clock, shown clock] pairs, for measuring speed. */
    const rateSamples: [number, number][] = [];
    const resetRate = () => {
      measuredRate = 0;
      rateSamples.length = 0;
    };
    let eventCount = 0;
    let hiddenCount = 0;
    let nextDigestId = -1;
    let ff: FastForward | null = null;
    let finishedDigest: FastForwardDigest | null = null;
    let placesSent = false;
    const following = new Set<CharacterId>();
    let watchedPlace: LocationId | null = null;
    /** Entries ready to send. */
    let pending: LogEntry[] = [];
    /** Entries the shown clock hasn't reached yet (the playback buffer). */
    const held: SimEvent[] = [];
    /** What each character's name entry was when last sent. */
    const sentNames = new Map<CharacterId, string>();
    /** The clock shown: at slow speeds a little behind the simulation. */
    let target = 0;

    const floor = (): Importance => {
      const chosen = floorOverride ?? speedTier(speed).defaultFloor;
      return ff ? (Math.max(chosen, Importance.Notable) as Importance) : chosen;
    };
    const isFollowed = (e: SimEvent) => e.actors.some((id) => following.has(id as CharacterId));

    function intake(event: SimEvent): void {
      eventCount++;
      if (ff) countForDigest(ff, event);
      if (event.importance < floor() && !isFollowed(event)) {
        hiddenCount++;
        return;
      }
      if (event.t > shown()) held.push(event);
      else pending.push(event);
    }

    /**
     * Detail for the followed and the place looked at; everyone's trivia only
     * when the log would show them. Never built otherwise, which is most of
     * the saving at high speed.
     */
    function currentWatch(): Watch {
      return {
        characters: following,
        locations: new Set(watchedPlace ? [watchedPlace] : []),
        trivia: floor() === Importance.Trivial,
      };
    }

    const sim: Simulation = init.restore
      ? createSimulation({
          seed: init.seed,
          restore: init.restore.world,
          watch: currentWatch(),
          onEvent: intake,
        })
      : createSimulation({
          seed: init.seed,
          characterCount: init.characterCount,
          watch: currentWatch(),
          onEvent: intake,
        });
    if (init.restore) {
      sim.events.restore(init.restore.events);
      const recent = init.restore.events.filter((e) => e.importance >= floor());
      pending.push(...recent.slice(-RESTORED_LOG));
    }
    // What happened while the world was made is shown at once.
    releaseAll();

    function shown(): number {
      const tier = speedTier(speed);
      if (ff || stepping || !tier.playback) return Infinity;
      return Math.floor(target);
    }
    const shownTime = () => Math.min(Math.floor(target), sim.world.time);

    function release(): void {
      const until = shown();
      let n = 0;
      while (n < held.length && held[n]!.t <= until) n++;
      if (n > 0) pending.push(...held.splice(0, n));
    }

    function releaseAll(): void {
      target = sim.world.time;
      pending.push(...held.splice(0));
    }

    function updateWatch(): void {
      sim.setWatch(currentWatch());
    }

    /** Runs jobs until `until` or the budget runs out. Returns whether it got there. */
    function runFor(budgetMs: number, until: number): boolean {
      const deadline = now() + budgetMs;
      for (;;) {
        const goal = Math.min(until, sim.world.time + DAY);
        const result = sim.advance(goal, { maxJobs: JOB_SLICE });
        if (result.reachedTarget && goal >= until) return true;
        if (now() >= deadline) return false;
      }
    }

    function tick(): void {
      tickHandle = null;
      const at = now();
      const elapsedMs = Math.min(at - lastTickAt, MAX_TICK_GAP_MS);
      lastTickAt = at;
      const before = shownTime();

      if (ff) {
        if (runFor(FLAT_OUT_BUDGET_MS, ff.to)) finishFastForward(false);
        target = sim.world.time;
      } else if (running) {
        const tier = speedTier(speed);
        if (tier.rate === Infinity) {
          runFor(FLAT_OUT_BUDGET_MS, Infinity);
          target = sim.world.time;
        } else {
          target += (elapsedMs / 1000) * tier.rate;
          const lead = tier.playback ? PLAYBACK_LEAD_S * tier.rate : 0;
          const goal = Math.floor(target + lead);
          if (goal > sim.world.time && !runFor(TIMED_BUDGET_MS, goal)) {
            // Falling behind: time slows rather than piling up a backlog.
            target = Math.min(target, sim.world.time);
          }
        }
        release();
      }

      // Measured over the last second, as the clock moves in whole seconds.
      rateSamples.push([at, shownTime()]);
      while (rateSamples.length > 2 && at - rateSamples[1]![0] >= RATE_WINDOW_MS)
        rateSamples.shift();
      const [firstAt, firstTime] = rateSamples[0]!;
      if (at > firstAt) measuredRate = (shownTime() - firstTime) / ((at - firstAt) / 1000);
      if (shownTime() !== before) dirty = true;
      flush(false);
      schedule();
    }

    function schedule(): void {
      if (tickHandle !== null || !(running || ff)) return;
      const flatOut = ff !== null || speedTier(speed).rate === Infinity;
      tickHandle = timer.set(tick, flatOut ? 0 : TICK_MS);
    }

    function stop(): void {
      if (tickHandle !== null) timer.clear(tickHandle);
      tickHandle = null;
    }

    function flush(force: boolean): void {
      const at = now();
      const interval = speedTier(speed).playback && running ? PLAYBACK_NOTIFY_MS : NOTIFY_MS;
      if (!force && at - lastNotifyAt < interval) return;
      const entries = thin(pending);
      pending = [];
      const names = changedNames();
      if (!dirty && entries.length === 0 && names.length === 0 && !finishedDigest) return;
      lastNotifyAt = at;
      dirty = false;
      post({
        kind: 'update',
        status: status(),
        entries,
        names,
        ...(placesSent ? {} : { places: [...sim.world.locations.values()].map(placeEntry) }),
        ...(finishedDigest ? { digest: finishedDigest } : {}),
      });
      placesSent = true;
      finishedDigest = null;
    }

    /** Display throttling: keeps the important and the latest, and counts the rest. */
    function thin(entries: LogEntry[]): LogEntry[] {
      if (entries.length <= MAX_ENTRIES_PER_UPDATE) return entries;
      const keep = new Set<LogEntry>();
      for (const e of entries) {
        if (keep.size >= MAX_ENTRIES_PER_UPDATE) break;
        if ('importance' in e && (e.importance >= Importance.Notable || isFollowed(e))) keep.add(e);
      }
      for (let i = entries.length - 1; i >= 0 && keep.size < MAX_ENTRIES_PER_UPDATE; i--) {
        keep.add(entries[i]!);
      }
      const dropped = entries.filter((e) => !keep.has(e));
      const digest: Digest = { digest: true, id: nextDigestId--, t: dropped[0]!.t, count: 0 };
      const count = dropped.reduce((n, e) => n + ('digest' in e ? e.count : 1), 0);
      return [{ ...digest, count }, ...entries.filter((e) => keep.has(e))];
    }

    function changedNames(): NameEntry[] {
      const changed: NameEntry[] = [];
      for (const c of sim.world.characters.values()) {
        const key = `${c.equipment.weapon.base}|${c.death ? 1 : 0}`;
        if (sentNames.get(c.id) === key) continue;
        sentNames.set(c.id, key);
        changed.push({
          id: c.id,
          name: fullName(c),
          species: c.species,
          weapon: c.equipment.weapon.base,
          dead: c.death !== null,
        });
      }
      return changed;
    }

    function status(): EngineStatus {
      let livingCount = 0;
      for (const c of sim.world.characters.values()) if (!c.death) livingCount++;
      return {
        seed: sim.world.seed,
        time: shownTime(),
        running,
        speed,
        floorOverride,
        floor: floor(),
        // Events still waiting in the playback buffer aren't counted yet.
        eventCount: eventCount - held.length,
        hiddenCount,
        livingCount,
        fallenCount: sim.world.characters.size - livingCount,
        measuredRate: running || ff ? measuredRate : 0,
        following: [...following],
        fastForward: ff ? { from: ff.from, to: ff.to } : null,
      };
    }

    function changed(): void {
      dirty = true;
      flush(true);
    }

    function countForDigest(skip: FastForward, event: SimEvent): void {
      skip.counts[event.type] = (skip.counts[event.type] ?? 0) + 1;
      if (event.importance < Importance.Notable || ROUTINE.has(event.type)) return;
      if (skip.highlights.length < MAX_HIGHLIGHTS) {
        skip.highlights.push(event);
        return;
      }
      skip.moreHighlights++;
      // A legendary event displaces the oldest merely notable one.
      if (event.importance >= Importance.Legendary) {
        const i = skip.highlights.findIndex((e) => e.importance < Importance.Legendary);
        if (i >= 0) {
          skip.highlights.splice(i, 1);
          skip.highlights.push(event);
        }
      }
    }

    function finishFastForward(cancelled: boolean): void {
      if (!ff) return;
      finishedDigest = {
        from: ff.from,
        to: sim.world.time,
        cancelled,
        before: ff.before,
        after: worldSample(sim.world),
        counts: ff.counts,
        highlights: ff.highlights,
        moreHighlights: ff.moreHighlights,
      };
      ff = null;
      updateWatch();
      target = sim.world.time;
      resetRate();
      changed();
    }

    function answer(request: Request): Responses[Request['kind']] {
      switch (request.kind) {
        case 'character':
          return characterView(sim, request.id);
        case 'location':
          return locationView(sim, request.id);
        case 'places':
          return placesView(sim);
        case 'stats':
          return statsView(sim);
        case 'chronicle':
          return chronicleView(sim, request.year);
        case 'halls':
          return hallsView(sim);
        case 'search':
          return searchView(sim, request.text);
        case 'events':
          return eventsView(sim, request.query);
        case 'save':
          return savedGame(sim);
      }
    }

    // The first update: the world as it is, with every name and place.
    changed();

    return {
      receive(message: Exclude<ClientMessage, { kind: 'init' }>) {
        switch (message.kind) {
          case 'start':
            if (running || ff) return;
            running = true;
            target = Math.min(target, sim.world.time);
            lastTickAt = now();
            resetRate();
            changed();
            schedule();
            return;
          case 'pause':
            if (!running) return;
            running = false;
            if (!ff) stop();
            changed();
            return;
          case 'speed':
            speedTier(message.speed); // validates
            speed = message.speed;
            updateWatch();
            releaseAll();
            resetRate();
            stop();
            changed();
            schedule();
            return;
          case 'floor':
            floorOverride = message.floor;
            updateWatch();
            changed();
            return;
          case 'step': {
            if (running || ff) return;
            if (held.length > 0) {
              target = held[0]!.t;
              release();
            } else {
              stepping = true;
              const limit = sim.world.time + DAY;
              const shownBefore = pending.length;
              while (pending.length === shownBefore) {
                if (sim.advance(limit, { maxJobs: 1 }).reachedTarget) break;
              }
              stepping = false;
              target = sim.world.time;
            }
            changed();
            return;
          }
          case 'follow':
            following.clear();
            for (const id of message.ids) following.add(id);
            updateWatch();
            changed();
            return;
          case 'watchPlace':
            watchedPlace = message.id;
            updateWatch();
            return;
          case 'fastForward': {
            if (ff || message.until <= sim.world.time) return;
            releaseAll();
            ff = {
              from: sim.world.time,
              to: Math.floor(message.until),
              before: worldSample(sim.world),
              counts: {},
              highlights: [],
              moreHighlights: 0,
            };
            updateWatch();
            running = false;
            stop();
            lastTickAt = now();
            resetRate();
            changed();
            schedule();
            return;
          }
          case 'cancelFastForward':
            stop();
            finishFastForward(true);
            return;
          case 'request':
            post({ kind: 'reply', id: message.id, result: answer(message.request) });
            return;
        }
      },
    };
  }
}
