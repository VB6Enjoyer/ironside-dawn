import { PASTIMES, type PastimeId } from '../../content';
import { DAY, HOUR, nextTimeOfDay, timeOfDay } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Goal, Location, LocationId, Motive } from '../model';
import {
  convalescenceHours,
  expireStatuses,
  needsRecovery,
  recover,
  type RecoveryPlace,
} from './condition';
import { decideAt, type Action } from './decide';
import { DAILY_AT } from './ecology';
import { delveStep, enterDelve } from './delve';
import { weaponSkillOf } from './items';
import { townsfolkAt } from './lifecycle';
import { learnSpells } from './magic';
import { payHouse } from './market';
import { markVisited, satisfy, updateDrives } from './mind';
import { practice } from './progress';
import { confrontQuarry, isWantedIn } from './outlaws';
import { carouse, lodging, visitMarket } from './shopping';
import { followersOf, gatherParty, releaseFollowers, socialize } from './social';
import { bestOutlet, hasCargo, notePrices, planRun, setOut, staleTown, unload } from './merchants';
import { findPath } from './roads';
import { finishLeg, startJourney } from './travel';
import { wakeAt } from './wake';

/**
 * What characters do between fights (ROADMAP.md Phase 4). Sleep at night is a
 * rule; everything else is chosen by the utility AI in `decide.ts` and carried
 * out here.
 */

const NIGHT_STARTS = 21 * HOUR;
const MORNING = 6 * HOUR;
/** How long after dawn a character may lie in. */
const MAX_LIE_IN = 2 * HOUR;
const SELLING_TIME = HOUR;
/** An inn is only worth it with this many nights' money in the purse. */
const INN_RESERVE_NIGHTS = 20;
const TRAINING_PER_HOUR = 0.25;
/** Training stops helping at this proficiency. */
const TRAINING_CAP = 45;
/** How much further a weapons master in town can take training. */
const MASTER_EXTRA = 10;
/** Arcana per hour of study; the gifted learn twice as fast. */
const STUDY_PER_HOUR = 0.25;
/** Companionship eased per hour at a tavern. */
const COMPANY_PER_HOUR = 0.15;

const PASTIME_GOALS: Record<PastimeId, Goal['kind']> = {
  tavern: 'socialize',
  market: 'browse',
  training: 'train',
  shrine: 'pray',
  study: 'study',
  scout: 'wait',
  forage: 'forage',
  hunt: 'forage',
  lurk: 'lurk',
};

/** Called when a character's scheduled wake-up comes due. */
export function wakeCharacter(ctx: SimContext, character: Character): void {
  const activity = character.activity;
  switch (activity.kind) {
    case 'dead':
    case 'fighting':
    case 'accompanying':
      return;
    case 'traveling': {
      if (finishLeg(ctx, character) !== 'arrived') return;
      const here = locationOf(ctx, character);
      for (const c of [character, ...followersOf(ctx, character)]) markVisited(c, here.id);
      const goal = character.goal;
      if (goal?.kind === 'hunt' && goal.targetId) {
        const quarry = ctx.world.characters.get(goal.targetId);
        if (quarry && confrontQuarry(ctx, character, quarry, here)) return;
      }
      decide(ctx, character);
      return;
    }
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
      learnFromPastime(ctx, character, activity.pastime, activity.until - activity.since);
      break;
    case 'idle':
      break;
  }
  decide(ctx, character);
}

function decide(ctx: SimContext, character: Character): void {
  const location = locationOf(ctx, character);
  const now = ctx.world.time;
  expireStatuses(character, now);
  updateDrives(character, now);

  if (isNight(now)) {
    rest(ctx, character, location);
    return;
  }

  if (character.calling === 'merchant' && !character.outlaw) {
    if (trade(ctx, character, location)) return;
  } else {
    const decision = decideAt(ctx, character, location);
    if (decision && act(ctx, character, location, decision.action, decision.why)) return;
  }

  // Nowhere to go and nothing to do: wait an hour and think again.
  character.activity = { kind: 'idle' };
  character.goal = { kind: 'wait', locationId: location.id, why: [] };
  wakeAt(ctx, character, now + HOUR);
}

/**
 * A merchant's day: sell the cargo where it was bound, plan the next run and
 * load up, or go for news of prices; otherwise wait about the market.
 */
