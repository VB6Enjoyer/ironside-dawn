import { creatureDef, SPECIES, type CreatureId } from '../../content';
import type { SimContext } from '../context';
import type { Character, Encounter, Herd, Location, Side } from '../model';
import { isAlive } from './condition';
import { startCreatureFight, type Horde } from './combat';
import { burn } from './ledger';
import { charactersAt } from './whereabouts';

/**
 * Raids and incursions (ROADMAP.md Phase 9): creatures loose on the roads, or
 * a dungeon's horde led by one of the dread, fall on a town. Whoever is in
 * town and fit to fight stands to defend it; a lord's garrison mans the
 * walls. A town nobody defends is plundered, and some of its folk are lost.
 */

/** The most defenders who join the fight: the strongest of those present. */
const MAX_DEFENDERS = 8;
/** Garrison soldiers on the walls, against raiders. */
const WALL_KILLS_PER_SOLDIER = 0.3;
/** A sacked town loses this share of its folk, at most. */
const SACK_TOLL = 0.025;
/** And this share of its trading house's gold and stores. */
const SACK_PLUNDER = 0.25;
/** Townsfolk past this share of their lifespan leave the fighting to others. */
const TOO_OLD = 0.6;

const FIT: ReadonlySet<Character['activity']['kind']> = new Set([
  'idle',
  'pastime',
  'resting',
  'convalescing',
  'living',
]);

/** Raiders reach a town. */
export function raidTown(
  ctx: SimContext,
  town: Location,
  hordes: readonly Horde[],
  herd: Herd | null,
  leader: Character | null,
): void {
  ctx.world.tally.raids++;
  const raiders = manTheWalls(ctx, town, hordes, herd);
  if (raiders.length === 0 && !leader) return;
  const defenders = defendersOf(ctx, town);
  if (defenders.length === 0) {
    sack(ctx, town, raiders, leader);
    return;
  }
  startCreatureFight(ctx, 'raid', defenders, town, raiders, herd, {
    leaders: leader ? [leader] : [],
  });
}

/** The fight for a town is over. */
export function endRaid(ctx: SimContext, encounter: Encounter, winner: Side | null): void {
  const world = ctx.world;
  const town = world.locations.get(encounter.locationId)!;
  const leaderId = encounter.sides[1].characters[0] ?? null;
  if (winner === 0) {
    const standing = encounter.sides[0].characters.filter((id) => !encounter.out[id]);
    ctx.emit(
      {
        type: 'raid.repelled',
        data: {
          characterId: standing[0]!,
          characterIds: standing,
          locationId: town.id,
          leaderId: leaderId && isAlive(world.characters.get(leaderId)!) ? leaderId : null,
        },
      },
      standing,
      town.id,
    );
    return;
  }
  const left = encounter.sides[1].creatures.filter((c) => c.fighter.out === null);
  const counts = new Map<CreatureId, number>();
  for (const c of left) counts.set(c.ref.species, (counts.get(c.ref.species) ?? 0) + 1);
  const leader = leaderId ? world.characters.get(leaderId)! : null;
  sack(
    ctx,
    town,
    [...counts].map(([species, count]) => ({ species, count })),
    leader && isAlive(leader) ? leader : null,
  );
}

/** Those in town who can fight and will: the able, strongest first. */
function defendersOf(ctx: SimContext, town: Location): Character[] {
  const now = ctx.world.time;
  return charactersAt(ctx.world, town.id)
    .filter((c) => {
      if (!isAlive(c) || !FIT.has(c.activity.kind) || c.hp < c.maxHp * 0.3) return false;
      // Merchants keep to their wagons; children and the dread don't stand with the town.
      if (c.calling === 'child' || c.calling === 'dread' || c.calling === 'merchant') return false;
      if (c.calling === 'townsfolk') {
        return (now - c.born) / (SPECIES[c.species].lifespan * 360 * 86_400) < TOO_OLD;
      }
      return true;
    })
    .sort((a, b) => b.level - a.level)
    .slice(0, MAX_DEFENDERS);
}

/**
 * A lord's soldiers on the walls thin the raiders before they reach the
 * streets, losing a few of their own.
 */
function manTheWalls(
  ctx: SimContext,
  town: Location,
  hordes: readonly Horde[],
  herd: Herd | null,
): Horde[] {
  const fortress = [...ctx.world.locations.values()].find((l) =>
    l.fortress?.territory.includes(town.id),
  )?.fortress;
  let kills = fortress ? Math.round(fortress.garrison * WALL_KILLS_PER_SOLDIER) : 0;
  if (fortress) fortress.garrison = Math.max(0, fortress.garrison - Math.ceil(kills / 4));
  const left: Horde[] = [];
  // The weakest fall first.
  for (const horde of [...hordes].sort(
    (a, b) => creatureDef(a.species).level - creatureDef(b.species).level,
  )) {
    const slain = Math.min(kills, horde.count);
    kills -= slain;
    if (slain > 0 && herd) thin(ctx, herd, horde.species, slain);
    if (horde.count - slain > 0) left.push({ species: horde.species, count: horde.count - slain });
  }
  return left;
}

function thin(ctx: SimContext, herd: Herd, species: CreatureId, count: number): void {
  const place = ctx.world.locations.get(herd.locationId);
  const pool = herd.pool === 'dungeon' ? place?.dungeon?.population : place?.roaming;
  if (!pool) return;
  const left = Math.max(0, (pool[species] ?? 0) - count);
  if (left > 0 || herd.pool === 'dungeon') pool[species] = left;
  else delete pool[species];
}

/** The raiders have the town: they plunder it, and some of its folk die or flee. */
function sack(
  ctx: SimContext,
  town: Location,
  raiders: readonly Horde[],
  leader: Character | null,
): void {
  const world = ctx.world;
  const rng = ctx.rng.ecology;
  const strength = raiders.reduce((sum, h) => sum + h.count * creatureDef(h.species).level, 0);
  const toll = Math.min(SACK_TOLL, 0.002 * strength) * (0.5 + rng.next());
  let lost = 0;
  for (const [species, n] of Object.entries(town.population) as [
    keyof typeof town.population,
    number,
  ][]) {
    const dead = Math.round(n * toll);
    town.population[species] = n - dead;
    lost += dead;
  }
  // The trading house's coffers and stores: carried off to a lair, or scattered and lost.
  let gold = 0;
  const market = world.markets.get(town.id);
  if (market) {
    gold = Math.floor(market.house.gold * SACK_PLUNDER);
    market.house.gold -= gold;
    for (const good of Object.keys(market.house.stock) as (keyof typeof market.house.stock)[]) {
      market.house.stock[good] = (market.house.stock[good] ?? 0) * (1 - SACK_PLUNDER);
    }
    if (leader) leader.gold += gold;
    else burn(world, 'raid', gold);
  }
  // The lives a raid takes are laid at its leader's door.
  if (leader) leader.slain += lost;
  const main = [...raiders].sort((a, b) => b.count - a.count)[0];
  ctx.emit(
    {
      type: 'raid.sack',
      data: {
        locationId: town.id,
        creature: main?.species ?? null,
        count: raiders.reduce((sum, h) => sum + h.count, 0),
        leaderId: leader?.id ?? null,
        lost,
        gold,
      },
    },
    leader ? [leader.id] : [],
    town.id,
  );
}
