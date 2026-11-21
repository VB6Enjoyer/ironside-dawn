import { goodDef, type GoodId, type Goods } from '../../content';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import { createCharacter } from '../gen/people';
import type { Character, CharacterId, Location, OutlawReason } from '../model';
import { startBrawl } from './combat';
import { isAlive } from './condition';
import { remember, vividness, wealthNeed } from './mind';
import { hasSellable } from './decide';
import { bystanders, identifyChance, leaveUnsolved, nearestTown, recordCrime } from './notoriety';
import { considerRestitution, isHeld, layTrap, takeHead } from './justice';
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

/** Daily chance of turning outlaw from want, for the most susceptible and desperate. */
const TURN_CHANCE = 0.04;
/** Below this much gold an adventurer counts as broke. */
const BROKE = 40;
/**
 * Days broke, with nothing left to sell, before want can turn anyone: a new
 * arrival who has just bought their gear, or a bad week, doesn't.
 */
const HARDSHIP_DAYS = 10;
/** Days of hardship after that over which desperation builds to the full. */
const DESPERATION_DAYS = 30;
/**
 * Daily chance of giving in to temptation, for someone with no conscience, for
 * each good reason they have. Without one, nobody is tempted at all.
 */
const TEMPTATION_CHANCE = 0.001;
/** Reasons it takes before temptation can turn someone. */
const REASONS_NEEDED = 1;
/** Years after a pardon in which temptation finds no hold. */
const PARDON_YEARS = 3;
const YEAR = 360 * 86_400;
/** Share of a surrendering victim's purse an outlaw takes. */
const ROBBERY_TAKE = 0.6;
/** Outlaws try their luck against parties up to this much stronger than theirs. */
const NERVE = 0.7;
/** Compassion below which an outlaw may attack without a demand, more often the crueler. */
const CRUELTY = 0.25;
const DAY = 86_400;
const MINUTE = 60;

/** Once a day, per character: some turn to crime; some outlaws go straight. */
export function considerCrime(ctx: SimContext, character: Character): void {
  if (!isAlive(character)) return;
  const now = ctx.world.time;

  if (!character.outlaw) {
    // Only adventurers take to the road this way; a broke merchant borrows and tries again.
    if (character.calling !== 'adventurer' || character.activity.kind === 'fighting') return;
    const reason = wantOf(ctx, character, now) ?? temptationOf(ctx, character, now);
    if (reason) turnOutlaw(ctx, character, reason);
    return;
  }

  // Held, they can do nothing; free, some tire of the life and pay what they owe.
  if (isHeld(character)) return;
  considerRestitution(ctx, character);
}

/** Someone takes to the road as an outlaw, leaving any honest party. */
export function turnOutlaw(ctx: SimContext, character: Character, reason: OutlawReason): void {
  const now = ctx.world.time;
  const locationId = character.locationId ?? character.homeId;
  character.outlaw = {
    since: now,
    reason,
    crimes: 0,
    murders: 0,
    lastCrimeAt: now,
    lastSeenAt: locationId,
  };
  delete character.hardshipSince;
  character.justice.push({ kind: 'turned', at: now, reason });
  if (character.partyId) leaveParty(ctx, character, 'outlaw');
  ctx.emit(
    { type: 'outlaw.turn', data: { characterId: character.id, locationId, reason } },
    [character.id],
    locationId,
  );
}

/** How the conscience holds: 0 for the honorable and kind, up to about 1.6 for neither. */
export function weakConscience(character: Character): number {
  const { honor, compassion } = character.traits;
  return (1 - honor) * (1.2 - compassion);
}

/**
 * Want: broke for a while with nothing left to sell, growing more desperate
 * the longer it lasts, and sooner after a bad run (narrow escapes, flight).
 */
function wantOf(ctx: SimContext, character: Character, now: number): OutlawReason | null {
  if (character.gold >= BROKE || hasSellable(character) || character.stolenFrom.length > 0) {
    delete character.hardshipSince;
    return null;
  }
  character.hardshipSince ??= now;
  const days = (now - character.hardshipSince) / DAY;
  if (days < HARDSHIP_DAYS) return null;
  const badRun = character.memories
    .filter((m) => m.kind === 'near-death' || m.kind === 'fled')
    .reduce((sum, m) => sum + vividness(m, now), 0);
  const desperation = Math.min(1, (days - HARDSHIP_DAYS) / DESPERATION_DAYS + 0.3 * badRun);
  const susceptibility = weakConscience(character) * (0.5 + character.traits.greed);
  const chance = TURN_CHANCE * susceptibility ** 2 * wealthNeed(character) * desperation;
  return ctx.rng.outlaws.chance(chance) ? 'want' : null;
}

