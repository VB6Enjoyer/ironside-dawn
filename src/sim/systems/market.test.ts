import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import type { LocationId, Market, RouteId } from '../model';
import { testCharacter, testContext, town } from '../test-support';
import { economyDay } from './economy';
import { goingPrice, houseQuote, sellToHouse, terms, understanding } from './market';
import { findPath, roadsChanged } from './roads';

const id = (s: string) => s as LocationId;

/** Runs the towns' markets for some days, with nothing else going on. */
function runMarkets(
  seed: string,
  days: number,
  setup?: (ctx: ReturnType<typeof testContext>) => void,
) {
  const ctx = testContext(seed);
  setup?.(ctx);
  for (let d = 0; d < days; d++) {
    ctx.world.time += DAY;
    economyDay(ctx);
  }
  const market = (townId: string) => ctx.world.markets.get(id(townId))!;
  return { ctx, market };
}

/** Average going price over the last days of a market's history. */
const recent = (market: Market, good: 'food' | 'ore' | 'arms', days = 20) => {
  const history = market.history[good]!.slice(-days);
  return history.reduce((a, b) => a + b, 0) / history.length;
};

describe('markets', () => {
  it('give every town a market, with its trades and a trading house', () => {
    const { market } = runMarkets('setup', 0);
    expect(market('brindlemoor').agents.map((a) => a.id)).toContain('miners');
    expect(market('concordale').agents.map((a) => a.id)).not.toContain('miners');
    expect(market('saltmere').house.gold).toBeGreaterThan(0);
  });

  it('make iron cheap where it is mined and dear where it is not', () => {
    const { market } = runMarkets('iron', 90);
    expect(recent(market('concordale'), 'ore')).toBeGreaterThan(
      recent(market('brindlemoor'), 'ore'),
    );
  });

  it('keep prices within bounds', () => {
    const { market } = runMarkets('bounds', 120);
    for (const townId of ['concordale', 'brindlemoor', 'saltmere']) {
      for (const [good, history] of Object.entries(market(townId).history)) {
        for (const price of history!) {
          expect(price, `${townId} ${good}`).toBeGreaterThan(0);
          expect(Number.isFinite(price)).toBe(true);
        }
      }
    }
  });

  it('let a failed harvest raise the price of food', () => {
    const control = runMarkets('harvest', 80);
    const famine = runMarkets('harvest', 80, (ctx) => {
      ctx.world.shocks.push({
        id: 'failed-harvest',
        locationId: id('concordale'),
        routeId: null,
        since: 0,
        until: 400 * DAY,
      });
    });
    expect(recent(famine.market('concordale'), 'food')).toBeGreaterThan(
      recent(control.market('concordale'), 'food'),
    );
  });

  it('have the trading house buy below its ask, and pay less for what it has too much of', () => {
    const { ctx, market } = runMarkets('house', 10);
    const concordale = market('concordale');
    const quote = houseQuote(concordale, 'hides');
    expect(quote.bid).toBeLessThan(quote.ask);

    const seller = testCharacter(ctx);
    const before = seller.gold;
    const { sold, gold } = sellToHouse(concordale, seller, town(ctx), { hides: 5 });
    expect(sold.hides).toBe(5);
    expect(seller.gold).toBe(before + gold);

    concordale.house.stock.hides = (concordale.houseTargets.hides ?? 1) * 8;
    expect(houseQuote(concordale, 'hides').bid).toBeLessThan(quote.bid);
  });

  it('give better prices to those who speak the townsfolk’s tongue', () => {
    const ctx = testContext('tongues');
    const brindlemoor = town(ctx, 'brindlemoor');
    const human = testCharacter(ctx);
    human.languages = { common: 100 };
    const polyglot = testCharacter(ctx);
    polyglot.languages = { common: 100, deeptongue: 100 };
    expect(understanding(polyglot, brindlemoor)).toBeCloseTo(1);
    expect(understanding(human, brindlemoor)).toBeLessThan(0.5);
    expect(terms(human, brindlemoor).buy).toBeGreaterThan(terms(polyglot, brindlemoor).buy);
    expect(terms(human, brindlemoor).sell).toBeLessThan(terms(polyglot, brindlemoor).sell);
  });

  it('close a blockaded road to those planning journeys', () => {
    const ctx = testContext('blockade');
    const before = findPath(ctx.world, id('concordale'), id('brindlemoor'))!;
    expect(before.stops).toEqual([id('brindlemoor')]);
    ctx.world.shocks.push({
      id: 'blockade',
      locationId: null,
      routeId: 'concordale~brindlemoor' as RouteId,
      since: 0,
      until: DAY,
    });
    roadsChanged(ctx.world);
    const around = findPath(ctx.world, id('concordale'), id('brindlemoor'))!;
    expect(around.stops).not.toEqual([id('brindlemoor')]);
    expect(around.duration).toBeGreaterThan(before.duration);
  });

  it('keep the going price of a good nobody trades at its worth', () => {
    const { market } = runMarkets('quiet', 0);
    expect(goingPrice(market('saltmere'), 'ore')).toBe(4);
  });
});
