import { describe, expect, it } from 'vitest';

import { DAY } from './core/time';
import type { SimEvent } from './model';
import { createSimulation } from './simulation';
import { moneyBooked, moneyHeld } from './systems/ledger';

describe('a year of trade', () => {
  const events: SimEvent[] = [];
  const sim = createSimulation({
    seed: 'trade',
    characterCount: 40,
    onEvent: (e) => events.push(e),
  });
  sim.advance(sim.world.time + 360 * DAY);
  const count = (type: SimEvent['type']) => events.filter((e) => e.type === type).length;

  it('accounts for every coin: what is held is what was minted, less what was burned', () => {
    expect(moneyHeld(sim.world)).toBeCloseTo(moneyBooked(sim.world), 3);
    expect(sim.world.ledger.minted.treasure).toBeGreaterThan(0);
    expect(sim.world.ledger.burned.upkeep).toBeGreaterThan(0);
  });

  it('has adventurers sell their finds and buy healing draughts, and drink them when hurt', () => {
    expect(count('trade.sell')).toBeGreaterThan(100);
    expect(count('trade.shop')).toBeGreaterThan(10);
    expect(count('item.potion')).toBeGreaterThan(0);
  });

  it('has merchants haul goods between towns, at a profit overall', () => {
    const unloads = events.filter((e) => e.type === 'trade.unload');
    expect(count('trade.load')).toBeGreaterThan(20);
    expect(unloads.length).toBeGreaterThan(20);
    const profit = unloads.reduce(
      (sum, e) => sum + (e.type === 'trade.unload' ? (e.data.profit ?? 0) : 0),
      0,
    );
    expect(profit).toBeGreaterThan(0);
    // Loads go to other towns.
    for (const e of events) {
      if (e.type === 'trade.load') expect(e.data.destinationId).not.toBe(e.data.locationId);
    }
  });

  it('records each town’s prices daily, and samples them with the seasons', () => {
    for (const market of sim.world.markets.values()) {
      expect(market.history.food!.length).toBe(360);
    }
    const last = sim.world.history.at(-1)!;
    expect(Object.keys(last.prices)).toHaveLength(sim.world.markets.size);
    expect(last.money).toBeGreaterThan(0);
  });

  it('never leaves anyone with negative or fractional coin', () => {
    for (const c of sim.world.characters.values()) {
      expect(c.gold).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(c.gold)).toBe(true);
    }
  });
});
