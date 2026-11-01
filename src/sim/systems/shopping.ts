import {
  itemBase,
  lootDef,
  type GoodId,
  type Goods,
  type MaterialId,
  type Rarity,
} from '../../content';
import type { SimContext } from '../context';
import type { Character, Item, Location, LootItem, Market } from '../model';
import { gearScore, generateItem, takeGear } from './items';
import { mint } from './ledger';
import { townsfolkAt } from './lifecycle';
import { buyFromHouse, goingPrice, payHouse, priceToBuy, sellToHouse, terms } from './market';

/**
 * Adventurers at the market (ROADMAP.md Phase 7): they sell what they
 * brought back to the trading house at its price, then buy healing draughts,
 * and now and then a better weapon or suit of armor.
 */

/** Healing draughts an adventurer likes to carry. */
export const POTIONS_WANTED = 2;
/** Gold an adventurer keeps back when buying gear. */
const GEAR_RESERVE = 50;
/** Share of their gold an adventurer will spend on one piece of gear. */
const GEAR_SHARE = 0.5;
/** Trinkets are assayed for their metal at this share of their worth. */
const TRINKET_ASSAY = 0.6;
/** Spare weapons and armor make a load of scrap iron for every this much of their worth. */
const SCRAP_GOLD_PER_ORE = 50;
/** On a night out, an adventurer spends this share of their purse beyond what they keep by. */
const CAROUSING = 0.01;
const PURSE_KEPT = 50;
/** A merchant keeps a stake to trade with. */
const MERCHANT_STAKE_KEPT = 500;

/** A night at the tavern: drink, dice and rounds for the house. The gold goes to the town. */
export function carouse(ctx: SimContext, character: Character, town: Location): void {
  const market = ctx.world.markets.get(town.id);
  const kept = character.calling === 'merchant' ? MERCHANT_STAKE_KEPT : PURSE_KEPT;
  const spend = Math.floor(Math.max(0, character.gold - kept) * CAROUSING);
  if (market && spend > 0) payHouse(market, character, spend);
}

/** What a piece of loot is on the market: so much of a good, or treasure assayed for coin. */
function marketValueOf(item: LootItem): { good: GoodId; units: number } | { assay: number } | null {
  if ('loot' in item) {
    const def = lootDef(item.loot);
    if (!def.good || !def.units) return { assay: item.value };
    return { good: def.good, units: def.units * (item.value / def.value) };
  }
  if (item.gear.rarity === 'legendary') return null; // kept
  // Spare weapons and armor go to the smiths as scrap iron; trinkets are assayed.
  const slot = itemBase(item.gear.base).slot;
  if (slot === 'trinket') return { assay: Math.round(item.value * TRINKET_ASSAY) };
  return { good: 'ore', units: item.value / SCRAP_GOLD_PER_ORE };
}

/** Whether a character can deal here at all: a market, and a tongue in common. */
export function canTrade(ctx: SimContext, character: Character, town: Location): boolean {
  return ctx.world.markets.has(town.id) && terms(character, town) !== null;
}

/** Anything in the pack the trading house would take. */
export function hasWares(character: Character): boolean {
  return character.pack.some((item) => marketValueOf(item) !== null);
}

/** Whether a market visit would be worth it for the shopping alone. */
export function wantsToShop(ctx: SimContext, character: Character, town: Location): boolean {
  if (character.potions >= POTIONS_WANTED || character.gold < 30) return false;
  const market = ctx.world.markets.get(town.id);
  if (!market) return false;
  const price = priceToBuy(market, character, town, 'potions', 1);
  return price !== null && (market.house.stock.potions ?? 0) >= 1 && character.gold >= price * 3;
}

/** What a night at an inn costs here: a day and a half's food. */
export function lodging(ctx: SimContext, town: Location): number {
  const market = ctx.world.markets.get(town.id);
  // A retired adventurer keeping an inn gives old comrades a fair price.
  const inns = townsfolkAt(ctx, town.id, 'innkeeper') > 0 ? 0.75 : 1;
  return market ? Math.max(1, Math.round(goingPrice(market, 'food') * 1.5 * inns)) : 2;
}

/** Sells the pack, then buys what's needed. */
export function visitMarket(ctx: SimContext, character: Character, town: Location): void {
  const market = ctx.world.markets.get(town.id);
  if (!market) return;
  sellPack(ctx, market, character, town);
  shop(ctx, market, character, town);
}

