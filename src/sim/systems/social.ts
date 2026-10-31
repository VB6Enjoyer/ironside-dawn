import {
  LANGUAGE_LEVELS,
  LANGUAGES,
  SPECIES,
  type LanguageId,
  type SpeciesId,
} from '../../content';
import { MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type {
  Character,
  CharacterId,
  DelveProgress,
  Location,
  LocationId,
  Opinion,
  Party,
  PartyId,
} from '../model';
import { isAlive, isFitToDelve, needsRecovery } from './condition';
import { remember, satisfy } from './mind';
import { cancelWake, wakeAt } from './wake';
import { idsAt, moveTo } from './whereabouts';

/**
 * Bonds between characters (ROADMAP.md Phase 5): opinions, language, tavern
 * meetings, friendship and rivalry, mourning, and adventuring parties.
 */

const MAX_OPINIONS = 30;
/** Opinions may run this far over before the faintest are forgotten, all at once. */
const OPINION_SLACK = 8;
/** Strangers who catch a character's eye in a crowded tavern, besides anyone they know. */
const STRANGERS_NOTICED = 12;
const FRIEND_AFFINITY = 0.55;
const FRIEND_FAMILIARITY = 0.5;
const RIVAL_AFFINITY = -0.4;
/** Friends who trust each other this much will adventure together. */
const PARTY_TRUST = 0.3;
const MAX_PARTY = 4;
/** Below this, a member stops following their leader. */
const LOYALTY_FLOOR = 0.1;
/** Languages understood at least this well allow real conversation. */
const UNDERSTOOD = 0.3;

// ---------------------------------------------------------------------------
// Opinions

export function opinionOf(character: Character, otherId: CharacterId): Opinion | undefined {
  return character.opinions[otherId];
}

/** Shifts how `character` feels about `other`. Values stay in range. */
export function adjustOpinion(
  character: Character,
  otherId: CharacterId,
  change: { affinity?: number; trust?: number; familiarity?: number },
  now: number,
): Opinion {
  let opinion = character.opinions[otherId];
  if (!opinion) {
    opinion = { affinity: 0, trust: 0, familiarity: 0, lastSeen: now, bond: null };
    character.opinions[otherId] = opinion;
    forgetFaintest(character, otherId);
  }
  opinion.affinity = clamp(opinion.affinity + (change.affinity ?? 0), -1, 1);
  opinion.trust = clamp(opinion.trust + (change.trust ?? 0), 0, 1);
  opinion.familiarity = clamp(opinion.familiarity + (change.familiarity ?? 0), 0, 1);
  opinion.lastSeen = now;
  return opinion;
}

/**
 * Keeps the opinions that matter most: the strongest feelings and the best
 * known. Done in batches, once there are a few too many, as it costs a sort.
 */
function forgetFaintest(character: Character, keep: CharacterId): void {
  const ids = Object.keys(character.opinions) as CharacterId[];
  if (ids.length <= MAX_OPINIONS + OPINION_SLACK) return;
  const weight = (id: CharacterId) => {
    const o = character.opinions[id]!;
    return o.familiarity + Math.abs(o.affinity);
  };
  const ranked = ids
    .filter((id) => id !== keep)
    .map((id) => [id, weight(id)] as const)
    .sort((a, b) => a[1] - b[1]);
  for (const [id] of ranked.slice(0, ids.length - MAX_OPINIONS)) delete character.opinions[id];
}

export function isFriend(character: Character, otherId: CharacterId): boolean {
  return character.opinions[otherId]?.bond === 'friend';
}

// ---------------------------------------------------------------------------
// Language

export function nativeLanguage(species: SpeciesId): LanguageId {
  return SPECIES[species].language;
}

/** How well two characters can talk: their best shared language, 0 to 1. */
export function communication(a: Character, b: Character): number {
  let best = 0;
  for (const language of Object.keys(LANGUAGES) as LanguageId[]) {
    best = Math.max(best, Math.min(a.languages[language] ?? 0, b.languages[language] ?? 0));
  }
  return best / 100;
}

export function understands(a: Character, b: Character): boolean {
  return communication(a, b) >= UNDERSTOOD;
}

/** Learns some of a language, announcing new levels of fluency. */
export function learnLanguage(
  ctx: SimContext,
  character: Character,
  language: LanguageId,
  amount: number,
  locationId: LocationId,
): void {
  const before = character.languages[language] ?? 0;
  if (before >= 100) return;
  const wits = Math.floor((character.stats.wits - 10) / 2);
  const after = Math.min(100, before + amount * (1 + 0.1 * wits) * (1 - before / 100) ** 2);
  character.languages[language] = after;
  const level = LANGUAGE_LEVELS.findLast((l) => before < l.at && after >= l.at);
  if (level) {
    ctx.emit(
      {
        type: 'character.language',
        data: { characterId: character.id, locationId, language, level: level.name },
      },
      [character.id],
      locationId,
    );
  }
}

/** Living in a town teaches its languages, a little each day. */
export function hearTownLanguages(ctx: SimContext, character: Character, town: Location): void {
  const total = Object.values(town.population).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  if (total === 0) return;
  for (const [species, count] of Object.entries(town.population) as [SpeciesId, number][]) {
    const language = nativeLanguage(species);
    learnLanguage(ctx, character, language, DAILY_EXPOSURE * (count / total), town.id);
  }
}
const DAILY_EXPOSURE = 0.25;

// ---------------------------------------------------------------------------
// Attitudes

/** How one character's people regard the other's (WORLD.md §2), -1 to 1. */
export function speciesAttitude(a: Character, b: Character): number {
  return (SPECIES[a.species].attitudes as Record<string, number>)[b.species] ?? 0;
}

/**
 * How inclined `a` is to harm `b` (ARCHITECTURE.md §4.8): species attitude,
 * personal morality, their history, and whether they can talk. Roughly -1
 * (would never) to 1 (gladly).
 */
export function hostility(a: Character, b: Character): number {
  const affinity = a.opinions[b.id]?.affinity ?? 0;
  const cruelty = (1 - a.traits.compassion) * (a.outlaw ? 1 : 0.3);
  return -0.4 * speciesAttitude(a, b) + 0.5 * cruelty - 0.6 * affinity - 0.3 * communication(a, b);
}

// ---------------------------------------------------------------------------
// Meetings

/**
 * A character at a tavern may fall into conversation with someone else there,
 * more likely their own kind, or someone they already know.
 */
export function socialize(ctx: SimContext, character: Character, location: Location): void {
  const rng = ctx.rng.social;
  if (!rng.chance(0.35 + 0.5 * character.traits.sociability)) return;

  // Anyone they know who is here, and a few strangers who catch their eye.
  const world = ctx.world;
  const here = idsAt(world, location.id);
  const noticed = new Set<Character>();
  for (const id in character.opinions) {
    const other = world.characters.get(id as CharacterId);
    if (other?.locationId === location.id) noticed.add(other);
  }
  for (let i = Math.min(STRANGERS_NOTICED, here.length); i > 0; i--) {
    noticed.add(world.characters.get(here[rng.int(0, here.length - 1)]!)!);
  }

  const candidates: [Character, number][] = [];
  for (const other of noticed) {
    if (other.id === character.id || !isAlive(other)) continue;
    if (!available(other)) continue;
    const opinion = character.opinions[other.id];
    // Decent folk keep their distance from known outlaws.
    const shunned = Boolean(other.outlaw) !== Boolean(character.outlaw) ? 0.1 : 1;
    const weight =
      (other.species === character.species ? 1 : 0.35) *
      (1 + 2 * (opinion?.familiarity ?? 0)) *
      (opinion?.bond === 'friend' ? 2 : opinion?.bond === 'rival' ? 0.3 : 1) *
      shunned;
    candidates.push([other, weight]);
  }
  if (candidates.length === 0) return;
  meet(ctx, character, rng.weighted(candidates), location);
}

function meet(ctx: SimContext, a: Character, b: Character, location: Location): void {
  const rng = ctx.rng.social;
  const now = ctx.world.time;
  const comm = communication(a, b);
  const first = !a.opinions[b.id];

  for (const [self, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const compatibility =
      0.1 * (1 - Math.abs(self.traits.honor - other.traits.honor)) +
      0.1 * (1 - Math.abs(self.traits.compassion - other.traits.compassion)) -
      0.1;
    const warmth =
      (0.012 + 0.05 * speciesAttitude(self, other) + 0.5 * compatibility) * (0.3 + 0.7 * comm) +
      rng.gaussian(0, 0.04);
    adjustOpinion(
      self,
      other.id,
      { affinity: warmth, familiarity: 0.12, trust: warmth > 0 ? 0.03 * comm : 0 },
      now,
    );
  }

  if (first) {
    ctx.emit(
      {
        type: 'social.meet',
        data: {
          characterId: a.id,
          otherId: b.id,
          locationId: location.id,
          understood: comm >= UNDERSTOOD,
        },
      },
      [a.id, b.id],
      location.id,
    );
  }

  // Tempers flare, more so among the unkind, the misunderstood, and old rivals.
  const rivals = a.opinions[b.id]?.bond === 'rival' || b.opinions[a.id]?.bond === 'rival';
  const quarrelChance =
    0.005 +
    0.03 * (1 - Math.min(a.traits.compassion, b.traits.compassion)) * (1 - 0.5 * comm) +
    (rivals ? 0.15 : 0);
  if (rng.chance(quarrelChance)) {
    const sting = 0.2 + 0.1 * rng.next();
    adjustOpinion(a, b.id, { affinity: -sting, trust: -0.1 }, now);
    adjustOpinion(b, a.id, { affinity: -sting, trust: -0.1 }, now);
    ctx.emit(
      {
        type: 'social.quarrel',
        data: { characterId: a.id, otherId: b.id, locationId: location.id },
      },
      [a.id, b.id],
      location.id,
    );
  }

  // People pick up each other's tongues, faster from friends.
  const teaching = isFriend(a, b.id) && isFriend(b, a.id) ? 2 : 1;
  learnLanguage(ctx, a, nativeLanguage(b.species), 1.5 * teaching, location.id);
  learnLanguage(ctx, b, nativeLanguage(a.species), 1.5 * teaching, location.id);

  shareRumors(ctx, a, b, location);
  shareRumors(ctx, b, a, location);
  checkBonds(ctx, a, b, location);
}

/**
 * Friends who can talk pass on what they know of the dungeons: news of places
 * the listener hasn't tried, or a warning about one that went much worse for
 * the teller.
 */
function shareRumors(ctx: SimContext, listener: Character, teller: Character, location: Location) {
  if (
    communication(listener, teller) < 0.4 ||
    (listener.opinions[teller.id]?.affinity ?? 0) < 0.3
  ) {
    return;
  }
  const now = ctx.world.time;
  for (const [place, told] of Object.entries(teller.expectations) as [
    LocationId,
    NonNullable<Character['expectations'][LocationId]>,
  ][]) {
    if (told.trips === 0) continue;
    const known = listener.expectations[place];
    let warning: boolean;
    if (!known) {
      // Hearsay: no trips of their own, but an idea of what to expect.
      listener.expectations[place] = {
        trips: 0,
        reward: told.reward,
        danger: told.danger,
        lastAt: now,
      };
      warning = told.danger >= 0.5;
    } else if (told.danger > known.danger + WARNING_GAP) {
      known.danger += (told.danger - known.danger) / 2;
      warning = true;
    } else {
      continue;
    }
    ctx.emit(
      {
        type: 'social.rumor',
        data: {
          characterId: listener.id,
          otherId: teller.id,
          locationId: location.id,
          aboutId: place,
          warning,
        },
      },
      [listener.id, teller.id],
      location.id,
    );
    return; // one story per meeting
  }
}
/** How much worse a friend's experience must be to be passed on as a warning. */
const WARNING_GAP = 0.25;

function checkBonds(ctx: SimContext, a: Character, b: Character, location: Location): void {
  const ab = a.opinions[b.id]!;
  const ba = b.opinions[a.id]!;
  const friendly = (o: Opinion) =>
    o.affinity >= FRIEND_AFFINITY && o.familiarity >= FRIEND_FAMILIARITY;
  if (friendly(ab) && friendly(ba) && (ab.bond !== 'friend' || ba.bond !== 'friend')) {
    ab.bond = 'friend';
    ba.bond = 'friend';
    ctx.emit(
      {
        type: 'social.friend',
        data: { characterId: a.id, otherId: b.id, locationId: location.id },
      },
      [a.id, b.id],
      location.id,
    );
  }
  for (const [self, other, o] of [
    [a, b, ab],
    [b, a, ba],
  ] as const) {
    if (o.affinity <= RIVAL_AFFINITY && o.bond !== 'rival') {
      o.bond = 'rival';
      ctx.emit(
        {
          type: 'social.rival',
          data: { characterId: self.id, otherId: other.id, locationId: location.id },
        },
        [self.id, other.id],
        location.id,
      );
      if (self.partyId && self.partyId === other.partyId) leaveParty(ctx, self, 'quarrel');
    }
  }
  if (ab.bond === 'friend' && ab.trust >= PARTY_TRUST && ba.trust >= PARTY_TRUST) {
    joinUp(ctx, a, b, location.id);
  }
}

// ---------------------------------------------------------------------------
// Mourning

/** Those who cared for the dead grieve; if someone killed them, they remember who. */
export function mournDeath(
  ctx: SimContext,
  deceased: Character,
  killerId: CharacterId | null,
): void {
  const now = ctx.world.time;
  const locationId = deceased.death?.locationId ?? deceased.homeId;
  for (const other of ctx.world.characters.values()) {
    if (other.id === deceased.id || !isAlive(other)) continue;
    const opinion = other.opinions[deceased.id];
    if (!opinion || opinion.affinity < 0.35) continue;
    remember(other, now, { kind: 'grief', characterId: deceased.id }, 0.6 + 0.4 * opinion.affinity);
    other.drives.companionship = Math.min(1, other.drives.companionship + 0.2);
    satisfy(other, 'purpose', 0.2);
    if (killerId && killerId !== other.id) {
      const grudge = adjustOpinion(other, killerId, { affinity: -0.9, trust: -1 }, now);
      grudge.bond = 'rival';
    }
    if (opinion.affinity >= FRIEND_AFFINITY) {
      ctx.emit(
        {
          type: 'social.mourn',
          data: { characterId: other.id, locationId, deceasedId: deceased.id },
        },
        [other.id],
        locationId,
      );
    }
  }
  if (deceased.partyId) leaveParty(ctx, deceased, 'death');
}

// ---------------------------------------------------------------------------
// Parties

export function partyOf(ctx: SimContext, character: Character): Party | null {
  return character.partyId ? (ctx.world.parties.get(character.partyId) ?? null) : null;
}

/** Two friends who trust each other team up, or one joins the other's party. */
function joinUp(ctx: SimContext, a: Character, b: Character, locationId: LocationId): void {
  if (Boolean(a.outlaw) !== Boolean(b.outlaw)) return;
  const pa = partyOf(ctx, a);
  const pb = partyOf(ctx, b);
  if (pa && pb) return;
  if (pa || pb) {
    const party = (pa ?? pb)!;
    const joiner = pa ? b : a;
    if (party.members.length >= MAX_PARTY) return;
    party.members.push(joiner.id);
    joiner.partyId = party.id;
    ctx.emit(
      {
        type: 'party.join',
        data: { characterId: joiner.id, leaderId: party.leaderId, locationId },
      },
      [joiner.id, party.leaderId],
      locationId,
    );
    return;
  }
  const [leader, other] = b.level > a.level ? [b, a] : [a, b];
  const party: Party = {
    id: `p${ctx.world.nextPartyNumber++}` as PartyId,
    leaderId: leader.id,
    members: [leader.id, other.id],
    formedAt: ctx.world.time,
  };
  ctx.world.parties.set(party.id, party);
  leader.partyId = party.id;
  other.partyId = party.id;
  ctx.emit(
    { type: 'party.form', data: { characterId: leader.id, locationId, memberIds: party.members } },
    party.members,
    locationId,
  );
}

/** Leaves the party; a party of one is no party, and a leaderless one picks the next. */
export function leaveParty(
  ctx: SimContext,
  character: Character,
  reason: 'quarrel' | 'outlaw' | 'death',
): void {
  const party = partyOf(ctx, character);
  character.partyId = null;
  goOwnWay(ctx, character);
  if (!party) return;
  const world = ctx.world;
  const locationId = character.locationId ?? character.homeId;
  party.members = party.members.filter((id) => id !== character.id);
  const wasLeader = party.leaderId === character.id;
  if (wasLeader) releaseFollowers(ctx, character);
  if (reason !== 'death') {
    ctx.emit(
      {
        type: 'party.leave',
        data: { characterId: character.id, leaderId: party.leaderId, locationId, reason },
      },
      [character.id, party.leaderId],
      locationId,
    );
  }
  if (party.members.length <= 1) {
    for (const id of party.members) {
      const member = world.characters.get(id)!;
      member.partyId = null;
      goOwnWay(ctx, member);
    }
    world.parties.delete(party.id);
    // The last one left announces it; the dead announce nothing.
    const announcer = party.members[0] ?? (reason === 'death' ? null : character.id);
    if (!announcer) return;
    ctx.emit(
      { type: 'party.disband', data: { characterId: announcer, locationId, reason } },
      [announcer],
      locationId,
    );
    return;
  }
  if (wasLeader) party.leaderId = party.members[0]!;
}

/** Party members currently traveling or delving with this leader. */
export function followersOf(ctx: SimContext, leader: Character): Character[] {
  const party = partyOf(ctx, leader);
  if (!party || party.leaderId !== leader.id) return [];
  return party.members
    .filter((id) => id !== leader.id)
    .map((id) => ctx.world.characters.get(id)!)
    .filter((c) => c.activity.kind === 'accompanying' && c.activity.leaderId === leader.id);
}

/**
 * Gathers the leader's party members who are here, free and fit, to come
 * along. Whatever they were doing is dropped; the leader now decides for them.
 */
export function gatherParty(ctx: SimContext, leader: Character, location: Location): Character[] {
  const party = partyOf(ctx, leader);
  if (!party || party.leaderId !== leader.id) return [];
  const now = ctx.world.time;
  const company = followersOf(ctx, leader);
  for (const id of party.members) {
    const member = ctx.world.characters.get(id)!;
    if (member.id === leader.id || company.includes(member) || !isAlive(member)) continue;
    if (member.locationId !== location.id || !available(member)) continue;
    if (!isFitToDelve(member, now) || needsRecovery(member)) continue;
    if ((member.opinions[leader.id]?.affinity ?? 0) < LOYALTY_FLOOR) continue;
    cancelWake(member);
    member.activity = { kind: 'accompanying', leaderId: leader.id };
    company.push(member);
  }
  return company;
}

/** A follower whose party is gone stops following and decides for themselves again. */
function goOwnWay(ctx: SimContext, character: Character): void {
  if (character.activity.kind !== 'accompanying') return;
  standDown(ctx, character, ctx.world.characters.get(character.activity.leaderId));
}

/** Lets the leader's followers go back to deciding for themselves. */
export function releaseFollowers(ctx: SimContext, leader: Character): void {
  for (const follower of followersOf(ctx, leader)) standDown(ctx, follower, leader);
}

/**
 * A follower decides for themselves again. In a town or a dungeon they do so
 * at once; caught on the road, they walk the rest of the leg alone first.
 */
function standDown(ctx: SimContext, follower: Character, leader: Character | undefined): void {
  const lead = leader?.activity;
  if (follower.locationId === null && lead?.kind === 'traveling') {
    follower.activity = {
      kind: 'traveling',
      destinationId: lead.leg.to,
      leg: lead.leg,
      remaining: [],
    };
    wakeAt(ctx, follower, lead.leg.arrivesAt);
    return;
  }
  follower.activity = { kind: 'idle' };
  // Nobody stops following anywhere but on a road with their leader; this is a safety net.
  if (follower.locationId === null) {
    moveTo(ctx.world, follower, leader?.locationId ?? follower.homeId);
  }
  wakeAt(ctx, follower, ctx.world.time + MINUTE);
}

/**
 * After a delve the leader shares out the gold found. The honorable split it
 * evenly; the dishonorable keep more for themselves, and their companions
 * notice.
 */
export function shareSpoils(
  ctx: SimContext,
  leader: Character,
  members: readonly Character[],
  progress: DelveProgress,
): void {
  if (members.length === 0 || progress.goldFound <= 0) return;
  const now = ctx.world.time;
  const even = progress.goldFound / (members.length + 1);
  const honesty = leader.traits.honor >= 0.35 ? 1 : 0.5 + leader.traits.honor;
  const shares = members.map((m) => {
    const gold = Math.min(leader.gold, Math.floor(even * honesty));
    leader.gold -= gold;
    m.gold += gold;
    m.goldEarned += gold;
    return { characterId: m.id, gold };
  });
  const fair = honesty >= 1;
  ctx.emit(
    {
      type: 'party.share',
      data: {
        characterId: leader.id,
        locationId: progress.locationId,
        gold: progress.goldFound,
        shares,
        fair,
      },
    },
    [leader.id, ...members.map((m) => m.id)],
    progress.locationId,
  );
  for (const m of members) {
    const opinion = adjustOpinion(
      m,
      leader.id,
      fair ? { affinity: 0.04, trust: 0.05 } : { affinity: -0.25, trust: -0.3 },
      now,
    );
    if (opinion.affinity < LOYALTY_FLOOR) leaveParty(ctx, m, 'quarrel');
  }
}

/** Free to be interrupted: not on the road, not fighting, not already with a party. */
function available(character: Character): boolean {
  const kind = character.activity.kind;
  return kind === 'idle' || kind === 'pastime' || kind === 'convalescing';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
