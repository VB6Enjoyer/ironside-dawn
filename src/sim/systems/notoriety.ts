import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type {
  Character,
  CharacterId,
  Crime,
  CrimeKind,
  Location,
  LocationId,
  News,
  Notoriety,
  Standing,
} from '../model';
import { isAlive } from './condition';
import { nearbyPlaces } from './roads';
import { charactersAt } from './whereabouts';

/**
 * Reputation that travels (0.3.0, ROADMAP.md "The Outlaws Update", step 4):
 * a crime is known first in the town it was against, or the nearest; word of
 * it then goes out along the roads with travelers and merchants, reaching
 * nearer towns sooner and the farthest never. What each town has heard sets
 * how it treats someone, and fades with the years, except a murder.
 */

/** How much a town holds a crime against its doer, before its worth is counted. */
const HEAT: Record<CrimeKind, number> = {
  robbery: 1.5,
  murder: 4,
  waylay: 1.2,
  burglary: 1,
  theft: 0.6,
  holdup: 1.5,
  extortion: 1,
  vandalism: 0.8,
};
/** Each this much gold taken or ruined weighs like one more crime. */
const HEAT_PER_GOLD = 1 / 100;
/** A foiled attempt weighs this much of one that came off. */
const FOILED = 0.5;
/** Towns farther from a crime care about it this much less than its own. */
const ELSEWHERE = 0.6;
/** Heat at which a town treats someone as suspected, and as unwelcome. */
const SUSPECTED = 0.5;
const UNWELCOME = 2.5;
/** Heat halves over this many days: towns forget, slowly. */
const HALF_LIFE_DAYS = 360;
const DAILY_FADE = 0.5 ** (1 / HALF_LIFE_DAYS);
/** Below this, a town has forgotten all but the count. */
const FORGOTTEN = 0.05;
/** News takes about this many times the road's travel time, carried by whoever goes that way. */
const NEWS_PACE = 1.5;
/** How long before word leaves the town where it started. */
const NEWS_START = 12 * HOUR;
/** Hours of road beyond which petty news is never heard; a murder carries twice as far. */
const NEWS_REACH_HOURS = 240;

const ORDER: Record<Standing, number> = { welcome: 0, suspected: 1, unwelcome: 2, barred: 3 };

/** How a town treats someone, from what it has heard of them. */
export function standingIn(character: Character, townId: LocationId): Standing {
  const known = character.notoriety[townId];
  if (!known) return 'welcome';
  if (known.murders > 0) return 'barred';
  if (known.heat >= UNWELCOME) return 'unwelcome';
  if (known.heat >= SUSPECTED) return 'suspected';
  return 'welcome';
}

/** Whether a town shuts its doors to someone: no inn, no trade, no lingering. */
export function isShunned(character: Character, townId: LocationId): boolean {
  return ORDER[standingIn(character, townId)] >= ORDER.unwelcome;
}

export function isBarred(character: Character, townId: LocationId): boolean {
  return standingIn(character, townId) === 'barred';
}

/** Whether a town has heard enough of someone to keep them at arm's length. */
export function isNotorious(character: Character, townId: LocationId): boolean {
  return ORDER[standingIn(character, townId)] >= ORDER.suspected;
}

/** Whether a town has posters up for someone: it has heard of any crime of theirs. */
export function isKnownIn(character: Character, townId: LocationId): boolean {
  return (character.notoriety[townId]?.crimes ?? 0) > 0;
}

/** How much worse a town's prices are for someone it suspects. */
export function priceSuspicion(character: Character, townId: LocationId): number {
  return standingIn(character, townId) === 'welcome' ? 0 : 0.2;
}

/**
 * A known crime: its town hears of it at once, and word sets out for every
 * other town within reach, to arrive in road time and a bit.
 */
export function spreadNews(ctx: SimContext, character: Character, crime: Crime): void {
  if (!crime.known || crime.townId === null) return;
  hear(ctx, character, crime.townId, crime, true);
  const reach = NEWS_REACH_HOURS * HOUR * (crime.kind === 'murder' ? 2 : 1);
  const rng = ctx.rng.outlaws;
  const pending: [LocationId, number][] = [];
  for (const { id, duration } of nearbyPlaces(ctx.world, crime.townId)) {
    if (duration > reach) break;
    if (ctx.world.locations.get(id)?.kind !== 'town') continue;
    const delay = NEWS_START + duration * NEWS_PACE * (0.7 + 0.6 * rng.next());
    pending.push([id, crime.at + Math.round(delay)]);
  }
  if (pending.length === 0) return;
  pending.sort((a, b) => b[1] - a[1]);
  ctx.world.news.push({ characterId: character.id, crime, pending });
}

