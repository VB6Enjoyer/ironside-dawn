import { PASTIMES, type PastimeId } from '../../content';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type {
  Character,
  CharacterId,
  DriveId,
  Location,
  LocationId,
  LootItem,
  Motive,
} from '../model';
import { isDizzy, isFitToDelve, needsRecovery } from './condition';
import { fearOf, hasVisited, healthNeed, wealthNeed } from './mind';
import { isWantedIn } from './outlaws';
import { roleOf } from './progress';
import { canTrade, wantsToShop } from './shopping';
import { lairOdds } from './delve';
import { mustersOf } from './dread';
import { mythFear } from './myths';
import { CRUSADE_SIZE, willingRecruits } from './social';
import { findPath, nearbyPlaces } from './roads';
import type { TravelReason } from './travel';

/**
 * Utility AI (ARCHITECTURE.md §4.5): every option a character has gets a
 * score from their drives, personality and memories. The pick is weighted
 * among the best few, so behavior is believable without being predictable,
 * and the strongest reasons are kept to explain it.
 */

export type Action =
  | { readonly kind: 'sell' }
  | { readonly kind: 'convalesce' }
  | { readonly kind: 'pastime'; readonly pastime: PastimeId }
  | { readonly kind: 'delve' }
  | {
      readonly kind: 'travel';
      readonly to: LocationId;
      readonly reason: TravelReason;
      /** For a hunt: who they are after. */
      readonly target?: CharacterId;
    };

export interface Decision {
  readonly action: Action;
  readonly why: readonly Motive[];
  readonly score: number;
}

/** One part of an option's appeal, and the motive it stands for (if worth naming). */
interface Term {
  value: number;
  readonly motive: Motive | null;
}

interface Option {
  readonly action: Action;
  readonly terms: readonly Term[];
}

/** Motives that never change, made once: decisions run millions of times. */
const DRIVE = {
  purpose: { kind: 'drive', drive: 'purpose' },
  glory: { kind: 'drive', drive: 'glory' },
  wealth: { kind: 'drive', drive: 'wealth' },
  companionship: { kind: 'drive', drive: 'companionship' },
  health: { kind: 'drive', drive: 'health' },
} as const satisfies Record<DriveId, Motive>;
const LOOT: Motive = { kind: 'loot' };
const HOME: Motive = { kind: 'home' };

/** Only the best few options are considered; the rest are never chosen. */
const SHORTLIST = 3;
/** Higher sharpens the pick toward the best option. */
const SHARPNESS = 3;
const NOISE_SD = 0.15;
/** Reasons this strong or stronger are named. */
const NAMED_REASON = 0.1;
/** The plain appeal of a day in town, whatever the pastime, for the content. Restlessness wears it away. */
const TOWN_COMFORT = 0.3;
/** How much harder study is than an afternoon at the tavern. */
const STUDY_EFFORT = 0.1;
/** Restlessness at which a dungeon's full appeal is felt. */
const RESTLESS = 0.3;
/** Bounties a character weighs at once: the most tempting. */
const HUNTS_CONSIDERED = 2;
/** Hours on the road that halve a destination's appeal. */
const DISTANCE_HALVING_HOURS = 30;

export function decideAt(ctx: SimContext, character: Character, here: Location): Decision | null {
  const options = optionsAt(ctx, character, here);
  if (options.length === 0) return null;

  const rng = ctx.rng.behavior;
  // The best few, kept in order as the options are scored (cheaper than sorting them all).
  const scored: { option: Option; score: number }[] = [];
  for (const option of options) {
    let raw = 0;
    const terms = option.terms;
    for (let i = 0; i < terms.length; i++) raw += terms[i]!.value;
    // Uniform noise with the same spread as a gaussian of NOISE_SD, but cheaper.
    const noise = (rng.next() - 0.5) * NOISE_SD * Math.sqrt(12);
    const score = Math.max(0.01, raw * (1 + noise));
    if (scored.length === SHORTLIST && score <= scored[SHORTLIST - 1]!.score) continue;
    let i = Math.min(scored.length, SHORTLIST - 1);
    while (i > 0 && scored[i - 1]!.score < score) i--;
    scored.splice(i, 0, { option, score });
    if (scored.length > SHORTLIST) scored.pop();
  }
  const chosen = scored.length === 1 ? scored[0]! : pick(rng, scored);
  return { action: chosen.option.action, why: reasons(chosen.option.terms), score: chosen.score };
}

