import { STARTER_MAP, type MapDef } from '../content';
import { EventStore, type EventListener, type Retention } from './core/event-store';
import { createRng, restoreRng, type Rng } from './core/rng';
import { peekNext, popNext } from './core/scheduler';
import type { SimContext } from './context';
import { createWorldState, populate } from './gen/world';
import {
  EVENT_IMPORTANCE,
  Importance,
  type CharacterId,
  type EventType,
  type Job,
  type LocationId,
  type SimEvent,
  type World,
} from './model';
import { wakeCharacter } from './systems/behavior';
import { beginSeason, scheduleNextSeason } from './systems/calendar';
import { runRound } from './systems/combat';
import { daily, scheduleDaily } from './systems/ecology';
import { sampleHistory } from './systems/history';
import {
  checkSave,
  decodeWorld,
  encodeWorld,
  SAVE_FORMAT,
  SAVE_VERSION,
  type WorldSave,
} from './save';

export interface SimulationOptions {
  readonly seed: string | number;
  /**
   * Adventurers at world creation. Newcomers arrive while fewer than this
   * many are alive. Defaults to 20.
   */
  readonly characterCount?: number;
  /**
   * How many past events of each importance to keep in memory (a number:
   * that many of each). Defaults to `DEFAULT_RETENTION`.
   */
  readonly retention?: number | Partial<Retention>;
  /** Whose blow-by-blow detail to report. Defaults to everyone's. */
  readonly watch?: Watch;
  /** Defaults to the hand-made starter map. */
  readonly map?: MapDef;
  /**
   * Called for every event, including those emitted while the world is
   * created. Use this rather than `events.subscribe()` to see the full history.
   */
  readonly onEvent?: EventListener;
  /**
   * Carry on a saved world instead of creating one. `seed`, `characterCount`
   * and `map` are then taken from the save.
   */
  readonly restore?: WorldSave;
}

export interface AdvanceOptions {
  /**
   * Stop after this many jobs even if `until` hasn't been reached, so a host
   * can keep the page responsive. Where the run stops has no effect on what
   * happens later (the golden rule, ARCHITECTURE.md §4.2).
   */
  readonly maxJobs?: number;
}

export interface AdvanceResult {
  readonly jobsRun: number;
  /** False if `maxJobs` stopped the run first. `world.time` is then the last job's time. */
  readonly reachedTarget: boolean;
}

export interface Simulation {
  /** The world state. Read it freely; only the simulation changes it. */
  readonly world: World;
  readonly events: EventStore;
  /** Runs every job due up to and including `until`, then sets the clock to `until`. */
  advance(until: number, options?: AdvanceOptions): AdvanceResult;
  /** A snapshot of the world to carry on later. Unaffected by what happens after. */
  save(): WorldSave;
  /** Changes whose blow-by-blow detail is reported. Never changes what happens. */
  setWatch(watch: Watch): void;
}

/**
 * Silent detail (ARCHITECTURE.md §4.2): blow-by-blow and room-by-room events
 * are only reported for watched characters and places, and other trivial
 * events (pastimes, nights' rest, passing through) only when asked for.
 * Everything runs in full either way, and the unreported events still take
 * their IDs, so history and every other event are the same whoever watches.
 */
export type Watch =
  | 'all'
  | 'none'
  | {
      readonly characters: ReadonlySet<CharacterId>;
      readonly locations: ReadonlySet<LocationId>;
      /** Report everyone's trivial events (but detail only for those watched). */
      readonly trivia: boolean;
    };

export const DETAIL_EVENTS: ReadonlySet<EventType> = new Set([
  'combat.attack',
  'combat.flee',
  'delve.quiet',
]);

/** One random stream per subsystem (ARCHITECTURE.md §4.1). */
const STREAMS = [
  'behavior',
  'travel',
  'people',
  'delve',
  'combat',
  'loot',
  'ecology',
  'magic',
  'items',
  'social',
  'outlaws',
] as const satisfies readonly (keyof SimContext['rng'])[];