/** Once a day: news reaches the towns it was bound for, and old grudges fade. */
export function newsDay(ctx: SimContext): void {
  const world = ctx.world;
  const now = world.time;
  pinCrimes(ctx);
  if (world.news.length > 0) {
    const still: News[] = [];
    for (const item of world.news) {
      const character = world.characters.get(item.characterId);
      // Nobody passes on news of the dead.
      if (!character || character.death) continue;
      while (item.pending.length > 0 && item.pending[item.pending.length - 1]![1] <= now) {
        const [townId] = item.pending.pop()!;
        hear(ctx, character, townId, item.crime, false);
      }
      if (item.pending.length > 0) still.push(item);
    }
    world.news = still;
  }
  for (const character of world.characters.values()) {
    if (!isAlive(character)) continue;
    for (const id in character.notoriety) {
      const known = character.notoriety[id as LocationId]!;
      known.heat = known.heat < FORGOTTEN ? 0 : known.heat * DAILY_FADE;
    }
  }
}

/** A town hears of a crime: it thinks worse of the one who did it, and may say so. */
function hear(
  ctx: SimContext,
  character: Character,
  townId: LocationId,
  crime: Crime,
  first: boolean,
): void {
  const before = standingIn(character, townId);
  const known: Notoriety = (character.notoriety[townId] ??= {
    heat: 0,
    crimes: 0,
    murders: 0,
    value: 0,
    heardAt: crime.at,
  });
  // A botched attempt is held against them less than a crime that came off.
  const weight = (first ? 1 : ELSEWHERE) * (crime.foiled ? FOILED : 1);
  known.heat += (HEAT[crime.kind] + crime.value * HEAT_PER_GOLD) * weight;
  known.crimes++;
  if (crime.kind === 'murder') known.murders++;
  known.value += crime.value;
  known.heardAt = ctx.world.time;
  const after = standingIn(character, townId);
  if (ORDER[after] <= ORDER[before] || after === 'welcome') return;
  // Mere suspicion spreads quietly; only where it happened is it news.
  if (after === 'suspected' && !first) return;
  // Turned out of a town that now bars them; they leave by the next decision.
  const driven = after === 'barred' && character.locationId === townId;
  ctx.emit(
    {
      type: 'outlaw.notorious',
      data: {
        characterId: character.id,
        locationId: townId,
        standing: after,
        ...(driven ? { driven } : {}),
      },
    },
    [character.id],
    townId,
  );
}

/** Crimes kept on someone's record; older ones are dropped, their weight long since felt. */
const RECORD_CAP = 60;
/** What a crime adds to an outlaw's bounty: a set sum by kind, and a share of its worth. */
const BOUNTY: Record<CrimeKind, number> = {
  robbery: 25,
  murder: 60,
  waylay: 15,
  burglary: 10,
  theft: 5,
  holdup: 20,
  extortion: 10,
  vandalism: 5,
};
const BOUNTY_SHARE = 0.25;
/** The most a town will put on anyone's head, and what each murder adds to that. */
const BOUNTY_CAP = 300;
const BOUNTY_CAP_PER_MURDER = 150;

/**
 * A crime is done: it goes on the record; if anyone knows who did it, an
 * outlaw's bounty grows, posted by the town it was against (or the victim's)
 * if none stands yet, and word of it sets out from there.
 */
export function recordCrime(
  ctx: SimContext,
  character: Character,
  crime: Crime,
  /** False when an old crime, already on the record, comes to light. */
  fresh = true,
): void {
  const record = character.outlaw;
  if (fresh) {
    character.crimes.push(crime);
    if (character.crimes.length > RECORD_CAP) character.crimes.shift();
    if (record) {
      record.crimes++;
      if (crime.kind === 'murder') record.murders++;
      record.lastCrimeAt = crime.at;
    }
  }
  if (!crime.known) return;
  if (record) {
    record.lastSeenAt = crime.locationId;
    const victimHome = crime.victimId
      ? ctx.world.characters.get(crime.victimId)?.homeId
      : undefined;
    const townId = victimHome ?? crime.townId;
    const existing = ctx.world.bounties.get(character.id);
    if (existing || townId) {
      const bounty = existing ?? {
        outlawId: character.id,
        amount: 0,
        townId: townId!,
        postedAt: crime.at,
      };
      const cap = BOUNTY_CAP + BOUNTY_CAP_PER_MURDER * record.murders;
      bounty.amount = Math.min(
        Math.max(cap, bounty.amount),
        bounty.amount + BOUNTY[crime.kind] + Math.round(crime.value * BOUNTY_SHARE),
      );
      ctx.world.bounties.set(character.id, bounty);
      ctx.emit(
        {
          type: 'bounty.post',
          data: { characterId: character.id, locationId: bounty.townId, amount: bounty.amount },
        },
        [character.id],
        bounty.townId,
      );
    }
  }
  spreadNews(ctx, character, crime);
}