/** One of the shortlist, likelier the higher it scored (as `rng.weighted`, without the garbage). */
function pick(
  rng: SimContext['rng']['behavior'],
  scored: readonly { option: Option; score: number }[],
): { option: Option; score: number } {
  const weights = scored.map((s) => s.score ** SHARPNESS);
  let total = 0;
  for (const w of weights) total += w;
  let remaining = rng.next() * total;
  for (let i = 0; i < scored.length; i++) {
    if (remaining < weights[i]!) return scored[i]!;
    remaining -= weights[i]!;
  }
  // Only reachable through floating-point rounding at the very top of the range.
  return scored[scored.length - 1]!;
}

/** The two weightiest named motives behind a choice, weightiest first. */
function reasons(terms: readonly Term[]): Motive[] {
  let first: Term | null = null;
  let second: Term | null = null;
  for (const t of terms) {
    if (t.motive === null || t.value < NAMED_REASON) continue;
    if (!first || t.value > first.value) {
      second = first;
      first = t;
    } else if (!second || t.value > second.value) {
      second = t;
    }
  }
  if (!first) return [];
  return second ? [first.motive!, second.motive!] : [first.motive!];
}

function optionsAt(ctx: SimContext, character: Character, here: Location): Option[] {
  const now = ctx.world.time;
  const options: Option[] = [];
  const { traits, drives } = character;
  const recovering = needsRecovery(character);
  const health = healthNeed(character);
  const wealth = wealthNeed(character);
  const loot = hasSellable(character);

  switch (here.kind) {
    case 'town': {
      // Only worth asking whether they can deal here if there's dealing to do.
      const shopping = !loot && wantsToShop(ctx, character, here);
      const trading = (loot || shopping) && canTrade(ctx, character, here);
      if (trading && loot) {
        options.push({
          action: { kind: 'sell' },
          terms: [
            // Back from a trip with a full pack, selling comes first.
            { value: 1.6, motive: LOOT },
            { value: 0.3 * wealth, motive: DRIVE.wealth },
          ],
        });
      } else if (trading && shopping) {
        // Out of healing draughts, with coin to buy more.
        options.push({
          action: { kind: 'sell' },
          terms: [{ value: 0.45, motive: DRIVE.health }],
        });
      }
      if (recovering) {
        options.push({
          action: { kind: 'convalesce' },
          terms: [{ value: 1.2 + health, motive: DRIVE.health }],
        });
      }
      const wanted = isWantedIn(character, here.id);
      for (const pastime of pastimesAt(here, character)) {
        // A quiet day in town has its own appeal.
        const terms: Term[] = [{ value: TOWN_COMFORT * (1 - drives.purpose), motive: null }];
        addPastimeTerms(terms, character, pastime);
        // A wanted outlaw is not welcome to linger.
        if (wanted) terms.push({ value: -0.25, motive: null });
        options.push({ action: { kind: 'pastime', pastime }, terms });
      }
      break;
    }
    case 'dungeon': {
      if (isFitToDelve(character, now)) {
        const terms = delveTerms(ctx, character, here.id, 1);
        terms.push({ value: 0.05, motive: null });
        options.push({ action: { kind: 'delve' }, terms });
      } else if (isDizzy(character, now) && !recovering) {
        // Only dizzy: wait outside for the head to clear.
        options.push({
          action: { kind: 'pastime', pastime: 'scout' },
          terms: [{ value: 0.6, motive: null }],
        });
      }
      break;
    }
    case 'wilderness': {
      if (!recovering && character.outlaw) {
        options.push({
          action: { kind: 'pastime', pastime: 'lurk' },
          terms: [
            { value: 0.35, motive: null },
            { value: 0.6 * wealth, motive: DRIVE.wealth },
            { value: 0.2 * traits.greed, motive: null },
            // Where they were run to ground or nearly killed, they are wary of lingering.
            { value: -0.5 * fearOf(character, here.id, now), motive: null },
          ],
        });
      }
      if (!recovering) {
        for (const pastime of pastimesAt(here, character)) {
          options.push({
            action: { kind: 'pastime', pastime },
            terms: [
              { value: 0.15, motive: null },
              { value: 0.2 * wealth, motive: DRIVE.wealth },
              { value: 0.1 * traits.curiosity, motive: null },
            ],
          });
        }
      }
      break;
    }
  }

  // The road: journeys and hunts, as planned a little while ago if nothing has changed.
  const road = roadOptions(ctx, character, here, recovering, loot, health);
  for (let i = 0; i < road.length; i++) options.push(road[i]!);
  return options;
}

/** How long someone's weighing of the road holds while they stay in one place. */
const PLAN_HOURS = 6;

