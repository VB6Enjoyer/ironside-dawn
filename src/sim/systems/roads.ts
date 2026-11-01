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
  reachCaches.delete(world);
}

/** Everywhere reachable from one place: how long it takes, and the way there. */
interface Reach {
  readonly best: Map<LocationId, number>;
  readonly previous: Map<LocationId, LocationId>;
  /** Reachable places, nearest first (the start excluded). */
  readonly nearest: readonly { readonly id: LocationId; readonly duration: number }[];
  readonly paths: Map<LocationId, Path | null>;
}

// Worth remembering, until the roads change.
const reachCaches = new WeakMap<World, Map<LocationId, Reach>>();

/** Fastest path by typical travel time (Dijkstra), or null if unreachable. */
export function findPath(world: World, from: LocationId, to: LocationId): Path | null {
  const reach = reachFrom(world, from);
  const cached = reach.paths.get(to);
  if (cached !== undefined) return cached;
  let path: Path | null = null;
  if (from === to) path = { stops: [], duration: 0 };
  else if (reach.best.has(to)) {
    const stops: LocationId[] = [];
    for (
      let id: LocationId | undefined = to;
      id !== undefined && id !== from;
      id = reach.previous.get(id)
    ) {
      stops.push(id);
    }
    stops.reverse();
    path = { stops, duration: reach.best.get(to)! };
  }
  reach.paths.set(to, path);
  return path;
}

/** The places reachable from `from` by open roads, nearest first. */
export function nearbyPlaces(
  world: World,
  from: LocationId,
): readonly { readonly id: LocationId; readonly duration: number }[] {
  return reachFrom(world, from).nearest;
}

function reachFrom(world: World, from: LocationId): Reach {
  let byOrigin = reachCaches.get(world);
  if (!byOrigin) {
    byOrigin = new Map();
    reachCaches.set(world, byOrigin);
  }
  let reach = byOrigin.get(from);
  if (!reach) {
    reach = search(world, from);
    byOrigin.set(from, reach);
  }
  return reach;
}

function search(world: World, from: LocationId): Reach {
  const best = new Map<LocationId, number>([[from, 0]]);
  const previous = new Map<LocationId, LocationId>();
  const done = new Set<LocationId>();
  const nearest: { id: LocationId; duration: number }[] = [];

  // Maps are a few dozen places, so a linear scan for the closest is fine. Ties
  // go to the earliest-inserted place, which keeps the result deterministic.
  for (;;) {
    let current: LocationId | undefined;
    let currentCost = Infinity;
    for (const [id, cost] of best) {
      if (!done.has(id) && cost < currentCost) {
        current = id;
        currentCost = cost;
      }
    }
    if (current === undefined) break;
    done.add(current);
    if (current !== from) nearest.push({ id: current, duration: currentCost });

    for (const { to: next, route } of roadsFrom(world, current)) {
      const cost = currentCost + route.duration;
      if (cost < (best.get(next) ?? Infinity)) {
        best.set(next, cost);
        previous.set(next, current);
      }
    }
  }
  return { best, previous, nearest, paths: new Map() };
}

function addLink(network: Map<LocationId, RoadLink[]>, from: LocationId, link: RoadLink): void {
  const links = network.get(from);
  if (links) links.push(link);
  else network.set(from, [link]);
}
