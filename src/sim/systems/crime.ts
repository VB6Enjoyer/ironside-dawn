import { goodDef, type GoodId, type Goods } from '../../content';
import { DAY, HOUR } from '../core/time';
import type { SimContext } from '../context';
import type {
  Character,
  Crime,
  CrimeKind,
  Location,
  LocationId,
  Market,
  TownAgent,
} from '../model';
import { isAlive } from './condition';
import { goingPrice } from './market';
import { wealthNeed } from './mind';
import { isBarred, recordCrime, slipOf, standingIn } from './notoriety';
import { temptationReasons, turnOutlaw, weakConscience, worthOf } from './outlaws';
import { practice } from './progress';
import { nearbyPlaces, roadsFrom } from './roads';
import { followersOf } from './social';

/**
 * Crimes against the nameless (0.3.0, ROADMAP.md "The Outlaws Update", step
 * 3): outlaws prey on the world beyond the named characters. They waylay
 * caravans on the roads, steal from shops and rob them at blade point, burgle
 * houses by night, make farms pay, and spoil stores out of spite. What they
 * take comes out of the town's economy; stolen goods are sold to fences in
 * other towns. Some who are no outlaws will steal too, now and then, when it
 * looks safe and worth it.
 */

/** Stolen goods fetch this share of the going price from a fence. */
const FENCE_SHARE = 0.4;
/** An outlaw lies low this many days after any crime against the nameless. */
const LIE_LOW_DAYS = 5;
/** And lets this many pass before working the same town again. */
const TOWN_GAP_DAYS = 30;
/** Someone who is no outlaw steals at most once in this many days. */
const OCCASIONAL_GAP_DAYS = 120;
/** The least chance of getting away with it at which someone who is no outlaw will try. */
const SAFE_ENOUGH = 0.8;
/** How far a town's farms reach: wild places this many road hours away. */
const FARMS_HOURS = 12;
/** Chance per hour of lurking that a caravan comes by a road joining towns of a thousand souls. */
const CARAVAN_RATE = 0.008;
/** Fine for a thief caught in the act, as a multiple of what they meant to take. */
const FINE = 2;
const MIN_FINE = 20;

/** Crimes done in town by day. */
export type DayCrime = 'theft' | 'holdup';

// ---------------------------------------------------------------------------
// Who would, and how likely they are to get away with it

/** How sharp a town's watch is: bigger towns keep a sharper one, and keep a closer eye on the suspect. */
function watchOf(character: Character, town: Location): number {
  const people = Object.values(town.population).reduce<number>((s, n) => s + (n ?? 0), 0);
  const base = 25 + 12 * Math.log10(Math.max(100, people) / 100);
  const standing = standingIn(character, town.id);
  return base + (standing === 'suspected' ? 15 : standing === 'unwelcome' ? 30 : 0);
}

/** The chance of getting away with a crime of this kind here. */
export function chanceOf(character: Character, kind: CrimeKind, town: Location): number {
  const { stealth, lockpicking } = character.skills;
  const watch = watchOf(character, town);
  const arms = armsOf(character);
  const skill =
    kind === 'burglary'
      ? 0.5 * stealth + 0.5 * lockpicking
      : kind === 'holdup' || kind === 'extortion' || kind === 'waylay'
        ? 4 * character.level + 0.5 * arms - (kind === 'extortion' ? 15 : 0)
        : 0.75 * stealth + 0.25 * lockpicking;
  const against = kind === 'holdup' ? watch * 1.4 : watch;
  return 1 / (1 + Math.exp(-(skill - against) / 10));
}

function armsOf(character: Character): number {
  const { blades, axes, blunt, polearms, bows } = character.skills;
  return Math.max(blades, axes, blunt, polearms, bows);
}

/** Days since their last crime in this town (or anywhere, with no town given). */
function daysSinceCrime(ctx: SimContext, character: Character, townId?: LocationId): number {
  const crimes = character.crimes;
  for (let i = crimes.length - 1; i >= 0; i--) {
    const c = crimes[i]!;
    if (townId === undefined || c.townId === townId) return (ctx.world.time - c.at) / DAY;
  }
  return Infinity;
}

/**
 * Whether someone who is no outlaw would steal here now: they have a good
 * reason (the reasons that tempt people into crime), a conscience that gives
 * way, a need or a greed for it, and it looks safe: not their home town, not
 * a town that already eyes them, and long enough since the last time.
 */
