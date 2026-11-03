import {
  GOODS,
  goodDef,
  NEEDS_PER_HEAD,
  PROFESSIONS,
  professionDef,
  SPECIES,
  type GoodId,
  type Goods,
  type ProfessionDef,
  type ProfessionId,
  type Recipe,
  type SpeciesId,
} from '../../content';
import type { Rng } from '../core/rng';
import type { SimContext } from '../context';
import type {
  Belief,
  Character,
  Location,
  LocationId,
  Market,
  MarketDay,
  TownAgent,
  World,
} from '../model';
import { burn, mint } from './ledger';

/**
 * Markets (ROADMAP.md Phase 7), after Doran & Parberry, "Emergent Economies
 * for Role Playing Games" (2010). Nobody sets prices. Each day every trade in
 * a town makes what it can, eats and wears out its tools, then bids for what
 * it needs and asks for what it has spare, at prices drawn from its own
 * beliefs. The bids and asks are matched, and each agent's beliefs move with
 * how its orders fared.
 *
 * Named characters don't join the daily auction. They deal with the town's
 * trading house, which keeps a little of everything and quotes a spread
 * around what it believes things are worth.
 */

export const GOOD_IDS: readonly GoodId[] = GOODS.map((g) => g.id);
const HISTORY_DAYS = 360;
/** The trading house buys this far below what it thinks a thing is worth, and sells this far above. */
const HOUSE_SPREAD = 0.15;
/** The trading house keeps this many days of the town's use of every good. */
const HOUSE_STOCK_DAYS = 2;
/** And a stock of what adventurers buy. */
const HOUSE_RETAIL: Goods = { potions: 12, arms: 4, armor: 3 };
/** Share of its gold the trading house spends at one day's auction. */
const HOUSE_BUDGET = 0.1;
/** Gold the trading house keeps in hand, per townsperson, before paying out its surplus. */
const HOUSE_RESERVE_PER_HEAD = 2;
/** Daily share of the trading house's surplus paid out in wages and custom to the trades. */
const HOUSE_PAYOUT = 0.02;
/** Beyond this many times its target, the trading house pays less for more of a good. */
const HOUSE_GLUT = 2;
/** Daily share of the workforce that moves from the worst-paid trade to the best-paid. */
const LABOR_DRIFT = 0.004;
/** Prices stay within these multiples of a good's worth: guild rules and common sense. */
const PRICE_RANGE = [1 / 3, 3] as const;
/** The trading house writes off stock beyond this many times its target: sold downriver, or spoiled. */
const HOUSE_WRITE_OFF = 20;
/** Trades keep within these multiples of their usual share of the townsfolk. */
const SHARE_RANGE = [0.3, 2.5] as const;
/** Trades keep this many days of what they consume, and of their inputs. */
const NEED_DAYS = 5;
const INPUT_DAYS = 4;
/** Beyond this many days of their own output in stock, makers slow down. */
const GLUT_DAYS = 10;
/** Daily share of each agent's gold that leaves the towns (tithes, wages). */
const UPKEEP = 0.001;
/**
 * How much worse prices get for someone who can't understand the townsfolk:
 * haggling by gestures, through an interpreter, or not at all.
 */
const LANGUAGE_PENALTY = 0.4;
/** Language level at which a tongue is fully understood for trade. */
const FLUENT = 70;

/** A town's everyday basket, for its price index. */
const BASKET: Goods = { food: 10, ore: 1, tools: 0.5, clothes: 1, potions: 0.2, arms: 0.1 };

// ---------------------------------------------------------------------------
// Setting up

function initialBeliefs(): Partial<Record<GoodId, Belief>> {
  return Object.fromEntries(
    GOODS.map((g) => [g.id, { low: g.value * 0.85, high: g.value * 1.15 }]),
  );
}

/** A town's market, its trades staffed from its commoners. */
/** What each townsperson uses up in a day, as a list: the market runs every day in every town. */
const NEEDS = Object.entries(NEEDS_PER_HEAD) as [GoodId, number][];