/**
 * Someone staying in town doesn't reconsider every road out every hour or
 * two: their weighing of journeys and hunts holds for a few hours, unless
 * they pick up loot, get hurt, or join or leave a party.
 */
const plans = new WeakMap<
  Character,
  {
    readonly at: number;
    readonly here: LocationId;
    readonly recovering: boolean;
    readonly loot: boolean;
    readonly partyId: string | null;
    readonly outlaw: boolean;
    readonly options: Option[];
  }
>();

function roadOptions(
  ctx: SimContext,
  character: Character,
  here: Location,
  recovering: boolean,
  loot: boolean,
  health: number,
): Option[] {
  const now = ctx.world.time;
  const partyId = character.partyId ?? null;
  const outlaw = Boolean(character.outlaw);
  const plan = plans.get(character);
  if (
    plan &&
    plan.here === here.id &&
    now - plan.at < PLAN_HOURS * HOUR &&
    plan.recovering === recovering &&
    plan.loot === loot &&
    plan.partyId === partyId &&
    plan.outlaw === outlaw
  ) {
    return plan.options;
  }
  const options: Option[] = [];
  const { traits, drives } = character;
  // Journeys elsewhere: anywhere within the nearest few places, and home.
  for (const { id, duration } of journeysFrom(ctx, character, here)) {
    const there = ctx.world.locations.get(id)!;
    const hours = duration / HOUR;
    const nearness = 1 / (1 + hours / DISTANCE_HALVING_HOURS);
    if (!recovering && there.kind === 'dungeon') {
      const terms = delveTerms(ctx, character, there.id, nearness);
      options.push({ action: { kind: 'travel', to: there.id, reason: 'delve' }, terms });
      continue;
    }
    const terms: Term[] = [];
    let reason: TravelReason = 'wander';

    if (recovering) {
      // Hurt: only towns appeal, the nearer the better, and only if not in one already.
      if (there.kind !== 'town' || here.kind === 'town') continue;
      terms.push({ value: (1 + health) * nearness, motive: DRIVE.health });
      reason = 'heal';
    } else {
      if (there.id === character.homeId) {
        terms.push({
          value: (0.1 + 0.3 * drives.companionship) * nearness,
          motive: HOME,
        });
        if (loot) {
          terms.push({ value: 0.7 * nearness, motive: LOOT });
          reason = 'home';
        }
      } else if (there.kind === 'town') {
        terms.push({ value: 0.1 * drives.companionship * nearness, motive: null });
        if (loot && here.kind !== 'town') terms.push({ value: 0.5 * nearness, motive: LOOT });
      } else {
        terms.push({ value: 0.06 * nearness, motive: null });
      }
      // The tales of a wild place keep the folk raised on them away.
      if (there.kind === 'wilderness') {
        const dread = mythFear(ctx.world, character, there.id);
        if (dread > 0) terms.push({ value: -0.3 * dread * (1.2 - traits.bravery), motive: null });
      }
      if (character.outlaw && there.kind === 'wilderness') {
        terms.push({ value: 0.4 * nearness, motive: DRIVE.wealth });
      }
      if (there.kind === 'town' && isWantedIn(character, there.id)) {
        terms.push({ value: -0.3, motive: null });
      }
      // A band is mustering there against one of the dread: the able answer the call.
      if (there.kind === 'town' && !character.outlaw) {
        for (const muster of mustersOf(ctx.world)) {
          if (muster.townId !== there.id || character.level < muster.master.level - 20) continue;
          terms.push({
            value:
              Math.min(1, drives.purpose / RESTLESS) *
              nearness *
              (0.15 + 0.3 * traits.honor + 0.3 * traits.bravery) *
              Math.min(1, muster.master.slain / 20 + 0.5),
            motive: { kind: 'dread', characterId: muster.master.id },
          });
        }
      }
      if (!hasVisited(character, there.id)) {
        terms.push({
          value: 0.3 * traits.curiosity * nearness,
          motive: { kind: 'novelty', locationId: there.id },
        });
      }
    }
    options.push({ action: { kind: 'travel', to: there.id, reason }, terms });
  }

  if (here.kind === 'town' && !character.outlaw && !recovering) {
    options.push(...huntOptions(ctx, character, here));
  }
  plans.set(character, { at: now, here: here.id, recovering, loot, partyId, outlaw, options });
  return options;
}

/** How many of the nearest places anyone weighs going to, besides home. */
const HORIZON = 7;