function willingNow(
  ctx: SimContext,
  character: Character,
  town: Location,
  kind: CrimeKind,
): boolean {
  if (character.calling !== 'adventurer' || character.outlaw) return false;
  if (town.id === character.homeId || standingIn(character, town.id) !== 'welcome') return false;
  if (weakConscience(character) < 0.5) return false;
  if (daysSinceCrime(ctx, character) < OCCASIONAL_GAP_DAYS) return false;
  if (chanceOf(character, kind, town) < SAFE_ENOUGH) return false;
  if (wealthNeed(character) < 0.15 && character.traits.greed < 0.6) return false;
  return temptationReasons(ctx, character, ctx.world.time).length > 0;
}

/** Whether an outlaw is lying low after a crime, spending the takings, keeping off the roads. */
export function lyingLow(ctx: SimContext, character: Character): boolean {
  return daysSinceCrime(ctx, character) < LIE_LOW_DAYS;
}

/** Whether an outlaw would work here: not barred, and not too soon after the last time. */
function outlawMayWork(ctx: SimContext, character: Character, townId: LocationId) {
  return (
    Boolean(character.outlaw) &&
    !isBarred(character, townId) &&
    daysSinceCrime(ctx, character) >= LIE_LOW_DAYS &&
    daysSinceCrime(ctx, character, townId) >= TOWN_GAP_DAYS
  );
}

/**
 * Crimes someone might do in town by day, with how much each appeals: the
 * take, against the risk, for the greedy and the needy.
 */
export function dayCrimes(
  ctx: SimContext,
  character: Character,
  town: Location,
): { crime: DayCrime; appeal: number }[] {
  if (!ctx.world.markets.has(town.id)) return [];
  const outlaw = outlawMayWork(ctx, character, town.id);
  const kinds: DayCrime[] = outlaw ? ['theft', 'holdup'] : [];
  if (!outlaw && willingNow(ctx, character, town, 'theft')) kinds.push('theft');
  // Crime is an outlaw's trade, worth more to the greedy, and to anyone the emptier their purse.
  const want = (outlaw ? 0.3 : 0.1) * (0.5 + character.traits.greed) + 0.4 * wealthNeed(character);
  return kinds.map((crime) => {
    const p = chanceOf(character, crime, town);
    const nerve = 0.5 + 0.5 * character.traits.bravery;
    const risk = (1 - p) * (crime === 'holdup' ? 0.6 : 0.3) * (1.5 - nerve);
    // Walking into a counting house with a drawn blade takes more than greed.
    const boldness = crime === 'holdup' ? 0.3 + 0.4 * character.traits.bravery : 1;
    return { crime, appeal: want * p * boldness - risk };
  });
}

/**
 * Farms near a town an outlaw might make pay, from a wild place nearby: the
 * nearest town within reach that doesn't bar them, if it's been a while.
 */
