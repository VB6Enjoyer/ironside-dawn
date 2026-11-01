import type { GoodId, Goods } from '../../content';
import { DAY, HOUR } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Location, LocationId, PriceNote } from '../model';
import { fearOf } from './mind';
import { buyFromHouse, GOOD_IDS, houseQuote, sellToHouse, terms } from './market';
import { findPath } from './roads';
import { startJourney } from './travel';

/**
 * Merchants (ROADMAP.md Phase 7): they buy where things are cheap, haul them
 * where they are dear, and so tie the towns' prices together. They plan from
 * what they've seen of each town's prices, which goes stale, and weigh the
 * profit against the road: bandits, beasts, and their own nerve. Speaking the
 * townsfolk's tongue gets them better prices.
 */

/** Units a merchant's wagon holds. */
export const WAGON = 30;
/** A run must promise at least this much to be worth the road. */
const MIN_PROFIT = 12;
/** Notes older than this many days are trusted half as much. */
const STALE_DAYS = 30;
/** A merchant's time on the road is worth this much gold an hour, when weighing runs. */
const HOURLY_COST = 0.5;
/** Each known danger along a route puts this share of the cargo's worth at risk. */
const DANGER_SHARE = 0.25;
/** Share of their gold a merchant puts into one run. */
const STAKE = 0.7;
/** A run must promise at least this share over what the cargo costs. */
const MIN_MARGIN = 0.15;
/**
 * A town's trading house takes about this many days of the town's use of a
 * good before its price sags; merchants know roughly what a town uses.
 */
const ABSORB_DAYS = 3;

export interface TradePlan {
  readonly destinationId: LocationId;
  readonly goods: Goods;
  readonly cost: number;
  readonly expected: number;
}

/** What a town's trading house pays and asks right now, as a merchant notes it. */
export function notePrices(ctx: SimContext, character: Character, town: Location): void {
  const market = ctx.world.markets.get(town.id);
  if (!market) return;
  const bid: Goods = {};
  const ask: Goods = {};
  for (const good of GOOD_IDS) {
    const quote = houseQuote(market, good);
    bid[good] = quote.bid;
    ask[good] = quote.ask;
  }
  character.priceBook[town.id] = { t: ctx.world.time, bid, ask };
}

/** Two merchants who can talk swap what they know of prices: each keeps the fresher note. */
export function sharePrices(a: Character, b: Character): void {
  const towns = new Set([...Object.keys(a.priceBook), ...Object.keys(b.priceBook)]);
  for (const id of towns as Set<LocationId>) {
    const na = a.priceBook[id];
    const nb = b.priceBook[id];
    if (!na || (nb && nb.t > na.t)) a.priceBook[id] = nb;
    else if (!nb || na.t > nb.t) b.priceBook[id] = na;
  }
}

/** Sells the whole cargo here. Returns the gold it brought. */
export function unload(ctx: SimContext, character: Character, town: Location): number {
  const market = ctx.world.markets.get(town.id);
  if (!market || !hasCargo(character)) return 0;
  const { sold, gold } = sellToHouse(market, character, town, character.cargo);
  if (gold === 0) return 0;
  const share = soldShare(character.cargo, sold);
  const paid = character.cargoPaid * share;
  for (const [good, units] of Object.entries(sold) as [GoodId, number][]) {
    const left = (character.cargo[good] ?? 0) - units;
    if (left > 0.01) character.cargo[good] = left;
    else delete character.cargo[good];
  }
  character.cargoPaid = hasCargo(character) ? character.cargoPaid - paid : 0;
  character.goldEarned += Math.max(0, gold - Math.round(paid));
  ctx.emit(
    {
      type: 'trade.unload',
      data: {
        characterId: character.id,
        locationId: town.id,
        goods: sold,
        gold,
        profit: paid > 0 ? gold - Math.round(paid) : null,
      },
    },
    [character.id],
    town.id,
  );
  return gold;
}

