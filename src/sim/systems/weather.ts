import { BIOMES, WEATHERS, type WeatherId } from '../../content';
import { toCalendar } from '../core/time';
import type { SimContext } from '../context';
import type { Location, World } from '../model';

/**
 * Seasons and weather (ROADMAP.md Phase 9). Each region has its weather,
 * which turns now and then, following the season and the land's climate.
 * Hard weather slows the roads; the seasons set the harvest and how fast
 * creatures breed.
 */

/** Daily chance the weather turns in a region. */
const TURN_CHANCE = 0.25;

/** By season (Thaw, Highsun, Harvest, Deepwinter): chance of each weather, against the climate. */
// prettier-ignore
const SEASONAL: Record<Exclude<WeatherId, 'fair'>, readonly number[]> = {
  snow: [0.15, 0, 0.1, 0.7],
  storm: [0.12, 0.1, 0.15, 0.1],
  rain: [0.35, 0.2, 0.35, 0.2],
  heat: [0.05, 0.45, 0.1, 0],
};
const CLIMATE: Record<Exclude<WeatherId, 'fair'>, 'cold' | 'wet' | 'hot'> = {
  snow: 'cold',
  storm: 'wet',
  rain: 'wet',
  heat: 'hot',
};

/** Farmers' output by season: sowing, growing, reaping, and the lean months. */
const HARVEST = [0.9, 1.15, 1.25, 0.7];
/** How fast creatures breed by season. */
const BREEDING = [1.4, 1.1, 0.9, 0.6];
/** Hard weather spoils some of the work in the fields. */
const HARVEST_WEATHER: Record<WeatherId, number> = {
  fair: 1,
  rain: 1,
  storm: 0.85,
  snow: 0.8,
  heat: 0.85,
};

export function weatherDay(ctx: SimContext): void {
  const world = ctx.world;
  const rng = ctx.rng.ecology;
  const season = toCalendar(world.time).season;
  for (const region of world.regions.values()) {
    if (!rng.chance(TURN_CHANCE)) continue;
    const climate = BIOMES[region.biome].climate;
    const odds = (Object.keys(SEASONAL) as Exclude<WeatherId, 'fair'>[]).map(
      (w) => [w, SEASONAL[w][season]! * climate[CLIMATE[w]]] as const,
    );
    const hard = odds.reduce((sum, [, p]) => sum + p, 0);
    const weather: WeatherId = rng.weighted<WeatherId>([
      ...odds,
      ['fair', Math.max(0.15, 1 - hard)],
    ]);
    if (weather === region.weather) continue;
    region.weather = weather;
    region.weatherSince = world.time;
    // Only hard weather setting in is news.
    if (weather === 'snow' || weather === 'storm') {
      ctx.emit(
        { type: 'weather.turn', data: { regionId: region.id, region: region.name, weather } },
        [],
        null,
      );
    }
  }
}

/** The weather where a place lies, fair if it has no region. */
export function weatherAt(world: World, location: Location): WeatherId {
  return (location.regionId && world.regions.get(location.regionId)?.weather) || 'fair';
}

/** How much longer the road to `location` takes in its weather. */
export function travelFactor(world: World, location: Location): number {
  return WEATHERS[weatherAt(world, location)].travel;
}

/** Farmers' output in this season and weather, around 1. */
export function harvestFactor(world: World, town: Location): number {
  return HARVEST[toCalendar(world.time).season]! * HARVEST_WEATHER[weatherAt(world, town)];
}

/** How fast creatures breed this season; the starter map, with no weather, has no seasons. */
export function breedingFactor(world: World): number {
  if (world.regions.size === 0) return 1;
  return BREEDING[toCalendar(world.time).season]!;
}
