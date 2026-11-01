import type { MoneySink, MoneySource, World } from '../model';

/**
 * Money supply accounting (ROADMAP.md Phase 7). Gold only changes hands,
 * except here: every coin that comes into the world or leaves it is booked,
 * so the money held always equals what was minted less what was burned.
 */

export function mint(world: World, source: MoneySource, amount: number): void {
  if (amount === 0) return;
  world.ledger.minted[source] = (world.ledger.minted[source] ?? 0) + amount;
}

export function burn(world: World, sink: MoneySink, amount: number): void {
  if (amount === 0) return;
  world.ledger.burned[sink] = (world.ledger.burned[sink] ?? 0) + amount;
}

/** Gold everyone holds: characters (the dead hold none), trades and trading houses. */
export function moneyHeld(world: World): number {
  let total = 0;
  for (const c of world.characters.values()) total += c.gold;
  for (const market of world.markets.values()) {
    total += market.house.gold;
    for (const agent of market.agents) total += agent.gold;
  }
  return total;
}

/** What the ledger says should be held. */
export function moneyBooked(world: World): number {
  const minted = Object.values(world.ledger.minted).reduce<number>((a, n) => a + (n ?? 0), 0);
  const burned = Object.values(world.ledger.burned).reduce<number>((a, n) => a + (n ?? 0), 0);
  return minted - burned;
}