/**
 * The places worth weighing a journey to: the nearest few, and home. On a
 * large map, nobody plans a trip to the far side of the world on a whim.
 */
function journeysFrom(
  ctx: SimContext,
  character: Character,
  here: Location,
): readonly { readonly id: LocationId; readonly duration: number }[] {
  const near = nearbyPlaces(ctx.world, here.id);
  if (near.length <= HORIZON) return near;
  const within = near.slice(0, HORIZON);
  if (character.homeId === here.id || within.some((p) => p.id === character.homeId)) return within;
  const home = near.find((p) => p.id === character.homeId);
  return home ? [...within, home] : within;
}

/**
 * Why delve somewhere: restlessness, glory and gold, how well it went before,
 * the pull of the unknown, against the fear of what happened there.
 */
function delveTerms(
  ctx: SimContext,
  character: Character,
  place: LocationId,
  /** Scales the whole appeal, for a dungeon some way off. */
  nearness: number,
): Term[] {
  const { traits, drives } = character;
  const expectation = character.expectations[place];
  const terms: Term[] = [
    { value: 1.4 * drives.purpose ** 1.5, motive: DRIVE.purpose },
    {
      value: 0.4 * drives.glory * (0.5 + traits.bravery),
      motive: DRIVE.glory,
    },
    { value: 0.4 * wealthNeed(character), motive: DRIVE.wealth },
  ];
  if (expectation) {
    const payoff = Math.min(1, expectation.reward / 60);
    terms.push({
      value: 0.25 * payoff * (0.5 + traits.greed),
      motive: { kind: 'fond', locationId: place },
    });
  } else {
    terms.push({ value: 0.25 * traits.curiosity, motive: { kind: 'novelty', locationId: place } });
  }
  // What they fear there: what befell them, and the tales they grew up on.
  const fear = fearOf(character, place, ctx.world.time) + mythFear(ctx.world, character, place);
  if (fear > 0) terms.push({ value: -0.8 * fear * (1.2 - traits.bravery), motive: null });
  // One of the dread lairs there: a call to the brave who stand a chance, a
  // dread to everyone else.
  const masterId = ctx.world.locations.get(place)?.dungeon?.masterId;
  const master = masterId ? ctx.world.characters.get(masterId) : undefined;
  if (master && !master.death && character.level >= master.level - 8) {
    // In town, they'd raise a band from whoever would answer the call.
    const here = ctx.world.locations.get(character.locationId ?? character.homeId)!;
    const band = Math.min(
      CRUSADE_SIZE,
      1 + followersOrMembers(ctx, character) + willingRecruits(ctx, character, here, master).length,
    );
    const odds = lairOdds(character.level, band, master.level);
    const infamy = Math.min(1, master.slain / 10);
    terms.push({
      value:
        odds * (0.5 * drives.glory * traits.bravery + 0.3 * infamy * traits.honor + 0.2 * odds),
      motive: { kind: 'dread', characterId: master.id },
    });
    terms.push({ value: -0.4 * (1 - odds) * (1.2 - traits.bravery), motive: null });
  }
  // Glory and gold only call once restlessness has built up: nobody goes
  // straight back in for the sake of it.
  const eagerness = Math.min(1, drives.purpose / RESTLESS);
  for (const t of terms) t.value = t.value * nearness * (t.value > 0 ? eagerness : 1);
  return terms;
}

/**
 * Going after an outlaw: for the bounty (the honorable and the greedy), or
 * for revenge on whoever killed a friend. Only if they stand a chance.
 */
