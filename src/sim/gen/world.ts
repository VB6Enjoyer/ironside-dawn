import type { CreatureId, MapDef } from '../../content';
import { createScheduler } from '../core/scheduler';
import { HOUR } from '../core/time';
import type { SimContext } from '../context';
import type { Location, LocationId, Region, RegionId, Route, RouteId, World } from '../model';
import { createMarket } from '../systems/market';
import { createCharacter, townPopulation, towns } from './people';

/** Towns can grow to this many times their founding size. */
const TOWN_ROOM = 1.5;

/** Worlds begin at dawn on the first day of the first year. */
export const WORLD_START = 6 * HOUR;
/** Characters' first actions are spread over the first hours, not all at once. */
const FIRST_WAKE_SPREAD = 3 * HOUR;

export function createWorldState(seed: string, map: MapDef): World {
  const ids = new Set<string>();
  for (const def of map.locations) {
    if (ids.has(def.id)) throw new Error(`Duplicate location ID: ${def.id}`);
    ids.add(def.id);
  }

  const routes = new Map<RouteId, Route>();
  for (const def of map.routes) {
    const [a, b] = def.between as [LocationId, LocationId];
    if (!ids.has(a) || !ids.has(b)) {
      throw new Error(`Route ${a}–${b} refers to an unknown location`);
    }
    if (!(def.hours > 0)) throw new Error(`Route ${a}–${b} must take some time`);
    const id = `${a}~${b}` as RouteId;
    routes.set(id, { id, a, b, duration: Math.round(def.hours * HOUR) });
  }
  const territories = territoriesOf(map, routes);

  const locations = new Map<LocationId, Location>();
  for (const def of map.locations) {
    const id = def.id as LocationId;
    const population: Partial<Record<CreatureId, number>> = {};
    for (const inhabitant of def.dungeon?.inhabitants ?? []) {
      population[inhabitant.creature] = inhabitant.initial;
    }
    locations.set(id, {
      id,
      name: def.name,
      article: def.article ?? null,
      kind: def.kind,
      culture: def.culture,
      x: def.x ?? 0,
      y: def.y ?? 0,
      regionId: (def.region as RegionId | undefined) ?? null,
      population: { ...def.population },
      capacity: Object.fromEntries(
        Object.entries(def.population ?? {}).map(([s, n]) => [s, Math.round(n * TOWN_ROOM)]),
      ),
      academy: def.academy ?? false,
      dungeon: def.dungeon ? { def: def.dungeon, population, lostItems: [], masterId: null } : null,
      economy: def.economy ?? null,
      roaming: def.haunt ? { [def.haunt.creature]: Math.ceil(def.haunt.max / 2) } : {},
      haunt: def.haunt ?? null,
      fortress:
        def.kind === 'fortress'
          ? {
              lordId: null,
              territory: territories.get(id) ?? [],
              garrison: 0,
              vacantSince: null,
              lineage: [],
            }
          : null,
    });
  }

  const regions = new Map<RegionId, Region>();
  for (const def of map.regions ?? []) {
    const id = def.id as RegionId;
    regions.set(id, {
      ...def,
      id,
      culture: def.culture ?? null,
      weather: 'fair',
      weatherSince: WORLD_START,
    });
  }

  const world: World = {
    seed,
    time: WORLD_START,
    characters: new Map(),
    locations,
    routes,
    regions,
    width: map.width ?? 0,
    height: map.height ?? 0,
    encounters: new Map(),
    legends: new Map(),
    parties: new Map(),
    bounties: new Map(),
    scheduler: createScheduler(),
    takenNames: new Set(),
    nextCharacterNumber: 1,
    nextEncounterNumber: 1,
    nextItemNumber: 1,
    nextPartyNumber: 1,
    nextEventId: 1,
    tally: {
      robberies: 0,
      murders: 0,
      bountiesClaimed: 0,
      legendsFound: 0,
      raids: 0,
      dreadSlain: 0,
    },
    history: [],
    markets: new Map(),
    shocks: [],
    ledger: { minted: {}, burned: {} },
    heroes: [],
    myths: [],
    omens: {},
  };
  for (const location of locations.values()) {
    const market = createMarket(world, location);
    if (market) world.markets.set(location.id, market);
  }
  return world;
}

/** How far by road a fortress's protection reaches. */
const TERRITORY_HOURS = 24;

/**
 * Each fortress holds the towns and wild places nearer to it by road than to
 * any other fortress, within a day's ride.
 */
function territoriesOf(
  map: MapDef,
  routes: ReadonlyMap<RouteId, Route>,
): Map<LocationId, LocationId[]> {
  const kindOf = new Map(map.locations.map((l) => [l.id as LocationId, l.kind]));
  const links = new Map<LocationId, { to: LocationId; duration: number }[]>();
  for (const r of routes.values()) {
    links.set(r.a, [...(links.get(r.a) ?? []), { to: r.b, duration: r.duration }]);
    links.set(r.b, [...(links.get(r.b) ?? []), { to: r.a, duration: r.duration }]);
  }
  const claim = new Map<LocationId, { fortress: LocationId; hours: number }>();
  for (const def of map.locations) {
    if (def.kind !== 'fortress') continue;
    const from = def.id as LocationId;
    const best = new Map<LocationId, number>([[from, 0]]);
    const queue: LocationId[] = [from];
    while (queue.length > 0) {
      queue.sort((a, b) => best.get(a)! - best.get(b)!);
      const here = queue.shift()!;
      for (const { to, duration } of links.get(here) ?? []) {
        const t = best.get(here)! + duration;
        if (t > TERRITORY_HOURS * HOUR || t >= (best.get(to) ?? Infinity)) continue;
        best.set(to, t);
        queue.push(to);
      }
    }
    for (const [id, t] of best) {
      const kind = kindOf.get(id);
      if (kind !== 'town' && kind !== 'wilderness') continue;
      const held = claim.get(id);
      if (!held || t < held.hours) claim.set(id, { fortress: from, hours: t });
    }
  }
  const territories = new Map<LocationId, LocationId[]>();
  for (const [id, { fortress }] of claim) {
    territories.set(fortress, [...(territories.get(fortress) ?? []), id]);
  }
  return territories;
}

/** Merchants in a world of this many adventurers: one for every eight, and at least two. */
export function merchantsFor(adventurers: number): number {
  return Math.max(2, Math.round(adventurers / 8));
}

/** Creates `count` adventurers from the towns' commoners, larger towns giving more. */
export function populate(ctx: SimContext, count: number): void {
  const homes = towns(ctx);
  if (homes.length === 0) throw new Error('The map needs at least one town');
  const merchants = merchantsFor(count);
  for (let i = 0; i < count + merchants; i++) {
    const home = ctx.rng.people.weighted(
      homes.map((t) => [t, Math.max(1, townPopulation(t))] as const),
    );
    createCharacter(ctx, home, {
      newcomer: false,
      firstWakeWithin: FIRST_WAKE_SPREAD,
      calling: i < count ? 'adventurer' : 'merchant',
    });
  }
}
