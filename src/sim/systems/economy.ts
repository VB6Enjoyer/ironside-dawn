import { SHOCKS, shockDef, type ProfessionId } from '../../content';
import { DAY } from '../core/time';
import type { SimContext } from '../context';
import type { Location, Shock } from '../model';
import { marketDay } from './market';
import { roadsChanged } from './roads';
import { harvestFactor } from './weather';

/**
 * The economy's day (ROADMAP.md Phase 7): troubles come and go, then every
 * town's market runs.
 */
export function economyDay(ctx: SimContext): void {
  troubles(ctx);
  const world = ctx.world;
  for (const market of world.markets.values()) {
    const town = world.locations.get(market.townId)!;
    marketDay(ctx, market, town, (profession) => outputMultiplier(ctx, town, profession));
  }
}

function outputMultiplier(ctx: SimContext, town: Location, profession: ProfessionId): number {
  // Fields follow the seasons; on the starter map, which has no weather, they don't.
  let multiplier =
    profession === 'farmers' && ctx.world.regions.size > 0 ? harvestFactor(ctx.world, town) : 1;
  for (const shock of ctx.world.shocks) {
    if (shock.locationId !== town.id) continue;
    const def = shockDef(shock.id);
    if (def.target === profession) multiplier *= def.output;
  }
  return multiplier;
}

/** Old troubles end; new ones may begin, in towns or on the roads. */
function troubles(ctx: SimContext): void {
  const world = ctx.world;
  const rng = ctx.rng.markets;
  const now = world.time;
  let roads = false;

  const ended = world.shocks.filter((s) => s.until <= now);
  if (ended.length > 0) {
    world.shocks = world.shocks.filter((s) => s.until > now);
    for (const shock of ended) {
      roads ||= shock.routeId !== null;
      ctx.emit({ type: 'market.recover', data: describe(ctx, shock) }, [], placeOf(ctx, shock));
    }
  }

  const begin = (shock: Omit<Shock, 'since' | 'until'>, days: readonly [number, number]) => {
    const started: Shock = { ...shock, since: now, until: now + rng.int(days[0], days[1]) * DAY };
    world.shocks.push(started);
    ctx.emit(
      {
        type: 'market.shock',
        data: { ...describe(ctx, started), days: (started.until - now) / DAY },
      },
      [],
      placeOf(ctx, started),
    );
  };

  for (const market of world.markets.values()) {
    const professions = new Set(market.agents.map((a) => a.id));
    for (const def of SHOCKS) {
      if (def.target === 'road' || !professions.has(def.target)) continue;
      const active = world.shocks.some((s) => s.locationId === market.townId && s.id === def.id);
      if (active || !rng.chance(def.chance)) continue;
      begin({ id: def.id, locationId: market.townId, routeId: null }, def.days);
    }
  }
  for (const def of SHOCKS) {
    if (def.target !== 'road') continue;
    for (const route of world.routes.values()) {
      const active = world.shocks.some((s) => s.routeId === route.id);
      if (active || !rng.chance(def.chance)) continue;
      begin({ id: def.id, locationId: null, routeId: route.id }, def.days);
      roads = true;
    }
  }
  if (roads) roadsChanged(world);
}

function describe(ctx: SimContext, shock: Shock) {
  const route = shock.routeId ? ctx.world.routes.get(shock.routeId)! : null;
  return {
    shock: shock.id,
    locationId: route ? route.a : shock.locationId!,
    otherId: route ? route.b : null,
  };
}

function placeOf(ctx: SimContext, shock: Shock) {
  return shock.locationId ?? ctx.world.routes.get(shock.routeId!)!.a;
}