/**
 * Temptation: someone who isn't broke turns to crime only with good reason: a
 * ruthless ambition, a thief's skills and little honor, an outlaw for a
 * friend, or a fresh grudge in a hard heart. Even then it is rare, likelier
 * with more than one reason, and rarer the stronger their conscience.
 */
function temptationOf(ctx: SimContext, character: Character, now: number): OutlawReason | null {
  // Someone who has just paid for their crimes isn't tempted again so soon.
  if (character.pardonedAt !== undefined && now - character.pardonedAt < PARDON_YEARS * YEAR) {
    return null;
  }
  const reasons = temptationReasons(ctx, character, now);
  if (reasons.length < REASONS_NEEDED) return null;
  const chance = TEMPTATION_CHANCE * (weakConscience(character) / 1.6) ** 2 * reasons.length;
  return ctx.rng.outlaws.chance(chance) ? reasons[0]! : null;
}

/** Skill at which stealth or lockpicking makes crime look easy. */
const THIEFS_HANDS = 60;
/** A grudge vivid enough to act on. */
const FRESH_GRUDGE = 0.3;

/** What could draw someone into crime who doesn't need to, most telling first. */
export function temptationReasons(
  ctx: SimContext,
  character: Character,
  now: number,
): OutlawReason[] {
  const { honor, greed, compassion } = character.traits;
  const reasons: OutlawReason[] = [];
  if (compassion < 0.3 && greed > 0.65) reasons.push('ambition');
  // A thief at heart: quiet feet or quick fingers are their best skills, and good ones.
  const { stealth, lockpicking, blades, axes, blunt, polearms, bows } = character.skills;
  const hands = Math.max(stealth, lockpicking);
  const arms = Math.max(blades, axes, blunt, polearms, bows);
  if (hands >= THIEFS_HANDS && hands > arms && honor < 0.4) reasons.push('skill');
  if (honor < 0.5 && outlawFriend(ctx, character)) reasons.push('company');
  const grudge = character.memories.some(
    (m) => m.kind === 'wronged' && vividness(m, now) >= FRESH_GRUDGE,
  );
  if (grudge && compassion < 0.4) reasons.push('grudge');
  return reasons;
}