function soldShare(cargo: Goods, sold: Goods): number {
  const total = Object.values(cargo).reduce<number>((a, n) => a + (n ?? 0), 0);
  const gone = Object.values(sold).reduce<number>((a, n) => a + (n ?? 0), 0);
  return total > 0 ? Math.min(1, gone / total) : 1;
}

export function hasCargo(character: Character): boolean {
  return Object.values(character.cargo).some((n) => (n ?? 0) > 0.01);
}

/**
 * The best run from here: a destination and the goods to take there, or null
 * if nothing is worth the road.
 */
/** The longest haul a merchant plans, in road hours. */
const MAX_HAUL_HOURS = 96;

export function planRun(ctx: SimContext, character: Character, here: Location): TradePlan | null {
  const world = ctx.world;
  const market = world.markets.get(here.id);
  const buyTerms = terms(character, here);
  if (!market || !buyTerms) return null;
  const now = world.time;
  let best: { plan: TradePlan; score: number } | null = null;
  const rivalsBound = rivalCargo(ctx, character);
  // What everything costs here, worked out once for every destination.
  const asks = GOOD_IDS.map((good) => houseQuote(market, good).ask * buyTerms.buy);

  for (const [id, note] of Object.entries(character.priceBook) as [LocationId, PriceNote][]) {
    if (id === here.id) continue;
    const there = world.locations.get(id);
    const sellTerms = there ? terms(character, there) : null;
    const path = findPath(world, here.id, id);
    if (!there || !sellTerms || !path) continue;
    const hours = path.duration / HOUR;
    // On a large map, nobody hauls goods to the far side of the world.
    if (hours > MAX_HAUL_HOURS) continue;
    const trust = 1 / (1 + (now - note.t) / DAY / STALE_DAYS);
    const destination = world.markets.get(id);
    const rivals = rivalsBound.get(id) ?? {};

    // The goods worth carrying there, best margin first, as far as gold and wagon allow.
    const margins = GOOD_IDS.map((good, i) => {
      const buy = asks[i]!;
      // What rivals already haul there will have filled the house's stores.
      const room = Math.max(1, (destination?.houseTargets[good] ?? 0) * ABSORB_DAYS);
      const crowding = Math.max(0.2, 1 - (rivals[good] ?? 0) / room);
      const sell = (note.bid[good] ?? 0) * sellTerms.sell * crowding;
      // Stale notes are trusted less: the expected gain shrinks toward nothing.
      return { good, buy, gain: (sell - buy) * trust };
    })
      .filter((m) => m.gain > m.buy * MIN_MARGIN && (market.house.stock[m.good] ?? 0) >= 1)
      .sort((a, b) => b.gain / b.buy - a.gain / a.buy);

    let room = WAGON;
    // A merchant never stakes everything on one run.
    let purse = character.gold * STAKE;
    let cost = 0;
    let expected = 0;
    const goods: Goods = {};
    for (const m of margins) {
      const units = Math.floor(Math.min(room, purse / m.buy, market.house.stock[m.good] ?? 0));
      if (units < 1) continue;
      goods[m.good] = units;
      room -= units;
      purse -= units * m.buy;
      cost += units * m.buy;
      expected += units * m.gain;
    }
    if (cost === 0) continue;

    const danger = routeDanger(ctx, character, here.id, path.stops);
    const risk = danger * DANGER_SHARE * cost * (1.2 - character.traits.bravery);
    const profit = expected - risk - hours * HOURLY_COST;
    if (profit < MIN_PROFIT) continue;
    const score = profit / (hours + 4);
    if (!best || score > best.score) {
      best = { plan: { destinationId: id, goods, cost, expected }, score };
    }
  }
  return best?.plan ?? null;
}

