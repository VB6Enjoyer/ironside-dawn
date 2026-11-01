import type { LocationId, Route, World } from '../model';

export interface RoadLink {
  readonly to: LocationId;
  readonly route: Route;
}

export interface Path {
  /** Stops after the start, ending at the destination. */
  readonly stops: readonly LocationId[];
  /** Typical total duration, in seconds. */
  readonly duration: number;
}

// Roads only change when one is blocked or reopens, so the network is kept.
const networks = new WeakMap<
  World,
  { open: Map<LocationId, RoadLink[]>; all: Map<LocationId, RoadLink[]> }
>();

/**
 * The roads out of a place. Blocked roads are left out unless `blocked` is
 * set: journeys are planned around them, but those already on one press on.
 */
export function roadsFrom(world: World, from: LocationId, blocked = false): readonly RoadLink[] {
  let network = networks.get(world);
  if (!network) {
    const closed = new Set(world.shocks.flatMap((s) => (s.routeId ? [s.routeId] : [])));
    network = { open: new Map(), all: new Map() };
    for (const route of world.routes.values()) {
      for (const map of closed.has(route.id) ? [network.all] : [network.all, network.open]) {
        addLink(map, route.a, { to: route.b, route });
        addLink(map, route.b, { to: route.a, route });
      }
    }
    networks.set(world, network);
  }
  return (blocked ? network.all : network.open).get(from) ?? [];
}

/** A road was blocked or reopened: forget the network and every path. */
export function roadsChanged(world: World): void {
  networks.delete(world);
  pathCaches.delete(world);
}

// Paths are worth remembering too, until the roads change.
const pathCaches = new WeakMap<World, Map<LocationId, Map<LocationId, Path | null>>>();

/** Fastest path by typical travel time (Dijkstra), or null if unreachable. */
export function findPath(world: World, from: LocationId, to: LocationId): Path | null {
  let byOrigin = pathCaches.get(world);
  if (!byOrigin) {
    byOrigin = new Map();
    pathCaches.set(world, byOrigin);
  }
  let cache = byOrigin.get(from);
  if (!cache) {
    cache = new Map();
    byOrigin.set(from, cache);
  }
  const cached = cache.get(to);
  if (cached !== undefined) return cached;
  const path = searchPath(world, from, to);
  cache.set(to, path);
  return path;
}

function searchPath(world: World, from: LocationId, to: LocationId): Path | null {
  if (from === to) return { stops: [], duration: 0 };

  const best = new Map<LocationId, number>([[from, 0]]);
  const previous = new Map<LocationId, LocationId>();
  const done = new Set<LocationId>();

  // The map is small, so a linear scan for the closest node is fine. Ties go
  // to the earliest-inserted node, which keeps the result deterministic.
  for (;;) {
    let current: LocationId | undefined;
    let currentCost = Infinity;
    for (const [id, cost] of best) {
      if (!done.has(id) && cost < currentCost) {
        current = id;
        currentCost = cost;
      }
    }
    if (current === undefined) return null;
    if (current === to) break;
    done.add(current);

    for (const { to: next, route } of roadsFrom(world, current)) {
      const cost = currentCost + route.duration;
      if (cost < (best.get(next) ?? Infinity)) {
        best.set(next, cost);
        previous.set(next, current);
      }
    }
  }

  const stops: LocationId[] = [];
  for (
    let id: LocationId | undefined = to;
    id !== undefined && id !== from;
    id = previous.get(id)
  ) {
    stops.push(id);
  }
  stops.reverse();
  return { stops, duration: best.get(to)! };
}

function addLink(network: Map<LocationId, RoadLink[]>, from: LocationId, link: RoadLink): void {
  const links = network.get(from);
  if (links) links.push(link);
  else network.set(from, [link]);
}