export function createSimulation(options: SimulationOptions): Simulation {
  const restore = options.restore ? checkSave(options.restore) : null;
  const world = restore
    ? decodeWorld(restore.world)
    : createWorldState(String(options.seed), options.map ?? STARTER_MAP);
  const events = new EventStore(options.retention);
  let watch: Watch = options.watch ?? 'all';
  const watched = (actors: readonly string[], locationId: LocationId | null) => {
    if (watch === 'all') return true;
    if (watch === 'none') return false;
    const { characters, locations } = watch;
    return (
      (locationId !== null && locations.has(locationId)) ||
      actors.some((id) => characters.has(id as CharacterId))
    );
  };
  const reported = (type: EventType, actors: readonly string[], locationId: LocationId | null) => {
    if (watch === 'all') return true;
    if (DETAIL_EVENTS.has(type)) return watched(actors, locationId);
    if (EVENT_IMPORTANCE[type] !== Importance.Trivial) return true;
    return watch !== 'none' && (watch.trivia || watched(actors, locationId));
  };
  if (options.onEvent) events.subscribe(options.onEvent);
  const targetPopulation = restore?.characterCount ?? options.characterCount ?? 20;

  const root = createRng(world.seed);
  const rng = Object.fromEntries(
    STREAMS.map((name) => {
      const state = restore?.rng[name];
      return [name, state ? restoreRng(state) : root.fork(name)];
    }),
  ) as Record<(typeof STREAMS)[number], Rng>;

  const ctx: SimContext = {
    world,
    rng,
    emit(body, actors, locationId) {
      if (!reported(body.type, actors, locationId)) {
        world.nextEventId++;
        return;
      }
      const event = {
        ...body,
        id: world.nextEventId++,
        t: world.time,
        importance: EVENT_IMPORTANCE[body.type],
        actors,
        locationId,
      } as SimEvent;
      events.append(event);
    },
  };

  if (!restore) {
    ctx.emit({ type: 'world.created', data: { seed: world.seed } }, [], null);
    populate(ctx, targetPopulation);
    sampleHistory(world);
    scheduleNextSeason(ctx);
    scheduleDaily(ctx);
  }

  function run(job: Job): void {
    switch (job.kind) {
      case 'character.wake': {
        const character = world.characters.get(job.characterId);
        if (!character) throw new Error(`Unknown character ${job.characterId}`);
        if (job.token !== character.wakeToken) return; // replaced by a later wake-up
        wakeCharacter(ctx, character);
        return;
      }
      case 'combat.round': {
        const encounter = world.encounters.get(job.encounterId);
        if (!encounter) throw new Error(`Unknown encounter ${job.encounterId}`);
        runRound(ctx, encounter);
        return;
      }
      case 'world.daily':
        daily(ctx, targetPopulation);
        return;
      case 'calendar.season':
        beginSeason(ctx);
        return;
    }
  }

  return {
    world,
    events,
    advance(until, { maxJobs = Infinity } = {}) {
      if (!Number.isSafeInteger(until) || until < world.time) {
        throw new RangeError(`Cannot advance to ${until}; the world is already at ${world.time}`);
      }
      let jobsRun = 0;
      for (;;) {
        const next = peekNext(world.scheduler);
        if (next === undefined || next.at > until) {
          world.time = until;
          return { jobsRun, reachedTarget: true };
        }
        if (jobsRun >= maxJobs) return { jobsRun, reachedTarget: false };
        popNext(world.scheduler);
        world.time = next.at;
        run(next.job);
        jobsRun++;
      }
    },
    save() {
      return {
        format: SAVE_FORMAT,
        version: SAVE_VERSION,
        characterCount: targetPopulation,
        rng: Object.fromEntries(STREAMS.map((name) => [name, rng[name].getState()])),
        world: encodeWorld(world),
      };
    },
    setWatch(next) {
      watch = next;
    },
  };
}