function sellPack(ctx: SimContext, market: Market, character: Character, town: Location): void {
  const sold: LootItem[] = [];
  let gold = 0;
  for (const item of character.pack) {
    const worth = marketValueOf(item);
    if (!worth) continue;
    if ('assay' in worth) {
      // Treasure is metal and stones: the assayers pay in new coin.
      character.gold += worth.assay;
      mint(ctx.world, 'assay', worth.assay);
      gold += worth.assay;
      sold.push(item);
      continue;
    }
    const deal = sellToHouse(market, character, town, { [worth.good]: worth.units } as Goods, true);
    if (!deal.sold[worth.good]) continue; // the house can't afford it; carried elsewhere
    gold += deal.gold;
    sold.push(item);
  }
  if (sold.length === 0) return;
  character.pack = character.pack.filter((p) => !sold.includes(p));
  character.goldEarned += gold;
  ctx.emit(
    {
      type: 'trade.sell',
      data: { characterId: character.id, locationId: town.id, items: sold, gold },
    },
    [character.id],
    town.id,
  );
}

function shop(ctx: SimContext, market: Market, character: Character, town: Location): void {
  let spent = 0;
  let potions = 0;
  const unit = priceToBuy(market, character, town, 'potions', 1);
  if (unit !== null && character.potions < POTIONS_WANTED && character.gold >= unit * 3) {
    const bought = buyFromHouse(
      market,
      character,
      town,
      'potions',
      POTIONS_WANTED - character.potions,
    );
    character.potions += bought.units;
    potions = bought.units;
    spent += bought.gold;
  }
  const item = buyGear(ctx, market, character, town);
  if (item) spent += item.price;
  if (potions === 0 && !item) return;
  if (item) takeGear(ctx, character, item.item, town.id);
  ctx.emit(
    {
      type: 'trade.shop',
      data: {
        characterId: character.id,
        locationId: town.id,
        potions,
        item: item?.item ?? null,
        gold: spent,
      },
    },
    [character.id],
    town.id,
  );
}

/**
 * Whatever the trading house has in stock is made locally, or brought in:
 * dwarven steel in a dwarven town, plain iron and steel elsewhere. A piece is
 * bought only if it beats what's worn and leaves gold to spare.
 */
function buyGear(
  ctx: SimContext,
  market: Market,
  character: Character,
  town: Location,
): { item: Item; price: number } | null {
  if (character.gold < GEAR_RESERVE * 2) return null;
  const rng = ctx.rng.items;
  for (const good of ['arms', 'armor'] as const) {
    if ((market.house.stock[good] ?? 0) < 1) continue;
    const unit = priceToBuy(market, character, town, good, 1);
    if (unit === null) continue;
    const dwarven = (town.population.dwarf ?? 0) > (town.population.human ?? 0);
    // A retired adventurer at a forge here knows what fighters need: better steel.
    const smith = townsfolkAt(ctx, town.id, 'smith') > 0 ? 0.2 : 0;
    const material: MaterialId =
      dwarven && rng.chance(0.3 + smith)
        ? 'dwarven-steel'
        : rng.chance(0.5 + smith)
          ? 'steel'
          : 'iron';
    const rarity: Rarity = rng.chance(0.3) ? 'fine' : 'common';
    const current = good === 'arms' ? character.equipment.weapon : character.equipment.armor;
    const item = generateItem(ctx, rng, {
      culture: town.culture,
      depth: 0,
      rarity,
      material,
      ...(good === 'arms'
        ? { base: character.equipment.weapon.base }
        : current
          ? { base: current.base }
          : { slot: 'armor' as const }),
    });
    // Better pieces cost as many units as they are worth more than plain iron.
    const price = Math.ceil(unit * Math.max(1, item.value / (good === 'arms' ? 40 : 50)));
    const better = !current || gearScore(item, character) > gearScore(current, character) + 0.5;
    const affordable = price <= (character.gold - GEAR_RESERVE) * GEAR_SHARE;
    if (!better || !affordable) continue;
    character.gold -= price;
    market.house.gold += price;
    market.house.stock[good] = (market.house.stock[good] ?? 0) - 1;
    return { item, price };
  }
  return null;
}
