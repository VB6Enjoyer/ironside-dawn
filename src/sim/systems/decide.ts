import { PASTIMES, type PastimeId } from '../../content';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type { Character, CharacterId, Location, LocationId, LootItem, Motive } from '../model';
import { isDizzy, isFitToDelve, needsRecovery } from './condition';
import { fearOf, hasVisited, healthNeed, wealthNeed } from './mind';
import { isWantedIn } from './outlaws';
import { roleOf } from './progress';
import { findPath } from './roads';
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
  readonly value: number;
  readonly motive: Motive | null;
}

interface Option {
  readonly action: Action;
  readonly terms: readonly Term[];
}

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
    for (const t of option.terms) raw += t.value;
    // Uniform noise with the same spread as a gaussian of NOISE_SD, but cheaper.
    const noise = (rng.next() - 0.5) * NOISE_SD * Math.sqrt(12);
    const score = Math.max(0.01, raw * (1 + noise));
    if (scored.length === SHORTLIST && score <= scored[SHORTLIST - 1]!.score) continue;
    let i = Math.min(scored.length, SHORTLIST - 1);
    while (i > 0 && scored[i - 1]!.score < score) i--;
    scored.splice(i, 0, { option, score });
    if (scored.length > SHORTLIST) scored.pop();
  }
  const chosen = rng.weighted(scored.map((s) => [s, s.score ** SHARPNESS] as const));

  const why = chosen.option.terms
    .filter((t): t is Term & { motive: Motive } => t.motive !== null && t.value >= NAMED_REASON)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((t) => t.motive);
  return { action: chosen.option.action, why, score: chosen.score };
}

function optionsAt(ctx: SimContext, character: Character, here: Location): Option[] {
  const now = ctx.world.time;
  const options: Option[] = [];
  const { traits, drives } = character;
  const recovering = needsRecovery(character);
  const health = healthNeed(character);
  const wealth = wealthNeed(character);
  const loot = character.pack.some(isSellable);

  switch (here.kind) {
    case 'town': {
      if (loot) {
        options.push({
          action: { kind: 'sell' },
          terms: [
            // Back from a trip with a full pack, selling comes first.
            { value: 1.6, motive: { kind: 'loot' } },
            { value: 0.3 * wealth, motive: { kind: 'drive', drive: 'wealth' } },
          ],
        });
      }
      if (recovering) {
        options.push({
          action: { kind: 'convalesce' },
          terms: [{ value: 1.2 + health, motive: { kind: 'drive', drive: 'health' } }],
        });
      }
      for (const pastime of pastimesAt(here, character)) {
        options.push({
          action: { kind: 'pastime', pastime },
          // A quiet day in town has its own appeal.
          terms: [
            { value: TOWN_COMFORT * (1 - drives.purpose), motive: null },
            ...pastimeTerms(character, pastime),
            // A wanted outlaw is not welcome to linger.
            ...(isWantedIn(character, here.id) ? [{ value: -0.25, motive: null }] : []),
          ],
        });
      }
      break;
    }
    case 'dungeon': {
      if (isFitToDelve(character, now)) {
        options.push({
          action: { kind: 'delve' },
          terms: [...delveTerms(ctx, character, here.id, 1), { value: 0.05, motive: null }],
        });
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
            { value: 0.6 * wealth, motive: { kind: 'drive', drive: 'wealth' } },
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
              { value: 0.2 * wealth, motive: { kind: 'drive', drive: 'wealth' } },
              { value: 0.1 * traits.curiosity, motive: null },
            ],
          });
        }
      }
      break;
    }
  }

  // Journeys elsewhere.
  for (const there of ctx.world.locations.values()) {
    if (there.id === here.id) continue;
    const hours = (findPath(ctx.world, here.id, there.id)?.duration ?? Infinity) / HOUR;
    if (!Number.isFinite(hours)) continue;
    const nearness = 1 / (1 + hours / DISTANCE_HALVING_HOURS);
    const terms: Term[] = [];
    let reason: TravelReason = 'wander';

    if (recovering) {
      // Hurt: only towns appeal, the nearer the better, and only if not in one already.
      if (there.kind !== 'town' || here.kind === 'town') continue;
      terms.push({ value: (1 + health) * nearness, motive: { kind: 'drive', drive: 'health' } });
      reason = 'heal';
    } else if (there.kind === 'dungeon') {
      terms.push(...delveTerms(ctx, character, there.id, nearness));
      reason = 'delve';
    } else {
      if (there.id === character.homeId) {
        terms.push({
          value: (0.1 + 0.3 * drives.companionship) * nearness,
          motive: { kind: 'home' },
        });
        if (loot) {
          terms.push({ value: 0.7 * nearness, motive: { kind: 'loot' } });
          reason = 'home';
        }
      } else if (there.kind === 'town') {
        terms.push({ value: 0.1 * drives.companionship * nearness, motive: null });
        if (loot && here.kind !== 'town')
          terms.push({ value: 0.5 * nearness, motive: { kind: 'loot' } });
      } else {
        terms.push({ value: 0.06 * nearness, motive: null });
      }
      if (character.outlaw && there.kind === 'wilderness') {
        terms.push({ value: 0.4 * nearness, motive: { kind: 'drive', drive: 'wealth' } });
      }
      if (there.kind === 'town' && isWantedIn(character, there.id)) {
        terms.push({ value: -0.3, motive: null });
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
  return options;
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
    { value: 1.4 * drives.purpose ** 1.5, motive: { kind: 'drive', drive: 'purpose' } },
    {
      value: 0.4 * drives.glory * (0.5 + traits.bravery),
      motive: { kind: 'drive', drive: 'glory' },
    },
    { value: 0.4 * wealthNeed(character), motive: { kind: 'drive', drive: 'wealth' } },
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
  const fear = fearOf(character, place, ctx.world.time);
  if (fear > 0) terms.push({ value: -0.8 * fear * (1.2 - traits.bravery), motive: null });
  // Glory and gold only call once restlessness has built up: nobody goes
  // straight back in for the sake of it.
  const eagerness = Math.min(1, drives.purpose / RESTLESS);
  return terms.map((t) => ({
    motive: t.motive,
    value: t.value * nearness * (t.value > 0 ? eagerness : 1),
  }));
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

function pastimeTerms(character: Character, pastime: PastimeId): Term[] {
  const { traits, drives } = character;
  switch (pastime) {
    case 'tavern':
      return [
        { value: 0.08, motive: null },
        { value: 1.1 * drives.companionship, motive: { kind: 'drive', drive: 'companionship' } },
      ];
    case 'market':
      return [{ value: 0.1 + 0.08 * traits.curiosity, motive: null }];
    case 'training':
      return [
        {
          value: 0.08 + 0.1 * traits.patience + (roleOf(character) === 'fighter' ? 0.05 : 0),
          motive: null,
        },
        { value: 0.25 * drives.glory, motive: { kind: 'drive', drive: 'glory' } },
      ];
    case 'shrine': {
      const shaken = character.memories.some((m) => m.kind === 'near-death');
      return [{ value: 0.06 + 0.08 * traits.compassion + (shaken ? 0.1 : 0), motive: null }];
    }
    case 'study': {
      // Books are hard going: worth it for the gifted, now and then for the clever.
      const aptitude = character.gifted ? 0.3 : 0.15;
      return [{ value: aptitude * (0.5 + traits.curiosity) - STUDY_EFFORT, motive: null }];
    }
    default:
      return [{ value: 0.1, motive: null }];
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

function isSellable(item: LootItem): boolean {
  return !('gear' in item) || item.gear.rarity !== 'legendary';
}
