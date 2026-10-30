import { PASTIMES, type LocationKind } from '../../content';
import { schedule } from '../core/scheduler';
import { DAY, HOUR, nextTimeOfDay, timeOfDay } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Location, LocationId } from '../model';
import {
  convalescenceHours,
  expireStatuses,
  isDizzy,
  isFitToDelve,
  needsRecovery,
  recover,
  type RecoveryPlace,
} from './condition';
import { delveStep, enterDelve } from './delve';
import { findPath } from './roads';
import { finishLeg, startJourney, type TravelReason } from './travel';

/**
 * Phase 2 behavior: simple rules (ROADMAP.md Phase 2). Healthy adventurers go
 * delving; hurt ones go to town and rest; those carrying loot sell it. Sleep
 * at night. Phase 4 replaces these rules with utility AI.
 */

const NIGHT_STARTS = 21 * HOUR;
const MORNING = 6 * HOUR;
/** How long after dawn a character may lie in. */
const MAX_LIE_IN = 2 * HOUR;
export const INN_PRICE = 2;
const SELLING_TIME = HOUR;
/** Days spent in town after returning from a trip. */
const DAYS_HOME: readonly [number, number] = [2, 6];

/** Chance of a pastime in town rather than setting out. */
const TOWN_PASTIME_AFTER_ARRIVAL = 0.85;
const TOWN_PASTIME_AGAIN = 0.4;
/** Chance of delving on arrival at a dungeon, and again after a delve. */
const DELVE_ON_ARRIVAL = 0.9;
const DELVE_AGAIN = 0.35;
const WILDERNESS_PASTIME = 0.5;

/** Relative appeal of each kind of destination for a healthy adventurer. */
const DESTINATION_WEIGHT: Record<LocationKind, number> = { town: 1.5, dungeon: 4, wilderness: 1 };
const HOME_WEIGHT = 2;

/** Called when a character's scheduled wake-up comes due. */
export function wakeCharacter(ctx: SimContext, character: Character): void {
  const activity = character.activity;
  switch (activity.kind) {
    case 'dead':
    case 'fighting':
      return;
    case 'traveling':
      if (finishLeg(ctx, character)) decide(ctx, character, true);
      return;
    case 'delving':
      delveStep(ctx, character);
      return;
    case 'resting':
      recover(character, restPlace(ctx, character, activity.paid), activity.until - activity.since);
      break;
    case 'convalescing':
      recover(character, 'convalescing', activity.until - activity.since);
      break;
    case 'pastime':
      recover(
        character,
        locationOf(ctx, character).kind === 'town' ? 'town' : 'field',
        activity.until - activity.since,
      );
      break;
    case 'idle':
      break;
  }
  // A new day after a night's rest is a fresh start, as if just arrived.
  decide(ctx, character, activity.kind === 'resting');
}

function decide(ctx: SimContext, character: Character, justArrived: boolean): void {
  const location = locationOf(ctx, character);
  const rng = ctx.rng.behavior;
  const now = ctx.world.time;
  expireStatuses(character, now);

  if (isNight(now)) {
    rest(ctx, character, location);
    return;
  }

  switch (location.kind) {
    case 'town': {
      if (character.pack.length > 0) {
        sellLoot(ctx, character, location);
        return;
      }
      if (needsRecovery(character)) {
        convalesce(ctx, character, location);
        return;
      }
      const stayingHome = now < character.homeUntil;
      const pastimeChance = justArrived ? TOWN_PASTIME_AFTER_ARRIVAL : TOWN_PASTIME_AGAIN;
      if ((stayingHome || rng.chance(pastimeChance)) && startPastime(ctx, character, location)) {
        return;
      }
      break;
    }
    case 'dungeon': {
      if (isFitToDelve(character, now)) {
        const delveChance = justArrived ? DELVE_ON_ARRIVAL : DELVE_AGAIN;
        if (rng.chance(delveChance)) {
          enterDelve(ctx, character, location);
          return;
        }
      } else if (isDizzy(character, now) && !needsRecovery(character)) {
        // Only dizzy: wait outside for the head to clear, then go back in.
        if (startPastime(ctx, character, location)) return;
      }
      break;
    }
    case 'wilderness':
      if (!needsRecovery(character) && rng.chance(WILDERNESS_PASTIME)) {
        if (startPastime(ctx, character, location)) return;
      }
      break;
  }

  if (setOut(ctx, character, location)) return;

  // Nowhere to go and nothing to do: wait an hour and think again.
  character.activity = { kind: 'idle' };
  wakeAt(ctx, character, now + HOUR);
}

