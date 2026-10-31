import type { SimContext } from '../context';
import type { Character, Location, LocationId } from '../model';
import { startBrawl } from './combat';
import { isAlive } from './condition';
import { remember, wealthNeed } from './mind';
import { wakeAt } from './wake';
import {
  adjustOpinion,
  communication,
  followersOf,
  hostility,
  leaveParty,
  partyOf,
} from './social';
import { charactersAt } from './whereabouts';

/**
 * Outlaws (WORLD.md §3, ROADMAP.md Phase 5): need and a weak conscience turn
 * adventurers to banditry. They lurk by the road, rob or kill travelers, and
 * earn bounties that draw hunters. Some go straight again.
 */

/** Daily chance of turning outlaw, for the most susceptible and desperate. */
const TURN_CHANCE = 0.04;
/** Below this much gold an adventurer counts as broke. */
const BROKE = 15;
const ROBBERY_BOUNTY = 25;
const MURDER_BOUNTY = 60;
/** Share of a surrendering victim's purse an outlaw takes. */
const ROBBERY_TAKE = 0.6;
/** Outlaws try their luck against parties up to this much stronger than theirs. */
const NERVE = 0.7;
const REFORM_CHANCE = 0.05;
const REFORM_QUIET_DAYS = 60;
const DAY = 86_400;
const MINUTE = 60;

/** Once a day, per character: some turn to crime; some outlaws go straight. */
export function considerCrime(ctx: SimContext, character: Character): void {
  if (!isAlive(character)) return;
  const rng = ctx.rng.outlaws;
  const now = ctx.world.time;
  const { honor, greed, compassion } = character.traits;
  const locationId = character.locationId ?? character.homeId;

  if (!character.outlaw) {
    if (character.gold >= BROKE || character.activity.kind === 'fighting') return;
    const susceptibility = (1 - honor) * (0.5 + greed) * (1.2 - compassion);
    if (!rng.chance(TURN_CHANCE * susceptibility ** 2 * wealthNeed(character))) return;
    character.outlaw = {
      since: now,
      crimes: 0,
      murders: 0,
      lastCrimeAt: now,
      lastSeenAt: locationId,
    };
    if (character.partyId) leaveParty(ctx, character, 'outlaw');
    ctx.emit(
      { type: 'outlaw.turn', data: { characterId: character.id, locationId } },
      [character.id],
      locationId,
    );
    return;
  }

  // Prosperous, quiet and not without honor: some put it behind them.
  const quiet = now - character.outlaw.lastCrimeAt > REFORM_QUIET_DAYS * DAY;
  if (quiet && character.gold > 120 && honor > 0.35 && rng.chance(REFORM_CHANCE)) {
    // Restitution: half their purse buys a pardon and the bounty is lifted.
    character.gold = Math.floor(character.gold / 2);
    character.outlaw = null;
    ctx.world.bounties.delete(character.id);
    if (character.partyId) leaveParty(ctx, character, 'outlaw');
    ctx.emit(
      { type: 'outlaw.reform', data: { characterId: character.id, locationId } },
      [character.id],
      locationId,
    );
  }
}

/**
 * Travelers reach a place where outlaws lurk. The outlaws size them up; if they
 * strike, the travelers can pay, refuse and fight, or, if they can't
 * understand the demand, end up fighting anyway. Returns true if a fight
 * started, interrupting the journey.
 */
export function ambush(ctx: SimContext, traveler: Character, location: Location): boolean {
  if (location.kind !== 'wilderness' || traveler.outlaw) return false;
  const world = ctx.world;
  const lurkers = charactersAt(world, location.id).filter(
    (c) => c.outlaw && isAlive(c) && c.activity.kind === 'pastime' && c.activity.pastime === 'lurk',
  );
  if (lurkers.length === 0) return false;
  const rng = ctx.rng.outlaws;
  const leader = lurkers[0]!;
  const victims = [traveler, ...followersOf(ctx, traveler)];

  // Strike only if the odds look good, and not at people they like.
  const strength = (group: readonly Character[]) => group.reduce((s, c) => s + 2 + c.level, 0);
  const nerve = NERVE + 0.5 * leader.traits.bravery;
  if (strength(lurkers) < strength(victims) * nerve) return false;
  if (hostility(leader, traveler) < 0) return false;

  const understood = communication(leader, traveler) >= 0.3;
  const yields =
    understood &&
    (traveler.traits.bravery < 0.45 || strength(victims) < strength(lurkers) * 0.8) &&
    rng.chance(0.8);
  const parley = !understood ? 'misunderstood' : yields ? 'surrendered' : 'refused';
  ctx.emit(
    {
      type: 'outlaw.ambush',
      data: {
        characterId: leader.id,
        locationId: location.id,
        outlawIds: lurkers.map((c) => c.id),
        victimIds: victims.map((c) => c.id),
        parley,
      },
    },
    [...lurkers.map((c) => c.id), ...victims.map((c) => c.id)],
    location.id,
  );

  if (parley === 'surrendered') {
    for (const victim of victims) {
      const gold = Math.floor(victim.gold * ROBBERY_TAKE);
      victim.gold -= gold;
      leader.gold += gold;
      remember(
        victim,
        world.time,
        { kind: 'wronged', characterId: leader.id, locationId: location.id },
        0.7,
      );
      adjustOpinion(victim, leader.id, { affinity: -0.6, trust: -1 }, world.time);
      ctx.emit(
        {
          type: 'crime.robbery',
          data: { characterId: leader.id, locationId: location.id, victimId: victim.id, gold },
        },
        [leader.id, victim.id],
        location.id,
      );
      ctx.world.tally.robberies++;
      registerCrime(ctx, leader, victim, 'robbery', location.id);
    }
    // A good haul: off to spend it before the alarm is raised.
    for (const outlaw of lurkers) {
      outlaw.activity = { kind: 'idle' };
      wakeAt(ctx, outlaw, world.time + MINUTE);
    }
    return false;
  }
  startBrawl(ctx, 'ambush', victims, lurkers, location);
  return true;
}