export function farmsToExtort(
  ctx: SimContext,
  character: Character,
  here: Location,
): Location | null {
  if (!character.outlaw || here.kind !== 'wilderness') return null;
  for (const { id, duration } of nearbyPlaces(ctx.world, here.id)) {
    if (duration > FARMS_HOURS * HOUR) return null;
    const town = ctx.world.locations.get(id);
    if (town?.kind !== 'town' || !ctx.world.markets.has(id)) continue;
    return outlawMayWork(ctx, character, id) ? town : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Doing it

/** A crime by day in town, or extortion of a town's farms from a wild place near it. */
export function commitCrime(
  ctx: SimContext,
  character: Character,
  here: Location,
  kind: DayCrime | 'extortion',
): void {
  const town = kind === 'extortion' ? farmsToExtort(ctx, character, here) : here;
  const market = town ? ctx.world.markets.get(town.id) : undefined;
  if (!town || !market) return;
  const rng = ctx.rng.outlaws;
  const success = rng.chance(chanceOf(character, kind, town));
  let gold = 0;
  let goods: Goods = {};
  if (success) {
    if (kind === 'theft') goods = lift(ctx, market, character);
    else if (kind === 'holdup') gold = takeGold(market.house, 0.1, 20 + 6 * character.level);
    else gold = takeGold(farmersOf(market), 0.08, 20 + 5 * character.level);
  }
  if (kind === 'theft') practice(ctx, character, 'stealth', 0.6, here.id);
  // A holdup or a shakedown is done to people's faces; a thief is only named if caught.
  // A masked face or a quick escape lets a few slip unnamed (0.3.0).
  const known = (kind !== 'theft' || !success) && !rng.chance(slipOf(character) / 2);
  // Caught at it by force of arms: the watch draws blood before they get away.
  const hurt = !success && kind !== 'theft' ? wound(ctx, character) : false;
  finish(ctx, character, here, town, kind, { gold, goods, success, known, hurt });
}

/**
 * Night in town: an outlaw, or a willing thief, may break into a house before
 * sleeping; a cruel or spiteful outlaw may spoil a store. Returns whether they
 * tried anything.
 */
export function nightWork(ctx: SimContext, character: Character, town: Location): boolean {
  const market = ctx.world.markets.get(town.id);
  if (!market || !isAlive(character)) return false;
  const rng = ctx.rng.outlaws;
  const outlaw = outlawMayWork(ctx, character, town.id);
  if (outlaw) {
    const spite =
      Math.max(0, 0.3 - character.traits.compassion) +
      (standingIn(character, town.id) === 'unwelcome' ? 0.05 : 0);
    if (rng.chance(spite * 0.1)) {
      vandalise(ctx, character, town, market);
      return true;
    }
  }
  const willing = outlaw || willingNow(ctx, character, town, 'burglary');
  if (!willing) return false;
  const p = chanceOf(character, 'burglary', town);
  const urge = (0.05 + 0.4 * wealthNeed(character)) * p;
  if (!rng.chance(outlaw ? urge : urge * 0.5)) return false;
  const success = rng.chance(p);
  const gold = success
    ? takeGold(householdOf(ctx, market), 0.05, 20 + character.skills.lockpicking / 2)
    : 0;
  practice(ctx, character, 'lockpicking', 0.8, town.id);
  practice(ctx, character, 'stealth', 0.4, town.id);
  // A clean job leaves nobody the wiser; a botched one may be seen.
  const known = !success && rng.chance(0.6 * (1 - slipOf(character)));
  const hurt = !success && rng.chance(0.3) ? wound(ctx, character) : false;
  finish(ctx, character, town, town, 'burglary', { gold, goods: {}, success, known, hurt });
  return true;
}

/** Stores spoiled or set alight, for spite: nothing gained, something lost to the town. */
function vandalise(ctx: SimContext, character: Character, town: Location, market: Market): void {
  const rng = ctx.rng.outlaws;
  const success = rng.chance(chanceOf(character, 'vandalism', town));
  const ruined: Goods = {};
  if (success) {
    const target = 20 + rng.int(0, 60);
    let worth = 0;
    for (const good of ['food', 'hides', 'herbs', 'clothes', 'tools'] as GoodId[]) {
      const have = market.house.stock[good] ?? 0;
      if (have <= 0 || worth >= target) continue;
      const value = goodDef(good).value;
      const units = Math.min(have, Math.ceil((target - worth) / value));
      market.house.stock[good] = have - units;
      ruined[good] = units;
      worth += units * value;
    }
  }
  practice(ctx, character, 'stealth', 0.4, town.id);
  const known = rng.chance((success ? 0.4 : 0.7) * (1 - slipOf(character)));
  finish(ctx, character, town, town, 'vandalism', {
    gold: 0,
    goods: {},
    success,
    known,
    hurt: false,
    ruined: worthOf(ruined),
  });
}

/**
 * The end of a spell of lurking by a road: a caravan or a band of travelers
 * may have come by, likelier on roads between big towns. The outlaws hold it
 * up if they look strong enough to, taking goods bound for the town it was
 * headed to, and the travelers' purses. A well-guarded caravan fights back.
 */
export function waylayCaravan(
  ctx: SimContext,
  character: Character,
  here: Location,
  hours: number,
): void {
  if (!character.outlaw || here.kind !== 'wilderness' || !isAlive(character)) return;
  if (daysSinceCrime(ctx, character) < LIE_LOW_DAYS) return;
  const world = ctx.world;
  const rng = ctx.rng.outlaws;
  const towns: Location[] = [];
  let traffic = 0;
  for (const { to } of roadsFrom(world, here.id)) {
    const place = world.locations.get(to);
    if (place?.kind !== 'town' || !world.markets.has(to)) continue;
    towns.push(place);
    traffic += Object.values(place.population).reduce<number>((s, n) => s + (n ?? 0), 0) / 1000;
  }
  if (towns.length === 0 || !rng.chance(Math.min(0.6, CARAVAN_RATE * traffic * hours))) return;
  const bound = rng.pick(towns);
  const market = world.markets.get(bound.id)!;
  const gang = [character, ...followersOf(ctx, character)].filter(isAlive);
  const guards = rng.int(0, 4);
  // Two guards' worth for every outlaw: the bigger the gang, the likelier the caravan yields.
  const p = chanceOf(character, 'waylay', bound) * Math.min(1, (gang.length * 2) / (guards + 1));
  const success = rng.chance(p);
  let gold = 0;
  let goods: Goods = {};
  if (success) {
    goods = takeGoods(market, 40 + rng.int(0, 160));
    gold = takeGold(market.house, 0.05, 10 + rng.int(0, 50));
  }
  // The travelers live to tell of it, and most will know them again.
  const known = rng.chance(0.7 * (1 - slipOf(character)));
  const hurt = !success ? wound(ctx, character) : false;
  finish(ctx, character, here, bound, 'waylay', { gold, goods, success, known, hurt });
}

interface Outcome {
  readonly gold: number;
  readonly goods: Goods;
  readonly success: boolean;
  readonly known: boolean;
  readonly hurt: boolean;
  /** Worth spoiled rather than taken. */
  readonly ruined?: number;
}

/** Takes the haul, records the crime, and deals with a thief caught at it. */
function finish(
  ctx: SimContext,
  character: Character,
  here: Location,
  town: Location,
  kind: CrimeKind,
  outcome: Outcome,
): void {
  const { gold, goods, success, known, hurt } = outcome;
  character.gold += gold;
  for (const [good, units] of Object.entries(goods) as [GoodId, number][]) {
    // Healing draughts are kept for themselves; the rest goes to a fence.
    if (good === 'potions') {
      character.potions += Math.floor(units);
      continue;
    }
    character.cargo[good] = (character.cargo[good] ?? 0) + units;
    if (!character.stolenFrom.includes(town.id)) character.stolenFrom.push(town.id);
  }
  const value = gold + worthOf(goods) + (outcome.ruined ?? 0);
  // Someone who is no outlaw, caught at it, pays a fine on the spot, or is outlawed.
  let fine: number | undefined;
  const caught = known && !character.outlaw;
  if (caught) {
    fine = Math.max(MIN_FINE, Math.round(FINE * Math.max(value, 20)));
    const market = ctx.world.markets.get(town.id);
    if (character.gold >= fine && market) {
      character.gold -= fine;
      market.house.gold += fine;
    } else {
      fine = undefined;
    }
  }
  ctx.emit(
    {
      type: 'crime.commit',
      data: {
        characterId: character.id,
        locationId: here.id,
        crime: kind,
        townId: town.id,
        gold,
        ...(Object.keys(goods).length > 0 ? { goods } : {}),
        value,
        known,
        foiled: !success,
        ...(hurt ? { hurt } : {}),
        ...(fine !== undefined ? { fine } : {}),
      },
    },
    [character.id],
    here.id,
  );
  if (caught && fine === undefined) {
    const reason = temptationReasons(ctx, character, ctx.world.time)[0] ?? 'want';
    turnOutlaw(ctx, character, reason);
  }
  const crime: Crime = {
    kind,
    at: ctx.world.time,
    locationId: here.id,
    townId: town.id,
    value,
    known,
    ...(success ? {} : { foiled: true }),
  };
  recordCrime(ctx, character, crime);
}

// ---------------------------------------------------------------------------
// Fences

/** Whether someone carries stolen goods they could sell here: a market far from where they were taken. */
export function canFence(character: Character, town: Location): boolean {
  if (character.calling === 'merchant' || character.stolenFrom.length === 0) return false;
  if (character.stolenFrom.includes(town.id) || isBarred(character, town.id)) return false;
  for (const units of Object.values(character.cargo)) if ((units ?? 0) > 0) return true;
  return false;
}

/**
 * Sells stolen goods to a fence, who pays a share of the going price, as much
 * as the trading house behind them can cover, and passes them on to it.
 */
export function fence(ctx: SimContext, character: Character, town: Location): void {
  const market = ctx.world.markets.get(town.id);
  if (!market || !canFence(character, town)) return;
  const sold: Goods = {};
  let gold = 0;
  for (const [good, units] of Object.entries(character.cargo) as [GoodId, number][]) {
    if (!(units > 0)) continue;
    const price = goingPrice(market, good) * FENCE_SHARE;
    const affordable = Math.min(units, (market.house.gold - gold) / price);
    if (affordable <= 0) continue;
    sold[good] = affordable;
    gold += affordable * price;
    market.house.stock[good] = (market.house.stock[good] ?? 0) + affordable;
    const left = units - affordable;
    if (left > 0.01) character.cargo[good] = left;
    else delete character.cargo[good];
  }
  const coins = Math.min(Math.round(gold), Math.floor(market.house.gold));
  if (Object.keys(sold).length === 0) return;
  market.house.gold -= coins;
  character.gold += coins;
  character.goldEarned += coins;
  if (Object.keys(character.cargo).length === 0) character.stolenFrom = [];
  ctx.emit(
    {
      type: 'crime.fence',
      data: { characterId: character.id, locationId: town.id, goods: sold, gold: coins },
    },
    [character.id],
    town.id,
  );
}

// ---------------------------------------------------------------------------
// Helpers

/** Takes up to `share` of an agent's gold, and no more than `most`. */
function takeGold(agent: TownAgent | undefined, share: number, most: number): number {
  if (!agent) return 0;
  const gold = Math.floor(Math.min(agent.gold * share, most));
  if (gold <= 0) return 0;
  agent.gold -= gold;
  return gold;
}

function farmersOf(market: Market): TownAgent | undefined {
  return market.agents.find((a) => a.id === 'farmers' && a.gold > 0) ?? richest(market.agents);
}

/** A house to break into: someone's in one of the trades, likelier the trades with more to take. */
function householdOf(ctx: SimContext, market: Market): TownAgent | undefined {
  const withGold = market.agents.filter((a) => a.gold >= 1);
  if (withGold.length === 0) return undefined;
  return ctx.rng.outlaws.weighted(withGold.map((a) => [a, a.gold] as const));
}

function richest(agents: readonly TownAgent[]): TownAgent | undefined {
  let best: TownAgent | undefined;
  for (const a of agents) if (!best || a.gold > best.gold) best = a;
  return best && best.gold > 0 ? best : undefined;
}

/** Small things worth lifting: a few draughts, a blade, a bolt of silk. */
const LIFTABLE: readonly GoodId[] = ['potions', 'arms', 'clothes', 'tools', 'silk', 'reagents'];

/** Slips a few goods from the trading house's shelves. */
function lift(ctx: SimContext, market: Market, character: Character): Goods {
  const rng = ctx.rng.outlaws;
  const choices = LIFTABLE.filter((g) => (market.house.stock[g] ?? 0) >= 1);
  if (choices.length === 0) return {};
  const good = rng.pick(choices);
  const most = good === 'arms' ? 1 : good === 'potions' ? 3 : 4;
  const units = Math.min(market.house.stock[good] ?? 0, rng.int(1, most));
  // Quicker hands take a little more.
  const extra = character.skills.stealth >= 60 && (market.house.stock[good] ?? 0) > units ? 1 : 0;
  const taken = Math.floor(units + extra);
  market.house.stock[good] = (market.house.stock[good] ?? 0) - taken;
  return taken > 0 ? { [good]: taken } : {};
}

/** Takes goods worth about `worth` from a town's stores: a caravan's load that never arrived. */
function takeGoods(market: Market, worth: number): Goods {
  const taken: Goods = {};
  let got = 0;
  const stock = Object.entries(market.house.stock) as [GoodId, number][];
  stock.sort((a, b) => goodDef(b[0]).value - goodDef(a[0]).value);
  for (const [good, have] of stock) {
    if (got >= worth) break;
    if (have < 1 || good === 'food') continue;
    const value = goodDef(good).value;
    const units = Math.min(Math.floor(have), Math.ceil((worth - got) / value));
    if (units <= 0) continue;
    market.house.stock[good] = have - units;
    taken[good] = units;
    got += units * value;
  }
  return taken;
}

/** Hurt getting away: a fifth to half their health, never the last of it. */
function wound(ctx: SimContext, character: Character): boolean {
  const loss = Math.round(character.maxHp * (0.2 + 0.3 * ctx.rng.outlaws.next()));
  character.hp = Math.max(1, character.hp - loss);
  return true;
}