/** What other merchants are already hauling to each town, by good: news travels with the wagons. */
function rivalCargo(ctx: SimContext, character: Character): Map<LocationId, Goods> {
  const bound = new Map<LocationId, Goods>();
  for (const other of ctx.world.characters.values()) {
    if (other.calling !== 'merchant' || other === character || other.death) continue;
    if (other.goal?.kind !== 'trade' || !other.goal.locationId) continue;
    let total = bound.get(other.goal.locationId);
    if (!total) bound.set(other.goal.locationId, (total = {}));
    for (const [good, units] of Object.entries(other.cargo) as [GoodId, number][]) {
      total[good] = (total[good] ?? 0) + units;
    }
  }
  return bound;
}

/**
 * How dangerous a route looks to this merchant: places they've come to fear,
 * and wanted outlaws last seen along the way.
 */
function routeDanger(
  ctx: SimContext,
  character: Character,
  from: LocationId,
  stops: readonly LocationId[],
): number {
  const now = ctx.world.time;
  const places = new Set<LocationId>([from, ...stops]);
  let danger = 0;
  for (const id of places) danger += fearOf(character, id, now);
  for (const bounty of ctx.world.bounties.values()) {
    const outlaw = ctx.world.characters.get(bounty.outlawId);
    if (outlaw?.outlaw && !outlaw.death && places.has(outlaw.outlaw.lastSeenAt)) danger += 1;
  }
  return danger;
}

/** Buys the planned cargo and sets out. Returns false if it came to nothing. */
export function setOut(
  ctx: SimContext,
  character: Character,
  here: Location,
  plan: TradePlan,
): boolean {
  const market = ctx.world.markets.get(here.id)!;
  const bought: Goods = {};
  let paid = 0;
  for (const [good, units] of Object.entries(plan.goods) as [GoodId, number][]) {
    const deal = buyFromHouse(market, character, here, good, units);
    if (deal.units <= 0) continue;
    bought[good] = deal.units;
    character.cargo[good] = (character.cargo[good] ?? 0) + deal.units;
    paid += deal.gold;
  }
  if (paid === 0) return false;
  character.cargoPaid += paid;
  ctx.emit(
    {
      type: 'trade.load',
      data: {
        characterId: character.id,
        locationId: here.id,
        goods: bought,
        gold: paid,
        destinationId: plan.destinationId,
      },
    },
    [character.id],
    here.id,
  );
  character.goal = {
    kind: 'trade',
    locationId: plan.destinationId,
    why: [{ kind: 'profit' }],
  };
  return startJourney(ctx, character, plan.destinationId, 'trade', character.goal.why);
}

/** Where else the cargo would fetch the most, by what the merchant knows, or null. */
export function bestOutlet(
  ctx: SimContext,
  character: Character,
  here: Location,
): LocationId | null {
  const world = ctx.world;
  let best: { id: LocationId; worth: number } | null = null;
  for (const [id, note] of Object.entries(character.priceBook) as [LocationId, PriceNote][]) {
    if (id === here.id) continue;
    const there = world.locations.get(id);
    const sellTerms = there ? terms(character, there) : null;
    const path = findPath(world, here.id, id);
    if (!there || !sellTerms || !path) continue;
    let worth = -(path.duration / HOUR) * HOURLY_COST;
    for (const [good, units] of Object.entries(character.cargo) as [GoodId, number][]) {
      worth += units * (note.bid[good] ?? 0) * sellTerms.sell;
    }
    if (worth > 0 && (!best || worth > best.worth)) best = { id, worth };
  }
  return best?.id ?? null;
}

/** Where to go for news of prices: the reachable town seen longest ago, if long enough ago. */
export function staleTown(
  ctx: SimContext,
  character: Character,
  here: Location,
): LocationId | null {
  const now = ctx.world.time;
  let oldest: { id: LocationId; t: number } | null = null;
  for (const market of ctx.world.markets.values()) {
    if (market.townId === here.id || !findPath(ctx.world, here.id, market.townId)) continue;
    const t = character.priceBook[market.townId]?.t ?? -Infinity;
    if (now - t < STALE_DAYS * DAY) continue;
    if (!oldest || t < oldest.t) oldest = { id: market.townId, t };
  }
  return oldest?.id ?? null;
}