/** Whether a friend of theirs is a living outlaw. */
function outlawFriend(ctx: SimContext, character: Character): boolean {
  for (const id in character.opinions) {
    const opinion = character.opinions[id as CharacterId];
    if (opinion?.bond !== 'friend') continue;
    const friend = ctx.world.characters.get(id as CharacterId);
    if (friend?.outlaw && isAlive(friend)) return true;
  }
  return false;
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
  // The cruel don't always bother to ask.
  const cruel = rng.chance(Math.max(0, CRUELTY - leader.traits.compassion) * 2);
  const yields =
    !cruel &&
    understood &&
    (traveler.traits.bravery < 0.45 || strength(victims) < strength(lurkers) * 0.8) &&
    rng.chance(0.8);
  const parley = cruel
    ? 'attacked'
    : !understood
      ? 'misunderstood'
      : yields
        ? 'surrendered'
        : 'refused';
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
      // A merchant's cargo goes too, the better part of it, to be fenced far away.
      const goods: Goods = {};
      for (const [good, units] of Object.entries(victim.cargo) as [GoodId, number][]) {
        const taken = Math.round(units * ROBBERY_TAKE);
        if (taken < 1) continue;
        goods[good] = taken;
        victim.cargo[good] = units - taken;
      }
      remember(
        victim,
        world.time,
        { kind: 'wronged', characterId: leader.id, locationId: location.id },
        0.7,
      );
      adjustOpinion(victim, leader.id, { affinity: -0.6, trust: -1 }, world.time);
      // The robbed know they were robbed; whether they can say by whom is another matter.
      const named = rng.chance(
        identifyChance(
          leader,
          location,
          victims.length +
            bystanders(ctx, location.id, new Set([...lurkers, ...victims].map((c) => c.id))),
          victim.opinions[leader.id]?.familiarity ?? 0,
        ),
      );
      ctx.emit(
        {
          type: 'crime.robbery',
          data: {
            characterId: leader.id,
            locationId: location.id,
            victimId: victim.id,
            gold,
            ...(Object.keys(goods).length > 0 ? { goods } : {}),
            ...(named ? {} : { known: false }),
          },
        },
        [leader.id, victim.id],
        location.id,
      );
      ctx.world.tally.robberies++;
      recordCrime(ctx, leader, {
        kind: 'robbery',
        at: world.time,
        locationId: location.id,
        townId: nearestTown(ctx, location.id),
        victimId: victim.id,
        value: gold + worthOf(goods),
        known: named,
      });
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

/** One character killed another: murder, or justice, with a head taken for the bounty. */
export function onCharacterKilled(
  ctx: SimContext,
  victim: Character,
  killer: Character,
  /** Who saw it and how well they knew the killer; by default, plenty who knew them. */
  seen: { readonly witnesses: number; readonly familiarity: number } = {
    witnesses: 3,
    familiarity: 1,
  },
): void {
  const locationId = victim.death?.locationId ?? killer.locationId ?? killer.homeId;
  if (victim.outlaw && !killer.outlaw) {
    // The bounty stands until the head is brought to a town that knows it (0.3.0).
    if (ctx.world.bounties.has(victim.id)) takeHead(ctx, killer, victim, locationId);
    return;
  }
  // Whatever else, a dead outlaw's bounty lapses.
  ctx.world.bounties.delete(victim.id);
  if (killer.outlaw) {
    ctx.world.tally.murders++;
    const place = ctx.world.locations.get(locationId)!;
    const rng = ctx.rng.outlaws;
    const known = rng.chance(identifyChance(killer, place, seen.witnesses, seen.familiarity));
    // With nobody about, a cool-headed killer may hide the body: the victim simply vanishes.
    const hidden =
      seen.witnesses === 0 &&
      victim.death !== null &&
      rng.chance(
        Math.min(0.85, 0.15 + 0.3 * (1 - killer.traits.compassion) + 0.004 * killer.skills.stealth),
      );
    const crime = {
      kind: 'murder',
      at: ctx.world.time,
      locationId,
      townId: nearestTown(ctx, locationId),
      victimId: victim.id,
      value: 0,
      known,
    } as const;
    recordCrime(ctx, killer, crime);
    if (hidden) {
      victim.death = { ...victim.death!, hidden: true };
      ctx.emit(
        {
          type: 'crime.conceal',
          data: { characterId: killer.id, locationId, victimId: victim.id },
        },
        [killer.id],
        locationId,
      );
    }
    if (!known) leaveUnsolved(ctx, killer, crime, hidden);
    else if (!victim.outlaw) raiseAvenger(ctx, victim, killer);
  }
  // Those the dread kill may leave someone sworn to destroy it.
  if (killer.calling === 'dread') raiseAvenger(ctx, victim, killer);
}

/** Chance that a murder moves a commoner of the victim's town to take up the sword. */
const AVENGER_CHANCE = 0.3;

/**
 * Promotion from the commoners (ROADMAP.md Phase 8): a murder singles out
 * someone in the victim's town, a friend or neighbor, who becomes an
 * adventurer sworn to avenge them.
 */
function raiseAvenger(ctx: SimContext, victim: Character, killer: Character): void {
  const town = ctx.world.locations.get(victim.homeId);
  if (!town || town.kind !== 'town' || !ctx.rng.outlaws.chance(AVENGER_CHANCE)) return;
  const avenger = createCharacter(ctx, town, { newcomer: true, firstWakeWithin: 2 * HOUR });
  adjustOpinion(avenger, victim.id, { affinity: 0.7, familiarity: 0.6 }, ctx.world.time);
  adjustOpinion(avenger, killer.id, { affinity: -0.9, trust: -1 }, ctx.world.time);
  remember(avenger, ctx.world.time, { kind: 'grief', characterId: victim.id }, 0.9);
  ctx.emit(
    {
      type: 'character.avenger',
      data: {
        characterId: avenger.id,
        locationId: town.id,
        forId: victim.id,
        againstId: killer.id,
      },
    },
    [avenger.id],
    town.id,
  );
}

/** What goods are worth at their base value, for the record. */
export function worthOf(goods: Goods): number {
  let worth = 0;
  for (const [good, units] of Object.entries(goods) as [GoodId, number][]) {
    worth += units * goodDef(good).value;
  }
  return Math.round(worth);
}

/** Hunters reach where their quarry was last seen. If it is there, they attack. */
export function confrontQuarry(
  ctx: SimContext,
  hunter: Character,
  quarry: Character,
  location: Location,
): boolean {
  if (!isAlive(quarry) || quarry.locationId !== location.id || isHeld(quarry)) return false;
  const busy = quarry.activity.kind === 'fighting' || quarry.activity.kind === 'traveling';
  if (busy) return false;
  const hunters = [hunter, ...followersOf(ctx, hunter)];
  // One with the craft, who wants them alive, lays a trap instead of attacking.
  if (layTrap(ctx, hunters, quarry, location)) return true;
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
