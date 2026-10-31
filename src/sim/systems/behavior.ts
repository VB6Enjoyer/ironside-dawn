import { PASTIMES, type PastimeId } from '../../content';
import { schedule } from '../core/scheduler';
import { HOUR, nextTimeOfDay, timeOfDay } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Goal, Location, Motive } from '../model';
import { convalescenceHours, expireStatuses, recover, type RecoveryPlace } from './condition';
import { decideAt, sellable, type Action } from './decide';
import { delveStep, enterDelve } from './delve';
import { weaponSkillOf } from './items';
import { learnSpells } from './magic';
import { markVisited, satisfy, updateDrives } from './mind';
import { practice } from './progress';
import { finishLeg, startJourney } from './travel';

/**
 * What characters do between fights (ROADMAP.md Phase 4). Sleep at night is a
 * rule; everything else is chosen by the utility AI in `decide.ts` and carried
 * out here.
 */

const NIGHT_STARTS = 21 * HOUR;
const MORNING = 6 * HOUR;
/** How long after dawn a character may lie in. */
const MAX_LIE_IN = 2 * HOUR;
export const INN_PRICE = 2;
const SELLING_TIME = HOUR;
const TRAINING_PER_HOUR = 0.25;
/** Training stops helping at this proficiency. */
const TRAINING_CAP = 45;
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
};

/** Called when a character's scheduled wake-up comes due. */
export function wakeCharacter(ctx: SimContext, character: Character): void {
  const activity = character.activity;
  switch (activity.kind) {
    case 'dead':
    case 'fighting':
      return;
    case 'traveling':
      if (finishLeg(ctx, character)) {
        markVisited(character, character.locationId!);
        decide(ctx, character);
      }
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

  const decision = decideAt(ctx, character, location);
  if (decision && act(ctx, character, location, decision.action, decision.why)) return;

  // Nowhere to go and nothing to do: wait an hour and think again.
  character.activity = { kind: 'idle' };
  character.goal = { kind: 'wait', locationId: location.id, why: [] };
  wakeAt(ctx, character, now + HOUR);
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
      character.goal = { kind: 'sell', locationId: location.id, why };
      sellLoot(ctx, character, location);
      return true;
    case 'convalesce':
      character.goal = { kind: 'heal', locationId: location.id, why };
      convalesce(ctx, character, location, why);
      return true;
    case 'pastime':
      character.goal = { kind: PASTIME_GOALS[action.pastime], locationId: location.id, why };
      return startPastime(ctx, character, location, action.pastime, why);
    case 'delve':
      character.goal = { kind: 'delve', locationId: location.id, why };
      enterDelve(ctx, character, location, why);
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
      character.goal = { kind, locationId: action.to, why };
      return startJourney(ctx, character, action.to, action.reason, why);
    }
  }
}

function rest(ctx: SimContext, character: Character, location: Location): void {
  const paid = location.kind === 'town' && character.gold >= INN_PRICE;
  if (paid) character.gold -= INN_PRICE;
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

function sellLoot(ctx: SimContext, character: Character, location: Location): void {
  const items = sellable(character);
  const gold = items.reduce((sum, item) => sum + item.value, 0);
  const now = ctx.world.time;
  character.pack = character.pack.filter((p) => !items.includes(p));
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
      const skill = weaponSkillOf(character.equipment.weapon);
      if (skill && character.skills[skill] < TRAINING_CAP) {
        practice(ctx, character, skill, TRAINING_PER_HOUR * hours, locationId);
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

function wakeAt(ctx: SimContext, character: Character, at: number): void {
  schedule(ctx.world.scheduler, at, { kind: 'character.wake', characterId: character.id });
}