/** The town word of something at a place reaches first: the place itself, or the nearest town within a few days. */
export function nearestTown(ctx: SimContext, locationId: LocationId): LocationId | null {
  if (ctx.world.locations.get(locationId)?.kind === 'town') return locationId;
  for (const { id, duration } of nearbyPlaces(ctx.world, locationId)) {
    if (duration > NEAR_TOWN_HOURS * HOUR) return null;
    if (ctx.world.locations.get(id)?.kind === 'town') return id;
  }
  return null;
}
const NEAR_TOWN_HOURS = 72;

/**
 * Someone has paid what they owed a town: it holds nothing more against them
 * in gold, but still eyes them warily until time and good conduct win its
 * trust back.
 */
export function settle(character: Character, townId: LocationId): void {
  const known = character.notoriety[townId];
  if (!known) return;
  known.value = 0;
  known.heat = Math.min(Math.max(known.heat, SUSPECTED), (SUSPECTED + UNWELCOME) / 2);
}

// ---------------------------------------------------------------------------
// Crimes that go unheard of (0.3.0)

/**
 * The chance anyone can name the culprit of a crime against someone: likelier
 * the more people saw it (`witnesses`, victims who lived among them) and the
 * better they knew the culprit, much likelier in a town than out in the wilds
 * or down a dungeon, and a little less for the light of foot.
 */
export function identifyChance(
  culprit: Character,
  place: Location,
  witnesses: number,
  familiarity = 0,
): number {
  if (witnesses <= 0) return 0;
  const base = place.kind === 'town' ? 0.8 : place.kind === 'dungeon' ? 0.35 : 0.55;
  const seen = base + 0.2 * witnesses + 0.4 * familiarity;
  return Math.min(0.98, Math.max(0.02, seen * (1 - slipOf(culprit))));
}

/** How much a culprit's quiet feet help them go unrecognized: nothing below 40 stealth, up to 0.3. */
export function slipOf(culprit: Character): number {
  return Math.max(0, culprit.skills.stealth - 40) / 200;
}

/** Those at a place who could see something there, besides the ones named. */
export function bystanders(
  ctx: SimContext,
  locationId: LocationId,
  except: ReadonlySet<CharacterId>,
): number {
  let n = 0;
  for (const c of charactersAt(ctx.world, locationId)) {
    if (!except.has(c.id) && isAlive(c) && !c.outlaw) n++;
  }
  return n;
}

/** Days on average before an unwitnessed murder is pinned on its killer; much longer with no body. */
const PIN_DAYS = 360;
const PIN_DAYS_HIDDEN = 4 * 360;
/** Share of hidden murders that are never pinned on anyone. */
const NEVER_PINNED = 0.6;

/**
 * A crime nobody pinned on anyone: in time, word may get out of who did it,
 * a long time for a murder with no body.
 */
export function leaveUnsolved(
  ctx: SimContext,
  character: Character,
  crime: Crime,
  hidden: boolean,
): void {
  const rng = ctx.rng.outlaws;
  if (hidden && rng.chance(NEVER_PINNED)) return;
  const mean = hidden ? PIN_DAYS_HIDDEN : PIN_DAYS;
  const days = -Math.log(1 - rng.next()) * mean;
  ctx.world.unsolved.push({
    characterId: character.id,
    crime,
    pinAt: crime.at + Math.round(days * 86_400),
  });
}

/** Once a day: old crimes come to light, and are told as news from then. */
function pinCrimes(ctx: SimContext): void {
  const world = ctx.world;
  if (world.unsolved.length === 0) return;
  const now = world.time;
  world.unsolved = world.unsolved.filter((item) => {
    if (item.pinAt > now) return true;
    const culprit = world.characters.get(item.characterId);
    // Nobody bothers with the crimes of the dead.
    if (!culprit || culprit.death) return false;
    const townId = item.crime.townId;
    if (townId === null) return false;
    ctx.emit(
      {
        type: 'crime.pinned',
        data: {
          characterId: culprit.id,
          locationId: townId,
          crime: item.crime.kind,
          at: item.crime.at,
          ...(item.crime.victimId ? { victimId: item.crime.victimId } : {}),
        },
      },
      [culprit.id],
      townId,
    );
    // The record now says it is known; a murdered victim's death, who did it and when it came out.
    const i = culprit.crimes.findIndex(
      (c) =>
        c.at === item.crime.at && c.kind === item.crime.kind && c.victimId === item.crime.victimId,
    );
    if (i >= 0) culprit.crimes[i] = { ...culprit.crimes[i]!, known: true };
    const victim = item.crime.victimId ? world.characters.get(item.crime.victimId) : undefined;
    if (victim?.death) victim.death = { ...victim.death, pinnedAt: now };
    recordCrime(ctx, culprit, { ...item.crime, known: true, at: now }, false);
    return false;
  });
}