/** One character killed another: murder, or justice with a bounty paid. */
export function onCharacterKilled(ctx: SimContext, victim: Character, killer: Character): void {
  const locationId = victim.death?.locationId ?? killer.locationId ?? killer.homeId;
  if (victim.outlaw && !killer.outlaw) {
    const bounty = ctx.world.bounties.get(victim.id);
    if (!bounty) return;
    ctx.world.bounties.delete(victim.id);
    ctx.world.tally.bountiesClaimed++;
    killer.gold += bounty.amount;
    killer.goldEarned += bounty.amount;
    killer.reputation[bounty.townId] = Math.min(1, (killer.reputation[bounty.townId] ?? 0) + 0.3);
    ctx.emit(
      {
        type: 'bounty.claim',
        data: {
          characterId: killer.id,
          locationId: bounty.townId,
          outlawId: victim.id,
          amount: bounty.amount,
        },
      },
      // The outlaw is named in the data; the dead take no further part.
      [killer.id],
      bounty.townId,
    );
    return;
  }
  if (killer.outlaw) {
    ctx.world.tally.murders++;
    registerCrime(ctx, killer, victim, 'murder', locationId);
  }
}

/** A crime is known: the outlaw's bounty grows, and every town thinks less of them. */
function registerCrime(
  ctx: SimContext,
  outlaw: Character,
  victim: Character,
  kind: 'robbery' | 'murder',
  locationId: LocationId,
): void {
  const record = outlaw.outlaw!;
  record.crimes++;
  if (kind === 'murder') record.murders++;
  record.lastCrimeAt = ctx.world.time;
  record.lastSeenAt = locationId;

  const add = kind === 'murder' ? MURDER_BOUNTY : ROBBERY_BOUNTY;
  const existing = ctx.world.bounties.get(outlaw.id);
  const bounty = existing ?? {
    outlawId: outlaw.id,
    amount: 0,
    townId: victim.homeId,
    postedAt: ctx.world.time,
  };
  bounty.amount += add;
  ctx.world.bounties.set(outlaw.id, bounty);
  for (const town of ctx.world.locations.values()) {
    if (town.kind !== 'town') continue;
    outlaw.reputation[town.id] = Math.max(
      -1,
      (outlaw.reputation[town.id] ?? 0) - (kind === 'murder' ? 0.4 : 0.2),
    );
  }
  ctx.emit(
    {
      type: 'bounty.post',
      data: { characterId: outlaw.id, locationId: bounty.townId, amount: bounty.amount },
    },
    [outlaw.id],
    bounty.townId,
  );
}

/** Hunters reach where their quarry was last seen. If it is there, they attack. */
export function confrontQuarry(
  ctx: SimContext,
  hunter: Character,
  quarry: Character,
  location: Location,
): boolean {
  if (!isAlive(quarry) || quarry.locationId !== location.id) return false;
  const busy = quarry.activity.kind === 'fighting' || quarry.activity.kind === 'traveling';
  if (busy) return false;
  const hunters = [hunter, ...followersOf(ctx, hunter)];
  const gang = partyOf(ctx, quarry);
  const outlaws = [
    quarry,
    ...(gang?.members ?? [])
      .map((id) => ctx.world.characters.get(id)!)
      .filter(
        (c) =>
          c.id !== quarry.id &&
          isAlive(c) &&
          c.locationId === location.id &&
          c.activity.kind !== 'traveling',
      ),
  ];
  startBrawl(ctx, 'hunt', hunters, outlaws, location);
  return true;
}

/** Whether a town will serve this character: wanted outlaws find doors shut. */
export function isWantedIn(character: Character, townId: LocationId): boolean {
  return Boolean(character.outlaw) && (character.reputation[townId] ?? 0) < -0.3;
}