export function createMarket(world: World, town: Location): Market | null {
  const economy = town.economy;
  if (!economy) return null;
  const population = townSize(town);
  const agents: TownAgent[] = [];
  for (const profession of PROFESSIONS) {
    const share = economy.workforce[profession.id] ?? 0;
    if (share <= 0) continue;
    if ('needs' in profession && profession.needs === 'mine' && !economy.mine) continue;
    const workers = Math.round(population * share);
    agents.push({
      id: profession.id,
      share,
      workers,
      gold: 20 + workers * 3,
      stock: { food: workers * (NEEDS_PER_HEAD.food ?? 0) * 3 },
      beliefs: initialBeliefs(),
      vigor: 1,
      income: 0,
    });
  }
  const house: TownAgent = {
    id: 'house',
    share: 0,
    workers: 0,
    gold: 1_000 + population * 2,
    stock: { potions: 8, arms: 2, armor: 1 },
    beliefs: initialBeliefs(),
    vigor: 1,
    income: 0,
  };
  mint(world, 'founding', house.gold + agents.reduce((sum, a) => sum + a.gold, 0));
  const market: Market = {
    townId: town.id,
    agents,
    house,
    houseTargets: {},
    today: {},
    history: {},
  };
  market.houseTargets = houseTargets(market);
  return market;
}

