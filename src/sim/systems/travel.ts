import type { SimContext } from '../context';
import type { Character, EventOfType, LocationId, Motive } from '../model';
import { ambush } from './outlaws';
import { findPath, roadsFrom } from './roads';
import { followersOf } from './social';
import { wakeAt } from './wake';
import { moveTo } from './whereabouts';

export type TravelReason = EventOfType<'travel.depart'>['data']['reason'];

/** How much a single leg's duration varies around the road's typical time. */
const LEG_DURATION_SD = 0.12;
const LEG_DURATION_MIN = 0.75;
const LEG_DURATION_MAX = 1.4;

/** Sets out for `destinationId`. Returns false if there is no way there. */
export function startJourney(
  ctx: SimContext,
  character: Character,
  destinationId: LocationId,
  reason: TravelReason,
  why: readonly Motive[] = [],
  companions: readonly Character[] = [],
): boolean {
  const fromId = character.locationId;
  if (fromId === null) throw new Error(`${character.id} cannot depart while on the road`);

  const path = findPath(ctx.world, fromId, destinationId);
  const [firstStop, ...remaining] = path?.stops ?? [];
  if (!path || firstStop === undefined) return false;

  ctx.emit(
    {
      type: 'travel.depart',
      data: {
        characterId: character.id,
        fromId,
        destinationId,
        expectedDuration: path.duration,
        reason,
        why,
        companions: companions.map((c) => c.id),
      },
    },
    [character.id, ...companions.map((c) => c.id)],
    fromId,
  );
  beginLeg(ctx, character, fromId, firstStop, destinationId, remaining);
  return true;
}

/**
 * Ends the current leg: the character (and any companions) reach its end. They
 * have `arrived`, are `passing` through on the way, or were `ambushed` there.
 */
export function finishLeg(
  ctx: SimContext,
  character: Character,
): 'arrived' | 'passing' | 'ambushed' {
  const activity = character.activity;
  if (activity.kind !== 'traveling') throw new Error(`${character.id} is not traveling`);

  const here = activity.leg.to;
  const companions = followersOf(ctx, character);
  for (const c of [character, ...companions]) moveTo(ctx.world, c, here);
  if (ambush(ctx, character, ctx.world.locations.get(here)!)) return 'ambushed';

  const [nextStop, ...remaining] = activity.remaining;
  if (nextStop === undefined) {
    character.activity = { kind: 'idle' };
    ctx.emit(
      { type: 'travel.arrive', data: { characterId: character.id, locationId: here } },
      [character.id, ...companions.map((c) => c.id)],
      here,
    );
    return 'arrived';
  }

  ctx.emit(
    {
      type: 'travel.pass',
      data: {
        characterId: character.id,
        locationId: here,
        destinationId: activity.destinationId,
      },
    },
    [character.id],
    here,
  );
  beginLeg(ctx, character, here, nextStop, activity.destinationId, remaining);
  return 'passing';
}

function beginLeg(
  ctx: SimContext,
  character: Character,
  from: LocationId,
  to: LocationId,
  destinationId: LocationId,
  remaining: readonly LocationId[],
): void {
  const link = roadsFrom(ctx.world, from).find((road) => road.to === to);
  if (!link) throw new Error(`No road from ${from} to ${to}`);

  const factor = Math.min(
    LEG_DURATION_MAX,
    Math.max(LEG_DURATION_MIN, ctx.rng.travel.gaussian(1, LEG_DURATION_SD)),
  );
  const departedAt = ctx.world.time;
  const arrivesAt = departedAt + Math.round(link.route.duration * factor);

  for (const c of [character, ...followersOf(ctx, character)]) moveTo(ctx.world, c, null);
  character.activity = {
    kind: 'traveling',
    destinationId,
    leg: { from, to, departedAt, arrivesAt },
    remaining,
  };
  wakeAt(ctx, character, arrivesAt);
}
