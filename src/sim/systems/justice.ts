import type { WeaponId } from '../../content';
import { DAY, MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type {
  Bounty,
  Character,
  CharacterId,
  Charges,
  ExecutionMethod,
  Location,
  LocationId,
} from '../model';
import { isAlive, modifier } from './condition';
import { carriedGear, starterWeapon } from './items';
import { die } from './death';
import { burn } from './ledger';
import { retire } from './lifecycle';
import { isBarred, isKnownIn, isShunned, settle } from './notoriety';
import { refreshMaxima } from './progress';
import { findPath } from './roads';
import { followersOf, leaveParty, partyOf } from './social';
import { cancelWake, wakeAt } from './wake';
import { moveTo } from './whereabouts';

/**
 * The ways out of the outlaw life (0.3.0, ROADMAP.md "The Outlaws Update",
 * steps 5 to 7): paying back what was taken, a head carried to a town that
 * knows the bounty on it, or being taken alive, escorted to town and jailed.
 */

// ---------------------------------------------------------------------------
// Restitution

/** Interest on what was taken, and the fine on top, as shares of it. */
const INTEREST = 0.25;
const FINE = 0.25;
/** The least fine a town asks of anyone it knows did wrong there. */
const MIN_FINE = 10;
/** Daily chance an outlaw weary of the life, in a town with a court, pays up. */
const REFORM_CHANCE = 0.01;
/** Days without a crime that make the life feel like it isn't paying. */
const QUIET_DAYS = 180;
/** Nobody gives up the life before a year of it. */
const FIRST_YEAR = 360;
/** Honor below which nobody pays back what they could keep. */
const MIN_HONOR = 0.15;
/** A bounty this large makes anyone think twice. */
const HEAVY_BOUNTY = 150;

/**
 * What it would cost to clear someone's name: each known crime's take paid
 * back once, to the town it was against, with interest, and a fine in every
 * town that knows of their crimes.
 */
export function restitutionBill(character: Character): {
  readonly total: number;
  readonly byTown: readonly (readonly [LocationId, number])[];
} {
  const owed = new Map<LocationId, number>();
  const since = character.pardonedAt ?? -Infinity;
  for (const crime of character.crimes) {
    if (!crime.known || crime.foiled || crime.at <= since || crime.townId === null) continue;
    owed.set(crime.townId, (owed.get(crime.townId) ?? 0) + crime.value);
  }
  for (const id of Object.keys(character.notoriety) as LocationId[]) {
    if ((character.notoriety[id]?.heat ?? 0) > 0 && !owed.has(id)) owed.set(id, 0);
  }
  const byTown: [LocationId, number][] = [];
  let total = 0;
  for (const [id, value] of owed) {
    const bill = Math.ceil(value * (1 + INTEREST) + Math.max(MIN_FINE, value * FINE));
    byTown.push([id, bill]);
    total += bill;
  }
  return { total, byTown };
}

/** Whether someone has blood on their hands, as far as anyone knows or their own record says. */
function hasBlood(character: Character): boolean {
  if ((character.outlaw?.murders ?? 0) > 0) return true;
  for (const known of Object.values(character.notoriety))
    if ((known?.murders ?? 0) > 0) return true;
  return false;
}

/**
 * Once a day, for an outlaw in a town: one without blood on their hands who
 * has tired of the life (it hasn't paid lately, doors are shutting, the price
 * on their head is heavy) may go to the court and pay back what they took,
 * with interest and a fine. Their name is cleared and the bounty lifted, but
 * the towns still eye them until they have earned their trust back.
 * Returns whether they did.
 */
export function considerRestitution(ctx: SimContext, character: Character): boolean {
  const record = character.outlaw;
  const here = character.locationId ? ctx.world.locations.get(character.locationId) : undefined;
  if (!record || here?.kind !== 'town' || isBarred(character, here.id) || hasBlood(character)) {
    return false;
  }
  const now = ctx.world.time;
  const towns = Object.keys(character.notoriety) as LocationId[];
  const shunned = towns.filter((id) => isShunned(character, id)).length;
  const bounty = ctx.world.bounties.get(character.id)?.amount ?? 0;
  const tired =
    now - record.lastCrimeAt > QUIET_DAYS * DAY ||
    (towns.length > 0 && shunned / towns.length >= 0.5) ||
    bounty >= HEAVY_BOUNTY;
  // Only someone with a little honor left would pay back what they could keep, and not at once.
  if (character.traits.honor < MIN_HONOR || now - record.since < FIRST_YEAR * DAY) return false;
  const chance = REFORM_CHANCE * character.traits.honor * (tired ? 1 : 0.05);
  const bill = restitutionBill(character);
  if (character.gold < bill.total || !ctx.rng.outlaws.chance(chance)) return false;

  for (const [townId, owed] of bill.byTown) {
    const market = ctx.world.markets.get(townId);
    character.gold -= owed;
    if (market) market.house.gold += owed;
    else burn(ctx.world, 'upkeep', owed);
    settle(character, townId);
  }
  character.outlaw = null;
  character.pardonedAt = now;
  character.justice.push({ kind: 'reformed', at: now, townId: here.id, paid: bill.total });
  ctx.world.bounties.delete(character.id);
  if (character.partyId) leaveParty(ctx, character, 'outlaw');
  ctx.emit(
    {
      type: 'outlaw.reform',
      data: { characterId: character.id, locationId: here.id, paid: bill.total },
    },
    [character.id],
    here.id,
  );
  return true;
}

// ---------------------------------------------------------------------------
// The long road's end (step 9): a posse for the worst, flight for the hunted

/** A bounty this big, or a quarry this strong, calls for a posse. */
const POSSE_BOUNTY = 200;

/** Whether hunters after this outlaw would raise a posse first. */
export function needsPosse(ctx: SimContext, outlaw: Character): boolean {
  return (ctx.world.bounties.get(outlaw.id)?.amount ?? 0) >= POSSE_BOUNTY;
}

/** Road hours within which a fresh trail can be followed. */
const TRAIL_HOURS = 16;

/**
 * Hunters reach where their quarry was last seen, and find them gone: if the
 * quarry is somewhere near, at rest, a hunter may pick up the trail, likelier
 * the sharper their eye. Returns where it leads, or null.
 */
export function trailOf(
  ctx: SimContext,
  hunter: Character,
  quarry: Character,
  here: Location,
): LocationId | null {
  const there = quarry.locationId;
  if (!there || there === here.id || !isAlive(quarry) || isHeld(quarry) || !quarry.outlaw) {
    return null;
  }
  const path = findPath(ctx.world, here.id, there);
  if (!path || path.duration > TRAIL_HOURS * 3600) return null;
  const chance = 0.25 + hunter.skills.awareness / 200;
  return ctx.rng.outlaws.chance(chance) ? there : null;
}

/** Years an outlaw runs before the long road starts to tell. */
const WEARY_YEARS = 2;
/** Daily chance per year past that, for one every town has shut out, of fleeing the land. */
const FLEE_CHANCE = 0.001;

/**
 * An outlaw long on the road, whom the towns have shut out (or a murderer,
 * who can buy no pardon), may flee for distant lands with a price on their
 * head, never to be seen here again. One whom nobody knows of may simply
 * stop. Returns whether they did either.
 */
export function considerFleeing(ctx: SimContext, character: Character): boolean {
  const record = character.outlaw;
  if (!record || !character.locationId || character.activity.kind === 'fighting') return false;
  const years = (ctx.world.time - record.since) / (YEAR_DAYS * DAY);
  if (years < WEARY_YEARS) return false;
  const towns = Object.keys(character.notoriety) as LocationId[];
  const weary = years - WEARY_YEARS + 1;
  // Nobody knows them: they can simply stop, and live on as if nothing had happened.
  const unknown = towns.every((id) => (character.notoriety[id]?.heat ?? 0) <= 0);
  if (unknown) {
    if (!ctx.rng.outlaws.chance(FLEE_CHANCE * weary)) return false;
    const here = character.locationId;
    character.outlaw = null;
    character.pardonedAt = ctx.world.time;
    character.justice.push({ kind: 'reformed', at: ctx.world.time, townId: here, paid: 0 });
    if (character.partyId) leaveParty(ctx, character, 'outlaw');
    ctx.emit(
      { type: 'outlaw.reform', data: { characterId: character.id, locationId: here, paid: 0 } },
      [character.id],
      here,
    );
    return true;
  }
  const shut = towns.filter((id) => isShunned(character, id)).length / towns.length;
  const blood = hasBlood(character) ? 2 : 1;
  const chance = FLEE_CHANCE * weary * shut * blood;
  if (!ctx.rng.outlaws.chance(chance)) return false;
  die(ctx, character, { kind: 'departed', fled: true });
  return true;
}

// ---------------------------------------------------------------------------
// Bounties: paid in town, split with the party

/** Days a head keeps before it is past proving whose it was. */
const HEAD_DAYS = 90;
/** A live capture pays this many times the bounty. */
const ALIVE = 2.5;

/**
 * Pays a bounty to the one who brings it in, split evenly with their party
 * there. The posting town's trading house pays as much as it can, the town
 * where it is claimed the rest. Returns the shares paid.
 */
function payBounty(
  ctx: SimContext,
  bounty: Bounty,
  amount: number,
  claimant: Character,
  town: Location,
): { characterId: CharacterId; gold: number }[] {
  const world = ctx.world;
  let owed = amount;
  for (const id of [bounty.townId, town.id]) {
    const market = world.markets.get(id);
    if (!market || owed <= 0) continue;
    const paid = Math.min(owed, Math.floor(market.house.gold));
    market.house.gold -= paid;
    owed -= paid;
  }
  const paid = amount - owed;
  const party = partyOf(ctx, claimant);
  const sharers = [
    claimant,
    ...(party?.members ?? [])
      .filter((id) => id !== claimant.id)
      .map((id) => world.characters.get(id)!)
      .filter((c) => isAlive(c) && c.locationId === town.id),
  ];
  const each = Math.floor(paid / sharers.length);
  return sharers.map((c, i) => {
    // The odd coins go to whoever brought it in.
    const gold = i === 0 ? paid - each * (sharers.length - 1) : each;
    c.gold += gold;
    c.goldEarned += gold;
    c.reputation[town.id] = Math.min(1, (c.reputation[town.id] ?? 0) + 0.3);
    return { characterId: c.id, gold };
  });
}

/** The outlaw's killer takes their head, to claim the bounty in a town that knows it. */
export function takeHead(
  ctx: SimContext,
  killer: Character,
  outlaw: Character,
  locationId: LocationId,
): void {
  // Only those who could walk into a town and claim it bother: not the dread, not a lord.
  if (!ctx.world.bounties.has(outlaw.id)) return;
  if (killer.calling !== 'adventurer' && killer.calling !== 'merchant') return;
  killer.heads.push({ outlawId: outlaw.id, takenAt: ctx.world.time });
  outlaw.justice.push({ kind: 'head', at: ctx.world.time, locationId, byId: killer.id });
  ctx.emit(
    { type: 'bounty.head', data: { characterId: killer.id, locationId, outlawId: outlaw.id } },
    [killer.id, outlaw.id],
    locationId,
  );
}

/** Whether a town would pay for this outlaw: it has heard of them, and the bounty stands. */
function paysFor(ctx: SimContext, outlaw: Character | undefined, town: Location): boolean {
  return (
    Boolean(outlaw) &&
    town.kind === 'town' &&
    ctx.world.bounties.has(outlaw!.id) &&
    isKnownIn(outlaw!, town.id)
  );
}

/** In a town that knows the bounty, heads carried are handed in and paid for. */
export function claimHeads(ctx: SimContext, character: Character, town: Location): void {
  if (character.heads.length === 0 || town.kind !== 'town') return;
  const world = ctx.world;
  character.heads = character.heads.filter((head) => {
    const outlaw = world.characters.get(head.outlawId);
    if (!world.bounties.has(head.outlawId)) return false;
    if (!paysFor(ctx, outlaw, town)) return true;
    const bounty = world.bounties.get(head.outlawId)!;
    const shares = payBounty(ctx, bounty, bounty.amount, character, town);
    world.bounties.delete(head.outlawId);
    world.tally.bountiesClaimed++;
    outlaw?.justice.push({
      kind: 'claimed',
      at: world.time,
      townId: town.id,
      byId: character.id,
      amount: bounty.amount,
    });
    ctx.emit(
      {
        type: 'bounty.claim',
        data: {
          characterId: character.id,
          locationId: town.id,
          outlawId: head.outlawId,
          amount: bounty.amount,
          shares,
        },
      },
      [...shares.map((s) => s.characterId), head.outlawId],
      town.id,
    );
    return false;
  });
}

/** Once a day: prisoners may die behind bars; heads carried too long are past proving, and their bounties lapse. */
export function justiceDay(ctx: SimContext): void {
  const now = ctx.world.time;
  for (const c of ctx.world.characters.values()) {
    if (!isAlive(c)) continue;
    if (c.activity.kind === 'jailed') prisonDay(ctx, c);
    if (c.heads.length === 0) continue;
    c.heads = c.heads.filter((head) => {
      if (now - head.takenAt < HEAD_DAYS * DAY) return true;
      loseHead(ctx, c, head.outlawId);
      return false;
    });
  }
}

function loseHead(ctx: SimContext, carrier: Character, outlawId: CharacterId): void {
  if (!ctx.world.bounties.delete(outlawId)) return;
  const locationId = carrier.locationId ?? carrier.death?.locationId ?? carrier.homeId;
  ctx.world.characters.get(outlawId)?.justice.push({ kind: 'lost', at: ctx.world.time });
  ctx.emit(
    { type: 'bounty.lost', data: { characterId: carrier.id, locationId, outlawId } },
    [carrier.id, outlawId],
    locationId,
  );
}

/**
 * Where someone carrying a head or leading a captive is bound: towns that
 * would pay, by how near. Used to weigh the road.
 */
export function bountyTowns(ctx: SimContext, character: Character): Set<LocationId> {
  const towns = new Set<LocationId>();
  const wanted = [
    ...character.heads.map((h) => h.outlawId),
    ...(character.escorting ? [character.escorting] : []),
  ];
  if (wanted.length === 0) return towns;
  for (const town of ctx.world.locations.values()) {
    if (town.kind !== 'town' || isBarred(character, town.id)) continue;
    if (wanted.some((id) => paysFor(ctx, ctx.world.characters.get(id), town))) towns.add(town.id);
  }
  return towns;
}

// ---------------------------------------------------------------------------
// Taken alive

/** Hunters try a takedown on an outlaw this badly hurt. */
export const TAKEDOWN_BELOW = 0.25;
/** Skill (stealth and awareness together) it takes to lay a trap worth the name. */
const TRAPPER = 35;
/** Even a trapper finds the ground right for a trap only so often. */
const TRAP_CHANCE = 0.4;

/** Whether a hunter would rather take this outlaw alive: the honorable and the greedy. */
export function wantsAlive(ctx: SimContext, hunter: Character, outlaw: Character): boolean {
  if (hunter.escorting || !ctx.world.bounties.has(outlaw.id)) return false;
  const revenge = (hunter.opinions[outlaw.id]?.affinity ?? 0) <= -0.5;
  const will = 0.1 + 0.3 * hunter.traits.honor + 0.2 * hunter.traits.greed - (revenge ? 0.3 : 0);
  return ctx.rng.outlaws.chance(Math.max(0, will));
}

/**
 * Hunters reach their quarry: one with the craft may lay a trap rather than
 * attack, quiet feet and a sharp eye against the outlaw's. Caught, the outlaw
 * is taken alive; a trap sprung wrong warns them, and they slip away.
 * Returns whether a trap was laid (and so no fight starts).
 */
export function layTrap(
  ctx: SimContext,
  hunters: readonly Character[],
  quarry: Character,
  location: Location,
): boolean {
  const hunter = hunters[0]!;
  const craft = 0.5 * hunter.skills.stealth + 0.5 * hunter.skills.awareness;
  if (craft < TRAPPER || !ctx.rng.outlaws.chance(TRAP_CHANCE)) return false;
  if (!wantsAlive(ctx, hunter, quarry)) return false;
  const edge = craft - quarry.skills.awareness + 5 * (hunters.length - 1);
  const success = ctx.rng.outlaws.chance(1 / (1 + Math.exp(-edge / 12)));
  ctx.emit(
    {
      type: 'capture.attempt',
      data: {
        characterId: hunter.id,
        locationId: location.id,
        outlawId: quarry.id,
        how: 'trap',
        success,
      },
    },
    [hunter.id, quarry.id],
    location.id,
  );
  if (success) {
    capture(ctx, quarry, hunters, location, 'trap');
  } else {
    // Warned, they are gone before the hunters can close in.
    quarry.activity = { kind: 'idle' };
    wakeAt(ctx, quarry, ctx.world.time + MINUTE);
  }
  // The hunters decide what next: lead the captive away, or take up the trail again.
  hunter.activity = { kind: 'idle' };
  wakeAt(ctx, hunter, ctx.world.time + MINUTE);
  return true;
}

/** The odds of a takedown: the hunter's level and strength against the outlaw's level and quickness. */
export function takedownChance(hunter: Character, outlaw: Character, allies: number): number {
  const edge =
    0.04 * (hunter.level - outlaw.level) +
    0.05 * (modifier(hunter, 'might') - modifier(outlaw, 'agility')) +
    0.1 * allies;
  return Math.min(0.85, Math.max(0.1, 0.45 + edge));
}

/**
 * An outlaw is taken alive by the hunters: their purse and gear are taken off
 * them, a poor blade left in their hand, and the hunters' leader leads them
 * away under guard.
 */
export function capture(
  ctx: SimContext,
  captive: Character,
  captors: readonly Character[],
  location: Location,
  how: 'trap' | 'takedown' = 'takedown',
): void {
  const leader = captors.find((c) => isAlive(c) && !c.escorting);
  if (!leader) return;
  if (captive.partyId) leaveParty(ctx, captive, 'captured');
  const seized = Math.floor(captive.gold * 0.8);
  captive.gold -= seized;
  // Their gear goes to the captors, legends aside, which nobody dares claim.
  for (const item of carriedGear(captive)) {
    if (ctx.world.legends.has(item.id)) continue;
    leader.pack.push({ gear: item, value: item.value });
  }
  const weapon = captive.equipment.weapon;
  captive.equipment = {
    weapon: ctx.world.legends.has(weapon.id)
      ? weapon
      : starterWeapon(ctx, ctx.rng.items, weapon.base as WeaponId),
    armor:
      captive.equipment.armor && ctx.world.legends.has(captive.equipment.armor.id)
        ? captive.equipment.armor
        : null,
    trinket:
      captive.equipment.trinket && ctx.world.legends.has(captive.equipment.trinket.id)
        ? captive.equipment.trinket
        : null,
  };
  captive.pack = captive.pack.filter((p) => 'gear' in p && ctx.world.legends.has(p.gear.id));
  refreshMaxima(captive);
  captive.captive = { captorId: leader.id, since: ctx.world.time, gold: seized };
  captive.justice.push({
    kind: 'captured',
    at: ctx.world.time,
    locationId: location.id,
    byId: leader.id,
    how,
  });
  leader.escorting = captive.id;
  cancelWake(captive);
  moveTo(ctx.world, captive, location.id);
  captive.activity = { kind: 'accompanying', leaderId: leader.id };
}

/** The captive someone leads, if any. */
export function captiveOf(ctx: SimContext, leader: Character): Character | null {
  if (!leader.escorting) return null;
  const captive = ctx.world.characters.get(leader.escorting);
  if (!captive?.captive || captive.captive.captorId !== leader.id || !isAlive(captive)) {
    delete leader.escorting;
    return null;
  }
  return captive;
}

/**
 * On a stretch of road a captive may try to get away: better at a higher level
 * and quicker on their feet, worse against a bigger, stronger escort. One who
 * gets away leaves their gold and gear with the captors. Returns whether they did.
 */
export function tryEscape(ctx: SimContext, leader: Character, place: Location): boolean {
  const captive = captiveOf(ctx, leader);
  if (!captive) return false;
  const escort = [leader, ...followersOf(ctx, leader)];
  const guard = escort.reduce((s, c) => s + c.level, 0) / escort.length;
  const chance = Math.min(
    0.35,
    Math.max(
      0.01,
      0.06 +
        0.015 * (captive.level - guard) +
        0.03 * modifier(captive, 'agility') -
        0.03 * (escort.length - 1),
    ),
  );
  if (!ctx.rng.outlaws.chance(chance)) return false;
  leader.gold += captive.captive!.gold;
  free(ctx, captive, place.id);
  captive.justice.push({
    kind: 'escaped',
    at: ctx.world.time,
    locationId: place.id,
    fromId: leader.id,
  });
  ctx.emit(
    {
      type: 'capture.escape',
      data: { characterId: captive.id, locationId: place.id, captorId: leader.id },
    },
    [captive.id, leader.id],
    place.id,
  );
  return true;
}

/** A captive no longer held, where they are. */
function free(ctx: SimContext, captive: Character, locationId: LocationId): void {
  const captor = captive.captive && ctx.world.characters.get(captive.captive.captorId);
  if (captor?.escorting === captive.id) delete captor.escorting;
  delete captive.captive;
  moveTo(ctx.world, captive, locationId);
  captive.activity = { kind: 'idle' };
  wakeAt(ctx, captive, ctx.world.time + MINUTE);
}

// ---------------------------------------------------------------------------
// Justice (step 8): tried on what is known, jailed for years or hanged

/** Years in prison: one, and more for each known crime and the worth taken; never more than fifteen. */
const PRISON_YEARS = 1;
const YEARS_PER_CRIME = 0.25;
const YEARS_PER_GOLD = 1 / 500;
const MOST_YEARS = 15;
/** Days from a death sentence to the hanging. */
const GALLOWS_DAYS = [3, 10] as const;
/** Yearly chance of dying behind bars, from fever, cold and knives, before age is counted. */
const PRISON_DEATH = 0.03;
const YEAR_DAYS = 360;

/**
 * What a court can learn of someone: the most any town has heard of their
 * crimes, murders and what they took. Crimes nobody pinned on them don't count.
 */
export function knownRecord(character: Character): {
  crimes: number;
  murders: number;
  value: number;
} {
  const record = { crimes: 0, murders: 0, value: 0 };
  for (const known of Object.values(character.notoriety)) {
    if (!known) continue;
    record.crimes = Math.max(record.crimes, known.crimes);
    record.murders = Math.max(record.murders, known.murders);
    record.value = Math.max(record.value, known.value);
  }
  return record;
}

/**
 * The escort's day: in a town that would pay, the captive is handed over
 * (the bounty paid many times over, split with the party; the purse taken
 * off them goes to the town, and they go to jail). Otherwise they set out
 * for the nearest town that would. Returns whether they set out.
 */
export function escort(
  ctx: SimContext,
  leader: Character,
  here: Location,
  setOut: (to: LocationId) => boolean,
): boolean {
  const captive = captiveOf(ctx, leader);
  if (!captive) return false;
  const world = ctx.world;
  if (paysFor(ctx, captive, here)) {
    deliver(ctx, leader, captive, here);
    return false;
  }
  // Nowhere pays for them any more (the bounty lapsed): a town will still lock them up.
  const towns = bountyTowns(ctx, leader);
  let best: { id: LocationId; duration: number } | null = null;
  for (const town of world.locations.values()) {
    if (town.kind !== 'town' || town.id === here.id || isBarred(leader, town.id)) continue;
    if (towns.size > 0 && !towns.has(town.id)) continue;
    const path = findPath(world, here.id, town.id);
    if (path && (!best || path.duration < best.duration)) {
      best = { id: town.id, duration: path.duration };
    }
  }
  if (!best) {
    if (here.kind === 'town') deliver(ctx, leader, captive, here);
    return false;
  }
  return setOut(best.id);
}

function deliver(ctx: SimContext, leader: Character, captive: Character, town: Location): void {
  const world = ctx.world;
  const bounty = world.bounties.get(captive.id);
  if (bounty) {
    const amount = Math.round(bounty.amount * ALIVE);
    const shares = payBounty(ctx, bounty, amount, leader, town);
    world.bounties.delete(captive.id);
    world.tally.bountiesClaimed++;
    captive.justice.push({
      kind: 'delivered',
      at: world.time,
      townId: town.id,
      byId: leader.id,
      amount,
    });
    ctx.emit(
      {
        type: 'bounty.claim',
        data: {
          characterId: leader.id,
          locationId: town.id,
          outlawId: captive.id,
          amount,
          alive: true,
          shares,
        },
      },
      [...shares.map((s) => s.characterId), captive.id],
      town.id,
    );
  }
  const market = world.markets.get(town.id);
  if (market) market.house.gold += captive.captive?.gold ?? 0;
  delete leader.escorting;
  delete captive.captive;
  moveTo(world, captive, town.id);
  sentence(ctx, captive, town);
}

/**
 * How a town puts murderers to death, by its culture: the noose by default,
 * the sword in the islands, the axe in the north, arrows among the elves, the
 * chasm under the mountains, stones on the steppe.
 */
const EXECUTIONS: Partial<Record<string, ExecutionMethod>> = {
  generic: 'hanging',
  japonic: 'beheading',
  norse: 'axe',
  sylvan: 'arrows',
  deephold: 'chasm',
  steppe: 'stoning',
};

export function executionMethod(town: Location): ExecutionMethod {
  return EXECUTIONS[town.culture] ?? 'hanging';
}

/**
 * What a court charges someone with: their known crimes, by kind. Murders
 * pinned on them after the fact count; what nobody pinned doesn't.
 */
export function chargesOf(character: Character): Charges {
  const charges: Charges = {};
  for (const crime of character.crimes) {
    // Attempts count as much as crimes that came off.
    if (!crime.known) continue;
    charges[crime.kind] = (charges[crime.kind] ?? 0) + 1;
  }
  // Murders known in some town but fallen off the record still count.
  const murders = knownRecord(character).murders;
  if (murders > (charges.murder ?? 0)) charges.murder = murders;
  return charges;
}

/**
 * The town tries them on what is known of them: a known murderer hangs on a
 * set day; anyone else goes to prison for years, more for a longer record and
 * more taken.
 */
export function sentence(ctx: SimContext, prisoner: Character, town: Location): void {
  const now = ctx.world.time;
  const known = knownRecord(prisoner);
  const death = known.murders > 0;
  const days = death
    ? ctx.rng.outlaws.int(...GALLOWS_DAYS)
    : Math.round(
        Math.min(
          MOST_YEARS,
          PRISON_YEARS + YEARS_PER_CRIME * known.crimes + YEARS_PER_GOLD * known.value,
        ) * YEAR_DAYS,
      );
  const until = now + days * DAY;
  const charges = chargesOf(prisoner);
  const method = death ? executionMethod(town) : undefined;
  prisoner.activity = { kind: 'jailed', since: now, until, sentence: death ? 'death' : 'prison' };
  prisoner.justice.push({
    kind: 'sentenced',
    at: now,
    townId: town.id,
    sentence: death ? 'death' : 'prison',
    until,
    charges,
    ...(method ? { method } : {}),
  });
  wakeAt(ctx, prisoner, until);
  ctx.emit(
    {
      type: 'outlaw.sentenced',
      data: {
        characterId: prisoner.id,
        locationId: town.id,
        sentence: death ? 'death' : 'prison',
        until,
        crimes: known.crimes,
        murders: known.murders,
        charges,
        ...(method ? { method } : {}),
      },
    },
    [prisoner.id],
    town.id,
  );
}

/**
 * A prisoner's day comes: the condemned hang; the rest walk out, no outlaws
 * now, with a dent in their standing that fades. Some go back to the road;
 * the old, the broken and the long-jailed settle down instead.
 */
export function release(ctx: SimContext, prisoner: Character): void {
  const activity = prisoner.activity;
  if (activity.kind !== 'jailed') return;
  const town = ctx.world.locations.get(prisoner.locationId ?? prisoner.homeId)!;
  if (activity.sentence === 'death') {
    die(ctx, prisoner, { kind: 'executed', method: executionMethod(town) });
    return;
  }
  prisoner.outlaw = null;
  prisoner.pardonedAt = ctx.world.time;
  prisoner.justice.push({ kind: 'freed', at: ctx.world.time, townId: town.id });
  for (const id of Object.keys(prisoner.notoriety) as LocationId[]) settle(prisoner, id);
  prisoner.activity = { kind: 'idle' };
  ctx.emit(
    { type: 'outlaw.freed', data: { characterId: prisoner.id, locationId: town.id } },
    [prisoner.id],
    town.id,
  );
  const years = (ctx.world.time - activity.since) / (YEAR_DAYS * DAY);
  const age = (ctx.world.time - prisoner.born) / (YEAR_DAYS * DAY);
  const settleDown =
    0.15 + 0.06 * years + (1 - prisoner.traits.bravery) * 0.3 + (age > 50 ? 0.3 : 0);
  if (prisoner.calling === 'adventurer' && ctx.rng.outlaws.chance(Math.min(0.9, settleDown))) {
    retire(ctx, prisoner, town, 'prison', false);
  }
}

/** Once a day, behind bars: some prisoners don't live to see their release. */
function prisonDay(ctx: SimContext, prisoner: Character): void {
  const activity = prisoner.activity;
  if (activity.kind !== 'jailed' || activity.sentence !== 'prison') return;
  if (ctx.rng.outlaws.chance(PRISON_DEATH / YEAR_DAYS)) die(ctx, prisoner, { kind: 'prison' });
}

/** Whether someone is held: under escort, or in jail. */
export function isHeld(character: Character): boolean {
  return Boolean(character.captive) || character.activity.kind === 'jailed';
}

/**
 * Someone died: heads they carried are lost with them, a captive they led goes
 * free, and one who died a captive is no longer anyone's to deliver.
 */
export function justiceOnDeath(ctx: SimContext, character: Character): void {
  for (const head of character.heads) loseHead(ctx, character, head.outlawId);
  character.heads = [];
  const captive = captiveOf(ctx, character);
  if (captive) {
    const place = character.locationId ?? captive.locationId ?? captive.homeId;
    free(ctx, captive, place);
    ctx.emit(
      {
        type: 'capture.escape',
        data: { characterId: captive.id, locationId: place, captorId: character.id },
      },
      [captive.id],
      place,
    );
  }
  if (character.captive) {
    const captor = ctx.world.characters.get(character.captive.captorId);
    if (captor?.escorting === character.id) delete captor.escorting;
    delete character.captive;
  }
}