function huntOptions(ctx: SimContext, character: Character, here: Location): Option[] {
  const { traits, drives } = character;
  const options: Option[] = [];
  const eagerness = Math.min(1, drives.purpose / RESTLESS);
  for (const bounty of ctx.world.bounties.values()) {
    const outlaw = ctx.world.characters.get(bounty.outlawId);
    if (!outlaw?.outlaw || outlaw.death || outlaw.id === character.id) continue;
    const affinity = character.opinions[outlaw.id]?.affinity ?? 0;
    if (affinity > 0.3) continue; // won't hunt a friend
    const revenge = affinity <= -0.5;
    // Too content to bother, unless it's personal.
    if (eagerness < 0.3 && !revenge) continue;
    const party = 1 + followersOrMembers(ctx, character);
    const outmatched = character.level + 2 * (party - 1) < outlaw.level - 1;
    if (outmatched && !(revenge && traits.bravery >= 0.6)) continue;

    const where = outlaw.outlaw.lastSeenAt;
    const hours = (findPath(ctx.world, here.id, where)?.duration ?? Infinity) / HOUR;
    if (!Number.isFinite(hours)) continue;
    const nearness = 1 / (1 + hours / DISTANCE_HALVING_HOURS);
    const reward = Math.min(1, bounty.amount / 150);
    // Each fruitless chase makes the next less tempting.
    const persistence = 1 / (1 + (character.opinions[outlaw.id]?.hunted ?? 0));
    const terms: Term[] = [
      {
        value:
          eagerness *
          nearness *
          persistence *
          (0.05 + 0.25 * traits.honor + 0.4 * traits.greed * reward) *
          (0.5 + traits.bravery),
        motive: { kind: 'bounty', outlawId: outlaw.id },
      },
    ];
    if (revenge) {
      terms.push({
        value: 0.5 * nearness * persistence,
        motive: { kind: 'revenge', characterId: outlaw.id },
      });
    }
    options.push({
      action: { kind: 'travel', to: where, reason: 'hunt', target: outlaw.id },
      terms,
    });
  }
  // However many outlaws are wanted, only the likeliest few cross anyone's mind.
  if (options.length <= HUNTS_CONSIDERED) return options;
  const appeal = (o: Option) => o.terms.reduce((sum, t) => sum + t.value, 0);
  return options.sort((a, b) => appeal(b) - appeal(a)).slice(0, HUNTS_CONSIDERED);
}

function followersOrMembers(ctx: SimContext, character: Character): number {
  if (!character.partyId) return 0;
  return (ctx.world.parties.get(character.partyId)?.members.length ?? 1) - 1;
}

function addPastimeTerms(terms: Term[], character: Character, pastime: PastimeId): void {
  const { traits, drives } = character;
  switch (pastime) {
    case 'tavern':
      terms.push(
        { value: 0.08, motive: null },
        { value: 1.1 * drives.companionship, motive: DRIVE.companionship },
      );
      return;
    case 'market':
      terms.push({ value: 0.1 + 0.08 * traits.curiosity, motive: null });
      return;
    case 'training':
      terms.push(
        {
          value: 0.08 + 0.1 * traits.patience + (roleOf(character) === 'fighter' ? 0.05 : 0),
          motive: null,
        },
        { value: 0.25 * drives.glory, motive: DRIVE.glory },
      );
      return;
    case 'shrine': {
      const shaken = character.memories.some((m) => m.kind === 'near-death');
      terms.push({ value: 0.06 + 0.08 * traits.compassion + (shaken ? 0.1 : 0), motive: null });
      return;
    }
    case 'study': {
      // Books are hard going: worth it for the gifted, now and then for the clever.
      const aptitude = character.gifted ? 0.3 : 0.15;
      terms.push({ value: aptitude * (0.5 + traits.curiosity) - STUDY_EFFORT, motive: null });
      return;
    }
    default:
      terms.push({ value: 0.1, motive: null });
  }
}

/** The few possible lists of pastimes, worked out once each. */
const pastimeLists = new Map<string, readonly PastimeId[]>();

function pastimesAt(location: Location, character: Character): readonly PastimeId[] {
  const study = location.academy && canStudy(character);
  const key = `${location.kind}|${study}`;
  let list = pastimeLists.get(key);
  if (!list) {
    list = PASTIMES.filter(
      (p) =>
        p.kind === location.kind &&
        p.id !== 'scout' &&
        p.id !== 'lurk' &&
        (!('academy' in p && p.academy) || study),
    ).map((p) => p.id);
    pastimeLists.set(key, list);
  }
  return list;
}

/** Only the gifted, or the unusually clever or spiritual, take up the arcane. */
function canStudy(character: Character): boolean {
  return character.gifted || character.stats.wits >= 14 || character.stats.spirit >= 14;
}

/** Everything in the pack except legendary items, which adventurers keep. */
export function sellable(character: Character): LootItem[] {
  return character.pack.filter(isSellable);
}

/**
 * Packs only grow by appending or are replaced whole, so whether one holds
 * anything to sell is known from the array and its length. Veterans carry
 * piles of legendary items they never sell; this saves rescanning them.
 */
const sellableCache = new WeakMap<LootItem[], { length: number; any: boolean }>();

function hasSellable(character: Character): boolean {
  const pack = character.pack;
  const cached = sellableCache.get(pack);
  if (cached && cached.length === pack.length) return cached.any;
  const any = pack.some(isSellable);
  sellableCache.set(pack, { length: pack.length, any });
  return any;
}

function isSellable(item: LootItem): boolean {
  return !('gear' in item) || item.gear.rarity !== 'legendary';
}