function townSize(town: Location): number {
  return Object.values(town.population).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

// ---------------------------------------------------------------------------
// The going rate

/** What a good is going for in this town: the last price paid, or failing that, its worth. */
export function goingPrice(market: Market, good: GoodId): number {
  return market.today[good]?.price ?? market.history[good]?.at(-1) ?? goodDef(good).value;
}

function beliefMean(agent: TownAgent, good: GoodId): number {
  const b = agent.beliefs[good];
  return b ? (b.low + b.high) / 2 : goodDef(good).value;
}

/**
 * What the trading house pays for one unit, and what it asks. With a glut of
 * something in its stores, it pays less for more of it.
 */
export function houseQuote(market: Market, good: GoodId): { bid: number; ask: number } {
  const worth = beliefMean(market.house, good);
  const target = Math.max(1, market.houseTargets[good] ?? 0);
  const glut = (market.house.stock[good] ?? 0) / target;
  const appetite = Math.min(1, Math.max(0.1, 1 - (glut - HOUSE_GLUT) / 8));
  return { bid: worth * (1 - HOUSE_SPREAD) * appetite, ask: worth * (1 + HOUSE_SPREAD) };
}

/**
 * How well a character understands a town's people, 0 to 1: their command of
 * each people's tongue, weighted by how many of that people live there.
 */
export function understanding(character: Character, town: Location): number {
  const total = townSize(town);
  if (total <= 0) return 1;
  let u = 0;
  for (const [species, count] of Object.entries(town.population) as [SpeciesId, number][]) {
    const level = character.languages[SPECIES[species].language] ?? 0;
    u += (count / total) * Math.min(1, level / FLUENT);
  }
  return u;
}

/** Price multipliers for a character dealing in this town: worse the less they understand. */
export function terms(character: Character, town: Location): { buy: number; sell: number } {
  const penalty = LANGUAGE_PENALTY * (1 - understanding(character, town));
  return { buy: 1 + penalty, sell: 1 - penalty };
}

/** A town's prices against where they started, for a basket of everyday goods. */
export function priceIndex(market: Market): number {
  let now = 0;
  let base = 0;
  for (const [good, weight] of Object.entries(BASKET) as [GoodId, number][]) {
    now += weight * goingPrice(market, good);
    base += weight * goodDef(good).value;
  }
  return now / base;
}

// ---------------------------------------------------------------------------
// A market day

interface Order {
  readonly agent: TownAgent;
  readonly good: GoodId;
  readonly quantity: number;
  readonly price: number;
  left: number;
}

/** One day in one town's market. `outputOf` gives each trade's output multiplier (troubles). */
export function marketDay(
  ctx: SimContext,
  market: Market,
  town: Location,
  outputOf: (profession: ProfessionId) => number,
): void {
  const rng = ctx.rng.markets;
  const population = townSize(town);
  for (const agent of market.agents) agent.workers = Math.round(population * agent.share);
  market.houseTargets = houseTargets(market);

  for (const agent of market.agents) {
    const def = professionDef(agent.id as ProfessionId);
    produce(agent, def, outputOf(def.id as ProfessionId));
    consume(agent);
  }

  const bids: Order[] = [];
  const asks: Order[] = [];
  for (const agent of market.agents) {
    placeOrders(rng, agent, targetsOf(agent), bids, asks, 0.9);
  }
  placeOrders(rng, market.house, market.houseTargets, bids, asks, HOUSE_BUDGET);

  const sales = new Map<TownAgent, number>();
  const today: Partial<Record<GoodId, MarketDay>> = {};
  for (const good of GOOD_IDS) {
    today[good] = clear(
      rng,
      bids.filter((o) => o.good === good),
      asks.filter((o) => o.good === good),
      sales,
    );
  }
  market.today = today;
  for (const agent of market.agents) {
    const earned = (sales.get(agent) ?? 0) / Math.max(1, agent.workers);
    agent.income += (earned - agent.income) * 0.1;
  }
  driftLabor(market, town);
  payOut(market, population);
  writeOff(market);

  for (const good of GOOD_IDS) {
    const history = (market.history[good] ??= []);
    history.push(roundPrice(goingPrice(market, good)));
    if (history.length > HISTORY_DAYS) history.shift();
  }

  for (const agent of [...market.agents, market.house]) {
    const tithe = agent.gold * UPKEEP;
    agent.gold -= tithe;
    burn(ctx.world, 'upkeep', tithe);
  }
}

const roundPrice = (n: number) => Math.round(n * 100) / 100;

/**
 * Workers leave the worst-paid trade for the best-paid, a little each day
 * (Doran & Parberry's agents change jobs), within limits set by the land.
 */
function driftLabor(market: Market, town: Location): void {
  const usual = (agent: TownAgent) => town.economy!.workforce[agent.id as ProfessionId] ?? 0;
  const movable = market.agents.filter((a) => a.workers > 0);
  if (movable.length < 2) return;
  const byIncome = [...movable].sort((a, b) => a.income - b.income);
  const from = byIncome.find((a) => a.share - LABOR_DRIFT >= usual(a) * SHARE_RANGE[0]);
  const to = [...byIncome]
    .reverse()
    .find((a) => a.share + LABOR_DRIFT <= usual(a) * SHARE_RANGE[1]);
  if (!from || !to || from === to || to.income <= from.income * 1.2) return;
  from.share -= LABOR_DRIFT;
  to.share += LABOR_DRIFT;
}

/** Stock far beyond what the trading house can ever move is sold off downriver, or spoils. */
function writeOff(market: Market): void {
  for (const good of GOOD_IDS) {
    const limit = Math.max(10, (market.houseTargets[good] ?? 0) * HOUSE_WRITE_OFF);
    if ((market.house.stock[good] ?? 0) > limit) market.house.stock[good] = limit;
  }
}

/**
 * The trading house pays out what it doesn't need: wages for porters and
 * clerks, the inns' kitchens, the town watch. It's how the gold adventurers
 * and merchants spend finds its way to the townsfolk.
 */
function payOut(market: Market, population: number): void {
  const surplus = market.house.gold - population * HOUSE_RESERVE_PER_HEAD;
  if (surplus <= 0) return;
  const total = market.agents.reduce((sum, a) => sum + a.workers, 0);
  if (total <= 0) return;
  const paid = surplus * HOUSE_PAYOUT;
  market.house.gold -= paid;
  for (const agent of market.agents) agent.gold += (paid * agent.workers) / total;
}

/** What an agent needs for its people each day: more, but for food, the richer they are. */
function dailyNeeds(agent: TownAgent): Goods {
  const needs: Goods = {};
  const prosperity = Math.min(3, Math.max(0.5, agent.gold / Math.max(1, agent.workers) / 10));
  for (const [good, perHead] of NEEDS) {
    needs[good] = perHead * agent.workers * (good === 'food' ? 1 : prosperity);
  }
  return needs;
}

/** Inputs a day of full work would use, spread across the recipes (those that pay, if asked). */
function dailyInputs(agent: TownAgent, paying = false): Goods {
  const def = professionDef(agent.id as ProfessionId);
  const runs = agent.workers * def.work;
  const inputs: Goods = {};
  for (const recipe of def.recipes) {
    if (paying && recipeProfit(agent, recipe) <= 0) continue;
    for (const [good, qty] of Object.entries(recipe.inputs) as [GoodId, number][]) {
      inputs[good] = (inputs[good] ?? 0) + (qty * runs) / def.recipes.length;
    }
  }
  return inputs;
}

/** What one run of a recipe earns, by the agent's own beliefs. */
function recipeProfit(agent: TownAgent, recipe: Recipe): number {
  const value = (goods: Goods) =>
    (Object.entries(goods) as [GoodId, number][]).reduce(
      (sum, [g, n]) => sum + n * beliefMean(agent, g),
      0,
    );
  return value(recipe.outputs) - value(recipe.inputs);
}

function produce(agent: TownAgent, def: ProfessionDef, multiplier: number): void {
  let capacity = agent.workers * def.work * agent.vigor * multiplier;
  const recipes = [...def.recipes]
    .map((recipe) => ({ recipe, profit: recipeProfit(agent, recipe) }))
    .filter((r) => r.profit > 0 || Object.keys(r.recipe.inputs).length === 0)
    .sort((a, b) => b.profit - a.profit);

  for (const { recipe } of recipes) {
    if (capacity <= 0) break;
    let runs = capacity;
    for (const [good, qty] of Object.entries(recipe.inputs) as [GoodId, number][]) {
      runs = Math.min(runs, (agent.stock[good] ?? 0) / qty);
    }
    // Makers with a glut of their goods slow down: nobody is buying.
    for (const [good, qty] of Object.entries(recipe.outputs) as [GoodId, number][]) {
      const daily = qty * agent.workers * def.work;
      const days = daily > 0 ? (agent.stock[good] ?? 0) / daily : 0;
      if (days > GLUT_DAYS) runs *= Math.max(0, 1 - (days - GLUT_DAYS) / GLUT_DAYS);
    }
    if (runs <= 0) continue;
    for (const [good, qty] of Object.entries(recipe.inputs) as [GoodId, number][]) {
      // Never below nothing, whatever the rounding.
      agent.stock[good] = Math.max(0, (agent.stock[good] ?? 0) - qty * runs);
    }
    for (const [good, qty] of Object.entries(recipe.outputs) as [GoodId, number][]) {
      agent.stock[good] = (agent.stock[good] ?? 0) + qty * runs;
    }
    capacity -= runs;
  }
}

/**
 * Townsfolk eat and wear out their tools; going short of either makes them
 * less productive. The prosperous also buy more of everything but food.
 */
function consume(agent: TownAgent): void {
  const needs = dailyNeeds(agent);
  let fed = 1;
  let equipped = 1;
  for (const [good, need] of Object.entries(needs) as [GoodId, number][]) {
    if (need <= 0) continue;
    const have = agent.stock[good] ?? 0;
    const used = Math.min(have, need);
    agent.stock[good] = have - used;
    if (good === 'food') fed = used / need;
    if (good === 'tools') equipped = used / need;
  }
  agent.vigor = (0.6 + 0.4 * fed) * (0.85 + 0.15 * equipped);
}

/** How much of each good an agent wants to hold: inputs only for work that pays. */
function targetsOf(agent: TownAgent): Goods {
  const targets: Goods = {};
  const needs = dailyNeeds(agent);
  const inputs = dailyInputs(agent, true);
  for (const good of GOOD_IDS) {
    const target = (needs[good] ?? 0) * NEED_DAYS + (inputs[good] ?? 0) * INPUT_DAYS;
    if (target > 0) targets[good] = target;
  }
  return targets;
}

/** The trading house keeps a couple of days of the whole town's use of everything, and retail stock. */
function houseTargets(market: Market): Goods {
  const targets: Goods = { ...HOUSE_RETAIL };
  for (const agent of market.agents) {
    const needs = dailyNeeds(agent);
    const inputs = dailyInputs(agent);
    for (const good of GOOD_IDS) {
      const use = (needs[good] ?? 0) + (inputs[good] ?? 0);
      if (use > 0) targets[good] = (targets[good] ?? 0) + use * HOUSE_STOCK_DAYS;
    }
  }
  return targets;
}

/** Bids for what's short of target, food first; asks for whatever is well over it. */
function placeOrders(
  rng: Rng,
  agent: TownAgent,
  targets: Goods,
  bids: Order[],
  asks: Order[],
  budgetShare: number,
): void {
  const price = (good: GoodId) => {
    const b = agent.beliefs[good]!;
    return b.low + rng.next() * (b.high - b.low);
  };
  let budget = Math.max(0, agent.gold * budgetShare);
  const wanted = GOOD_IDS.filter((g) => (targets[g] ?? 0) > (agent.stock[g] ?? 0) + 0.01).sort(
    (a, b) => Number(b === 'food') - Number(a === 'food'),
  );
  for (const good of wanted) {
    const p = price(good);
    const quantity = Math.min(targets[good]! - (agent.stock[good] ?? 0), budget / p);
    if (quantity < 0.01) continue;
    budget -= quantity * p;
    bids.push({ agent, good, quantity, price: p, left: quantity });
  }
  for (const good of GOOD_IDS) {
    const spare = (agent.stock[good] ?? 0) - (targets[good] ?? 0) * 1.2;
    if (spare < 0.01) continue;
    const p = price(good);
    asks.push({ agent, good, quantity: spare, price: p, left: spare });
  }
}

/** Matches the highest bids with the lowest asks, each trade at the midpoint (Doran & Parberry). */
function clear(rng: Rng, bids: Order[], asks: Order[], sales: Map<TownAgent, number>): MarketDay {
  shuffle(rng, bids);
  shuffle(rng, asks);
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  let volume = 0;
  let paid = 0;
  let i = 0;
  let j = 0;
  while (i < bids.length && j < asks.length) {
    const bid = bids[i]!;
    const ask = asks[j]!;
    if (bid.price < ask.price) break;
    if (bid.agent === ask.agent) {
      j++;
      continue;
    }
    const price = (bid.price + ask.price) / 2;
    const quantity = Math.min(bid.left, ask.left, bid.agent.gold / price);
    if (quantity < 1e-6) {
      i++;
      continue;
    }
    bid.agent.gold -= quantity * price;
    ask.agent.gold += quantity * price;
    sales.set(ask.agent, (sales.get(ask.agent) ?? 0) + quantity * price);
    bid.agent.stock[bid.good] = (bid.agent.stock[bid.good] ?? 0) + quantity;
    ask.agent.stock[ask.good] = (ask.agent.stock[ask.good] ?? 0) - quantity;
    bid.left -= quantity;
    ask.left -= quantity;
    volume += quantity;
    paid += quantity * price;
    if (bid.left < 1e-6) i++;
    if (ask.left < 1e-6) j++;
  }

  const price = volume > 0 ? paid / volume : null;
  for (const order of bids) learn(order, 'buy', price);
  for (const order of asks) learn(order, 'sell', price);
  const range = (orders: Order[]) =>
    orders.length === 0
      ? null
      : ([
          Math.min(...orders.map((o) => o.price)),
          Math.max(...orders.map((o) => o.price)),
        ] as const);
  return {
    price,
    volume,
    demand: bids.reduce((sum, o) => sum + o.quantity, 0),
    supply: asks.reduce((sum, o) => sum + o.quantity, 0),
    bidRange: range(bids),
    askRange: range(asks),
  };
}

/**
 * An agent's belief after an order. Filled: it grows surer of the price, and
 * tries for a slightly better one next time. Unfilled: a buyer offers more, a
 * seller asks less, and both drift toward what others paid.
 */
function learn(order: Order, side: 'buy' | 'sell', marketPrice: number | null): void {
  const belief = order.agent.beliefs[order.good]!;
  const base = goodDef(order.good).value;
  const filled = 1 - order.left / order.quantity;
  let mid = (belief.low + belief.high) / 2;
  let width = belief.high - belief.low;

  if (filled >= 0.95) {
    if (marketPrice !== null) mid += (marketPrice - mid) * 0.3;
    width *= 0.92;
    mid *= side === 'buy' ? 0.99 : 1.01;
  } else {
    const step = (1 - filled) * mid * 0.03;
    mid += side === 'buy' ? step : -step;
    width *= 1.05;
    if (marketPrice !== null) mid += (marketPrice - mid) * 0.2;
  }
  mid = Math.min(base * PRICE_RANGE[1], Math.max(base * PRICE_RANGE[0], mid));
  width = Math.min(mid, Math.max(mid * 0.04, width));
  belief.low = mid - width / 2;
  belief.high = mid + width / 2;
}

function shuffle<T>(rng: Rng, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

// ---------------------------------------------------------------------------
// Dealing with the trading house

/**
 * A character sells goods to the trading house, as many as it can pay for.
 * Returns what was sold and the gold it brought (whole coins).
 */
export function sellToHouse(
  market: Market,
  character: Character,
  town: Location,
  goods: Goods,
  /** Sell each good entire or not at all. */
  whole = false,
): { sold: Goods; gold: number } {
  const deal = terms(character, town);
  const sold: Goods = {};
  let gold = 0;
  if (!deal) return { sold, gold };
  for (const [good, units] of Object.entries(goods) as [GoodId, number][]) {
    if (!(units > 0)) continue;
    const price = houseQuote(market, good).bid * deal.sell;
    const affordable = Math.min(units, (market.house.gold - gold) / price);
    if (affordable <= 0 || (whole && affordable < units)) continue;
    sold[good] = affordable;
    gold += affordable * price;
    market.house.stock[good] = (market.house.stock[good] ?? 0) + affordable;
  }
  // To the nearest coin, but never more than the house holds.
  const coins = Math.min(Math.round(gold), Math.floor(market.house.gold));
  market.house.gold -= coins;
  character.gold += coins;
  return { sold, gold: coins };
}

/** What `units` of a good would cost a character here, in whole coins, or null if they can't deal. */
export function priceToBuy(
  market: Market,
  character: Character,
  town: Location,
  good: GoodId,
  units: number,
): number | null {
  const deal = terms(character, town);
  if (!deal) return null;
  return Math.ceil(houseQuote(market, good).ask * deal.buy * units);
}

/** A character buys from the trading house's stock. Returns the units bought and the cost. */
export function buyFromHouse(
  market: Market,
  character: Character,
  town: Location,
  good: GoodId,
  units: number,
): { units: number; gold: number } {
  const have = market.house.stock[good] ?? 0;
  const wanted = Math.min(units, have);
  const unitPrice = priceToBuy(market, character, town, good, 1);
  if (unitPrice === null || wanted <= 0) return { units: 0, gold: 0 };
  const affordable = Math.min(wanted, Math.floor(character.gold / unitPrice));
  if (affordable <= 0) return { units: 0, gold: 0 };
  const gold = priceToBuy(market, character, town, good, affordable)!;
  if (gold > character.gold) return { units: 0, gold: 0 };
  character.gold -= gold;
  market.house.gold += gold;
  market.house.stock[good] = have - affordable;
  return { units: affordable, gold };
}

/** Gold paid to a town's trading house (lodging, restitution). */
export function payHouse(market: Market, character: Character, gold: number): void {
  const paid = Math.min(gold, character.gold);
  character.gold -= paid;
  market.house.gold += paid;
}

export function marketOf(world: World, townId: LocationId): Market | undefined {
  return world.markets.get(townId);
}
