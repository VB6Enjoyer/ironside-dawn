import { PASTIMES, type LocationKind } from '../../content';
import { schedule } from '../core/scheduler';
import { HOUR, nextTimeOfDay, timeOfDay } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Location, LocationId } from '../model';
import { finishLeg, startJourney } from './travel';

/**
 * Phase 1 behavior: the simplest thing that keeps the world moving.
 * Characters travel between places, pass time where they arrive, and sleep at
 * night. Phase 4 replaces this with utility AI.
 */

const NIGHT_STARTS = 21 * HOUR;
const MORNING = 6 * HOUR;
/** How long after dawn a character may lie in. */
const MAX_LIE_IN = 2 * HOUR;

/** Chance of staying for a pastime rather than moving on. */
const STAY_AFTER_ARRIVAL = 0.85;
const STAY_AGAIN: Record<LocationKind, number> = { town: 0.35, dungeon: 0.2, wilderness: 0.2 };

/** Relative appeal of each kind of destination. */
const DESTINATION_WEIGHT: Record<LocationKind, number> = { town: 3, dungeon: 2, wilderness: 1 };
const HOME_WEIGHT = 4;

/** Called when a character's scheduled wake-up comes due. */
export function wakeCharacter(ctx: SimContext, character: Character): void {
  if (character.activity.kind === 'traveling') {
    const arrived = finishLeg(ctx, character);
    if (arrived) decide(ctx, character, true);
    return;
  }
  decide(ctx, character, false);
}

function decide(ctx: SimContext, character: Character, justArrived: boolean): void {
  const location = locationOf(ctx, character);
  const rng = ctx.rng.behavior;

  if (isNight(ctx.world.time)) {
    rest(ctx, character, location);
    return;
  }

  const stayChance = justArrived ? STAY_AFTER_ARRIVAL : STAY_AGAIN[location.kind];
  if (rng.chance(stayChance) && startPastime(ctx, character, location)) return;

  const destinationId = chooseDestination(ctx, character, location);
  if (destinationId && startJourney(ctx, character, destinationId)) return;

  // Nowhere to go and nothing to do: wait an hour and think again.
  character.activity = { kind: 'idle' };
  wakeAt(ctx, character, ctx.world.time + HOUR);
}

function rest(ctx: SimContext, character: Character, location: Location): void {
  const until = nextTimeOfDay(ctx.world.time, MORNING) + ctx.rng.behavior.int(0, MAX_LIE_IN);
  character.activity = { kind: 'resting', until };
  ctx.emit(
    { type: 'character.rest', data: { characterId: character.id, locationId: location.id } },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, until);
}

function startPastime(ctx: SimContext, character: Character, location: Location): boolean {
  const available = PASTIMES.filter((p) => p.kind === location.kind);
  const local = available.filter((p) => p.culture === location.culture);
  const options = local.length > 0 ? local : available;
  if (options.length === 0) return false;

  const rng = ctx.rng.behavior;
  const pastime = rng.weighted(options.map((p) => [p, p.weight] as const));
  const duration = rng.int(
    Math.round(pastime.minHours * HOUR),
    Math.round(pastime.maxHours * HOUR),
  );
  const until = ctx.world.time + duration;

  character.activity = { kind: 'pastime', pastime: pastime.id, until };
  ctx.emit(
    {
      type: 'character.pastime',
      data: { characterId: character.id, locationId: location.id, pastime: pastime.id },
    },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, until);
  return true;
}

function chooseDestination(
  ctx: SimContext,
  character: Character,
  here: Location,
): LocationId | null {
  const options: [LocationId, number][] = [];
  for (const location of ctx.world.locations.values()) {
    if (location.id === here.id) continue;
    const weight =
      location.id === character.homeId ? HOME_WEIGHT : DESTINATION_WEIGHT[location.kind];
    options.push([location.id, weight]);
  }
  return options.length > 0 ? ctx.rng.behavior.weighted(options) : null;
}

function locationOf(ctx: SimContext, character: Character): Location {
  const id = character.locationId;
  const location = id === null ? undefined : ctx.world.locations.get(id);
  if (!location) throw new Error(`${character.id} is not at a known location`);
  return location;
}

function isNight(time: number): boolean {
  const t = timeOfDay(time);
  return t >= NIGHT_STARTS || t < MORNING;
}

function wakeAt(ctx: SimContext, character: Character, at: number): void {
  schedule(ctx.world.scheduler, at, { kind: 'character.wake', characterId: character.id });
}
