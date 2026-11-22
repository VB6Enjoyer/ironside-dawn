import { DAY, toCalendar, YEAR } from '../core/time';
import type { SimContext } from '../context';
import type { Location, LocationId, Plague } from '../model';
import { hardshipOf } from './hardship';
import { careIn } from './illness';
import { findPath } from './roads';

/**
 * Plague (0.4.0, ROADMAP.md "Body and Soul", step 7): two or three a
 * century, of every size and severity. One starts in a town, likelier a poor,
 * crowded one in winter; it rages for months, thinning the townsfolk and
 * sickening the named among them, and travels the roads to towns nearby.
 * A town it has passed through is spared for years after. Rich towns that
 * care well for their sick weather it far better.
 */

/** Plagues a century, in the whole world. */
const PER_CENTURY = 3;
/** A plague's days, at least and at most, before severity stretches them. */
const DAYS: readonly [number, number] = [60, 150];
/** Share of a town's people a raging plague takes in a day, at full severity, uncared for. */
const DAILY_TOLL = 0.003;
/** Daily chance a plague reaches a town within reach of the roads, at full severity. */
const SPREAD = 0.012;
/** How far by road a plague can travel from a town. */
const REACH = 4 * DAY;
/** Years a town is spared after a plague. */
const SPARED_YEARS = 15;
/** Plagues remembered. */
const KEPT = 30;

export function raging(ctx: SimContext, townId: LocationId): Plague | undefined {
  const now = ctx.world.time;
  return ctx.world.plagues.find((p) => p.townId === townId && p.until > now);
}

function spared(ctx: SimContext, townId: LocationId): boolean {
  const now = ctx.world.time;
  return ctx.world.plagues.some(
    (p) => p.townId === townId && now - p.startedAt < SPARED_YEARS * YEAR,
  );
}

function townsOf(ctx: SimContext): Location[] {
  return [...ctx.world.locations.values()].filter((l) => l.kind === 'town');
}

const people = (town: Location) =>
  Object.values(town.population).reduce<number>((s, n) => s + (n ?? 0), 0);

function begin(ctx: SimContext, town: Location, severity: number, fromId: LocationId | null): void {
  const rng = ctx.rng.people;
  const now = ctx.world.time;
  const days = Math.round(rng.int(DAYS[0], DAYS[1]) * (0.6 + 0.4 * severity));
  ctx.world.plagues.push({
    townId: town.id,
    startedAt: now,
    until: now + days * DAY,
    severity,
    dead: 0,
    fromId,
  });
  if (ctx.world.plagues.length > KEPT) ctx.world.plagues.shift();
  ctx.emit(
    fromId
      ? { type: 'plague.spread', data: { locationId: town.id, fromId, severity } }
      : { type: 'plague.outbreak', data: { locationId: town.id, severity } },
    [],
    town.id,
  );
}

/** A day of plague in the world: outbreaks, the toll, the spread along the roads, and the end. */
export function plagueDay(ctx: SimContext): void {
  const world = ctx.world;
  const rng = ctx.rng.people;
  const now = world.time;
  const towns = townsOf(ctx);
  if (towns.length === 0) return;

  // A new outbreak, now and then: likelier in winter, in poor and crowded towns.
  const winter = toCalendar(now).season === 3;
  if (rng.chance((PER_CENTURY / (100 * 360)) * (winter ? 2 : 0.67) * hardshipOf(world))) {
    const candidates = towns.filter((t) => !raging(ctx, t.id) && !spared(ctx, t.id));
    if (candidates.length > 0) {
      const town = rng.weighted(
        candidates.map((t) => [t, Math.sqrt(people(t)) * (1.3 - careIn(ctx, t.id))] as const),
      );
      begin(ctx, town, 0.3 + 0.7 * rng.next() ** 1.5, null);
    }
  }

  for (const plague of world.plagues) {
    if (plague.until <= now) continue;
    const town = world.locations.get(plague.townId);
    if (!town) continue;
    // The toll on the townsfolk: the worse the plague and the poorer the care, the heavier.
    const toll = DAILY_TOLL * plague.severity * (1.3 - careIn(ctx, town.id));
    for (const [species, n] of Object.entries(town.population)) {
      if (!n) continue;
      const lost = Math.min(n - 1, Math.round(n * toll));
      if (lost <= 0) continue;
      town.population[species as keyof typeof town.population] = n - lost;
      plague.dead += lost;
    }
    // Along the roads to towns nearby.
    if (rng.chance(SPREAD * plague.severity)) {
      const near = towns.filter((t) => {
        if (t.id === town.id || raging(ctx, t.id) || spared(ctx, t.id)) return false;
        const path = findPath(world, town.id, t.id);
        return path !== null && path.duration <= REACH;
      });
      if (near.length > 0) begin(ctx, rng.pick(near), plague.severity * 0.8, town.id);
    }
    // The last day: it burns itself out.
    if (plague.until - now <= DAY) {
      ctx.emit(
        { type: 'plague.end', data: { locationId: town.id, dead: plague.dead } },
        [],
        town.id,
      );
    }
  }
}
