import { STARTER_MAP, type MapDef } from '../content';
import { EventStore, type EventListener } from './core/event-store';
import { createRng } from './core/rng';
import { peekNext, popNext } from './core/scheduler';
import type { SimContext } from './context';
import { createWorldState, populate } from './gen/world';
import { EVENT_IMPORTANCE, type Job, type SimEvent, type World } from './model';
import { wakeCharacter } from './systems/behavior';
import { beginSeason, scheduleNextSeason } from './systems/calendar';
import { runRound } from './systems/combat';
import { daily, scheduleDaily } from './systems/ecology';

export interface SimulationOptions {
  readonly seed: string | number;
  /**
   * Adventurers at world creation. Newcomers arrive while fewer than this
   * many are alive. Defaults to 20.
   */
  readonly characterCount?: number;
  /** How many recent events to keep in memory. Defaults to 10,000. */
  readonly eventCapacity?: number;
  /** Defaults to the hand-made starter map. */
  readonly map?: MapDef;
  /**
   * Called for every event, including those emitted while the world is
   * created. Use this rather than `events.subscribe()` to see the full history.
   */
  readonly onEvent?: EventListener;
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
}

export function createSimulation(options: SimulationOptions): Simulation {
  const root = createRng(options.seed);
  const world = createWorldState(String(options.seed), options.map ?? STARTER_MAP);
  const events = new EventStore(options.eventCapacity);
  if (options.onEvent) events.subscribe(options.onEvent);
  const targetPopulation = options.characterCount ?? 20;

  const ctx: SimContext = {
    world,
    rng: {
      behavior: root.fork('behavior'),
      travel: root.fork('travel'),
      people: root.fork('people'),
      delve: root.fork('delve'),
      combat: root.fork('combat'),
      loot: root.fork('loot'),
      ecology: root.fork('ecology'),
      magic: root.fork('magic'),
      items: root.fork('items'),
      social: root.fork('social'),
      outlaws: root.fork('outlaws'),
    },
    emit(body, actors, locationId) {
      const event = {
        ...body,
        id: world.nextEventId++,
        t: world.time,
        importance: EVENT_IMPORTANCE[body.type],
        actors,
        locationId,
      } as SimEvent;
      events.append(event);
      return event;
    },
  };

  ctx.emit({ type: 'world.created', data: { seed: world.seed } }, [], null);
  populate(ctx, targetPopulation);
  scheduleNextSeason(ctx);
  scheduleDaily(ctx);

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
  };
}