/** Picks where to go next: a town to heal, home to sell loot, or anywhere to adventure. */
function setOut(ctx: SimContext, character: Character, here: Location): boolean {
  let destination: LocationId | null;
  let reason: TravelReason;
  if (needsRecovery(character)) {
    destination = nearestTown(ctx, here.id);
    reason = 'heal';
  } else if (character.pack.length > 0) {
    destination = here.id === character.homeId ? nearestTown(ctx, here.id) : character.homeId;
    reason = 'home';
  } else {
    destination = chooseDestination(ctx, character, here);
    reason =
      destination && ctx.world.locations.get(destination)?.kind === 'dungeon' ? 'delve' : 'wander';
  }
  return destination !== null && destination !== here.id
    ? startJourney(ctx, character, destination, reason)
    : false;
}

function rest(ctx: SimContext, character: Character, location: Location): void {
  const paid = location.kind === 'town' && character.gold >= INN_PRICE;
  if (paid) character.gold -= INN_PRICE;
  const now = ctx.world.time;
  const until = nextTimeOfDay(now, MORNING) + ctx.rng.behavior.int(0, MAX_LIE_IN);
  character.activity = { kind: 'resting', since: now, until, paid };
  ctx.emit(
    {
      type: 'character.rest',
      data: { characterId: character.id, locationId: location.id, paid },
    },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, until);
}

function convalesce(ctx: SimContext, character: Character, location: Location): void {
  const now = ctx.world.time;
  const until = now + convalescenceHours(character) * HOUR;
  character.homeUntil = Math.max(
    character.homeUntil,
    until + ctx.rng.behavior.int(...DAYS_HOME) * DAY,
  );
  character.activity = { kind: 'convalescing', since: now, until };
  ctx.emit(
    { type: 'character.convalesce', data: { characterId: character.id, locationId: location.id } },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, until);
}

function sellLoot(ctx: SimContext, character: Character, location: Location): void {
  const items = character.pack;
  const gold = items.reduce((sum, item) => sum + item.value, 0);
  const now = ctx.world.time;
  character.pack = [];
  character.homeUntil = now + ctx.rng.behavior.int(...DAYS_HOME) * DAY;
  character.gold += gold;
  character.goldEarned += gold;
  ctx.emit(
    {
      type: 'trade.sell',
      data: { characterId: character.id, locationId: location.id, items, gold },
    },
    [character.id],
    location.id,
  );
  character.activity = {
    kind: 'pastime',
    pastime: 'market',
    since: now,
    until: now + SELLING_TIME,
  };
  wakeAt(ctx, character, now + SELLING_TIME);
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
  const now = ctx.world.time;

  character.activity = { kind: 'pastime', pastime: pastime.id, since: now, until: now + duration };
  ctx.emit(
    {
      type: 'character.pastime',
      data: { characterId: character.id, locationId: location.id, pastime: pastime.id },
    },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, now + duration);
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

/** The closest town by road, which may be `from` itself. */
function nearestTown(ctx: SimContext, from: LocationId): LocationId | null {
  let best: LocationId | null = null;
  let bestDuration = Infinity;
  for (const location of ctx.world.locations.values()) {
    if (location.kind !== 'town') continue;
    const duration = findPath(ctx.world, from, location.id)?.duration ?? Infinity;
    if (duration < bestDuration) {
      best = location.id;
      bestDuration = duration;
    }
  }
  return best;
}

function restPlace(ctx: SimContext, character: Character, paid: boolean): RecoveryPlace {
  return paid && locationOf(ctx, character).kind === 'town' ? 'inn' : 'rough';
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
