import type { GoodId, Goods, ProfessionId, ShockId } from '../../content';
import type { LocationId, RouteId } from './ids';

/** What an agent believes a good is worth: it will trade somewhere in [low, high]. */
export interface Belief {
  low: number;
  high: number;
}

/**
 * One of a town's trades, all its workers as a single agent (ARCHITECTURE.md
 * §4.2: statistical populations), or the town's trading house, which deals
 * with named characters and has no workers.
 */
export interface TownAgent {
  readonly id: ProfessionId | 'house';
  /** Share of the townsfolk in this trade. Workers drift toward the trades that pay. */
  share: number;
  workers: number;
  gold: number;
  stock: Goods;
  /** Private price beliefs (Doran & Parberry), per good. */
  readonly beliefs: Partial<Record<GoodId, Belief>>;
  /** How well fed and equipped they were yesterday, 0 to 1; it sets how much they make. */
  vigor: number;
  /** Gold earned from sales per worker per day, smoothed. */
  income: number;
}

/** A day's trading in one good. */
export interface MarketDay {
  /** Average price paid, or null if nothing changed hands. */
  readonly price: number | null;
  readonly volume: number;
  /** Units wanted and units offered. */
  readonly demand: number;
  readonly supply: number;
  /** The range of prices asked and bid. */
  readonly bidRange: readonly [number, number] | null;
  readonly askRange: readonly [number, number] | null;
}

export interface Market {
  readonly townId: LocationId;
  /** The town's trades, in a fixed order. */
  readonly agents: TownAgent[];
  /** The trading house: buys from adventurers and merchants, sells them goods, keeps the inns. */
  readonly house: TownAgent;
  /** How much of each good the trading house means to keep. */
  houseTargets: Goods;
  /** The last day's trading, good by good. */
  today: Partial<Record<GoodId, MarketDay>>;
  /** The going price each day for the last year, oldest first. */
  readonly history: Partial<Record<GoodId, number[]>>;
}

/** Trouble for a while: a failed harvest in a town, or a road held by beasts. */
export interface Shock {
  readonly id: ShockId;
  readonly locationId: LocationId | null;
  readonly routeId: RouteId | null;
  readonly since: number;
  readonly until: number;
}

export type MoneySource =
  /** Gold the trades and trading houses held when the world began. */
  | 'founding'
  /** Purses that new adventurers and merchants bring with them. */
  | 'newcomers'
  /** Coin found in dungeons and on creatures. */
  | 'treasure'
  /** Rings, goblets and gems, assayed for their metal and stones. */
  | 'assay';

export type MoneySink =
  /** Purses lost with the dead. */
  | 'dead'
  /** Tithes and wages paid out of the towns. */
  | 'upkeep';

/** Every coin made or destroyed, so a run's report can catch inflation (ROADMAP.md Phase 7). */
export interface Ledger {
  readonly minted: Partial<Record<MoneySource, number>>;
  readonly burned: Partial<Record<MoneySink, number>>;
}

/** What a merchant last saw of a town's prices. */
export interface PriceNote {
  readonly t: number;
  /** What the trading house paid and asked, per good. */
  readonly bid: Goods;
  readonly ask: Goods;
}