function trade(ctx: SimContext, character: Character, location: Location): boolean {
  const goal = character.goal;
  const bound = goal?.kind === 'trade' ? goal.locationId : null;
  if (location.kind !== 'town') {
    // Thrown off the road (robbed, or a fight): on to where they were going, or the nearest town.
    const to = bound ?? nearestTown(ctx, location);
    return to !== null && startJourney(ctx, character, to, 'trade', []);
  }
  if (needsRecovery(character)) {
    character.goal = { kind: 'heal', locationId: location.id, why: [] };
    convalesce(ctx, character, location, []);
    return true;
  }
  // Prices only change at the morning market: nothing new since they last looked, no new plan.
  const seen = character.priceBook[location.id]?.t ?? -Infinity;
  const fresh = seen < lastMarketDay(ctx.world.time);
  notePrices(ctx, character, location);
  if (hasCargo(character) && (bound === null || bound === location.id)) {
    unload(ctx, character, location);
    // The house here couldn't take it all: try somewhere else.
    const outlet = hasCargo(character) ? bestOutlet(ctx, character, location) : null;
    if (outlet) {
      character.goal = {
        kind: 'trade',
        locationId: outlet,
        why: [{ kind: 'profit' }],
      };
      return startJourney(ctx, character, outlet, 'trade', character.goal.why);
    }
  }
  if (hasCargo(character) && bound !== null && bound !== location.id) {
    return startJourney(ctx, character, bound, 'trade', goal!.why);
  }
  const plan = fresh || hasCargo(character) ? planRun(ctx, character, location) : null;
  if (plan && setOut(ctx, character, location, plan)) return true;
  const stale = hasCargo(character) || !fresh ? null : staleTown(ctx, character, location);
  if (stale) {
    character.goal = {
      kind: 'trade',
      locationId: stale,
      why: [{ kind: 'news', locationId: stale }],
    };
    return startJourney(ctx, character, stale, 'trade', character.goal.why);
  }
  if (!fresh) {
    // Nothing new until the morning market: wait for it.
    character.activity = { kind: 'idle' };
    character.goal = { kind: 'wait', locationId: location.id, why: [] };
    wakeAt(ctx, character, nextTimeOfDay(ctx.world.time, DAILY_AT) + ctx.rng.behavior.int(0, HOUR));
    return true;
  }
  // A look round the market, then the tavern for news from other merchants.
  character.goal = { kind: 'socialize', locationId: location.id, why: [] };
  const started = startPastime(ctx, character, location, 'tavern', []);
  if (started) {
    carouse(ctx, character, location);
    socialize(ctx, character, location);
  }
  return started;
}

/** When the markets last cleared. */
function lastMarketDay(now: number): number {
  return Math.floor((now - DAILY_AT) / DAY) * DAY + DAILY_AT;
}

function nearestTown(ctx: SimContext, from: Location): LocationId | null {
  let best: { id: LocationId; duration: number } | null = null;
  for (const market of ctx.world.markets.values()) {
    const path = findPath(ctx.world, from.id, market.townId);
    if (path && (!best || path.duration < best.duration))
      best = { id: market.townId, duration: path.duration };
  }
  return best?.id ?? null;
}

function act(
  ctx: SimContext,
  character: Character,
  location: Location,
  action: Action,
  why: readonly Motive[],
): boolean {
  switch (action.kind) {
    case 'sell':
      releaseFollowers(ctx, character);
      character.goal = { kind: 'sell', locationId: location.id, why };
      goToMarket(ctx, character, location);
      return true;
    case 'convalesce':
      releaseFollowers(ctx, character);
      character.goal = { kind: 'heal', locationId: location.id, why };
      convalesce(ctx, character, location, why);
      return true;
    case 'pastime': {
      releaseFollowers(ctx, character);
      character.goal = { kind: PASTIME_GOALS[action.pastime], locationId: location.id, why };
      const started = startPastime(ctx, character, location, action.pastime, why);
      if (started && action.pastime === 'tavern') {
        carouse(ctx, character, location);
        socialize(ctx, character, location);
      }
      return started;
    }
    case 'delve':
      character.goal = { kind: 'delve', locationId: location.id, why };
      enterDelve(ctx, character, location, why, gatherParty(ctx, character, location));
      return true;
    case 'travel': {
      const kind: Goal['kind'] =
        action.reason === 'delve'
          ? 'delve'
          : action.reason === 'heal'
            ? 'heal'
            : action.reason === 'home'
              ? 'home'
              : 'travel';
      character.goal = action.target
        ? { kind: 'hunt', locationId: action.to, why, targetId: action.target }
        : { kind, locationId: action.to, why };
      // The party comes along to delve or hunt; otherwise everyone goes their own way.
      const together = action.reason === 'delve' || action.reason === 'hunt';
      if (!together) releaseFollowers(ctx, character);
      const companions = together ? gatherParty(ctx, character, location) : [];
      return startJourney(ctx, character, action.to, action.reason, why, companions);
    }
  }
}

function rest(ctx: SimContext, character: Character, location: Location): void {
  releaseFollowers(ctx, character);
  // Wanted outlaws find every inn door shut.
  const market = ctx.world.markets.get(location.id);
  const price = lodging(ctx, location);
  // Nobody spends their last coins on a bed: they sleep rough instead.
  const paid =
    location.kind === 'town' &&
    character.gold >= price * INN_RESERVE_NIGHTS &&
    !isWantedIn(character, location.id);
  if (paid) {
    if (market) payHouse(market, character, price);
    else character.gold -= price;
  }
  const now = ctx.world.time;
  const until = nextTimeOfDay(now, MORNING) + ctx.rng.behavior.int(0, MAX_LIE_IN);
  character.activity = { kind: 'resting', since: now, until, paid };
  character.goal = { kind: 'rest', locationId: location.id, why: [] };
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

function convalesce(
  ctx: SimContext,
  character: Character,
  location: Location,
  why: readonly Motive[],
): void {
  const now = ctx.world.time;
  const until = now + convalescenceHours(character) * HOUR;
  character.activity = { kind: 'convalescing', since: now, until };
  ctx.emit(
    {
      type: 'character.convalesce',
      data: { characterId: character.id, locationId: location.id, why },
    },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, until);
}

function goToMarket(ctx: SimContext, character: Character, location: Location): void {
  visitMarket(ctx, character, location);
  const now = ctx.world.time;
  character.activity = {
    kind: 'pastime',
    pastime: 'market',
    since: now,
    until: now + SELLING_TIME,
  };
  wakeAt(ctx, character, now + SELLING_TIME);
}

function startPastime(
  ctx: SimContext,
  character: Character,
  location: Location,
  pastimeId: PastimeId,
  why: readonly Motive[],
): boolean {
  const pastime = PASTIMES.find((p) => p.id === pastimeId);
  if (!pastime) return false;
  const rng = ctx.rng.behavior;
  const duration = rng.int(
    Math.round(pastime.minHours * HOUR),
    Math.round(pastime.maxHours * HOUR),
  );
  const now = ctx.world.time;

  character.activity = { kind: 'pastime', pastime: pastime.id, since: now, until: now + duration };
  ctx.emit(
    {
      type: 'character.pastime',
      data: { characterId: character.id, locationId: location.id, pastime: pastime.id, why },
    },
    [character.id],
    location.id,
  );
  wakeAt(ctx, character, now + duration);
  return true;
}

/** Hours spent on a pastime ease drives and improve skills; study may teach a spell. */
function learnFromPastime(
  ctx: SimContext,
  character: Character,
  pastime: PastimeId,
  seconds: number,
): void {
  const hours = seconds / HOUR;
  const locationId = character.locationId!;
  switch (pastime) {
    case 'tavern':
      satisfy(character, 'companionship', COMPANY_PER_HOUR * hours);
      return;
    case 'training': {
      // Sparring teaches the basics; mastery only comes from real fights.
      // A retired master in town teaches faster, and further.
      const master = townsfolkAt(ctx, locationId, 'trainer') > 0;
      const skill = weaponSkillOf(character.equipment.weapon);
      if (skill && character.skills[skill] < TRAINING_CAP + (master ? MASTER_EXTRA : 0)) {
        practice(ctx, character, skill, TRAINING_PER_HOUR * hours * (master ? 1.5 : 1), locationId);
      }
      return;
    }
    case 'study': {
      const rate = STUDY_PER_HOUR * (character.gifted ? 2 : 1);
      practice(ctx, character, 'arcana', rate * hours, locationId);
      learnSpells(ctx, character, locationId);
      return;
    }
    default:
      return;
  }
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
