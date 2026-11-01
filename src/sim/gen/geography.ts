import {
  BIOMES,
  biomeDef,
  CULTURES,
  DUNGEON_TEMPLATES,
  HOMELANDS,
  PACK_CULTURES,
  packOf,
  PEOPLES,
  SPECIES,
  type CultureDef,
  type CultureId,
  type BiomeId,
  type DungeonDef,
  type DungeonTemplateId,
  type EconomyDef,
  type LocationDef,
  type MapDef,
  type NameParts,
  type PeopleId,
  type ProfessionId,
  type RegionDef,
  type RouteDef,
  type SpeciesId,
} from '../../content';
import { createRng, type Rng } from '../core/rng';

/**
 * Procedural world generation (ROADMAP.md Phase 9): a map of regions, each one
 * kind of land, with towns where the peoples make their homes, dungeons in
 * the wild, fortresses, wild places on the roads, and the roads between them.
 * The same seed always makes the same world.
 *
 * Distances are in leagues: about an hour's walk on open plains.
 */

export type WorldSize = 'small' | 'medium' | 'large';

interface SizeDef {
  readonly width: number;
  readonly height: number;
  readonly regions: number;
  readonly towns: number;
  /** Towns of two peoples, on the border between their lands. */
  readonly borderTowns: number;
}

// prettier-ignore
const SIZES: Record<WorldSize, SizeDef> = {
  small: { width: 64, height: 44, regions: 7, towns: 8, borderTowns: 1 },
  medium: { width: 92, height: 64, regions: 11, towns: 16, borderTowns: 2 },
  large: { width: 128, height: 90, regions: 16, towns: 28, borderTowns: 3 },
};

/** The size that suits a world of this many adventurers. */
export function sizeFor(adventurers: number): WorldSize {
  return adventurers <= 50 ? 'small' : adventurers <= 200 ? 'medium' : 'large';
}

/** How much more likely each biome is, for the regions not set aside as homelands. */
// prettier-ignore
const BIOME_WEIGHTS: Record<BiomeId, number> = {
  plains: 3, forest: 2, hills: 2, mountains: 1.5, steppe: 1, marsh: 1, wastes: 0.4,
};

/** Road hours per league, on top of the land's own difficulty. */
const HOURS_PER_LEAGUE = 1;
/** Closest two towns may be, in leagues. */
const TOWN_SPACING = 7;
/** Dungeons lie at least this far from any town. */
const DUNGEON_SPACING = 5;
const MARGIN = 3;

const COMMON_TREASURE: DungeonDef['treasure'] = [
  { loot: 'silver-ring', weight: 5 },
  { loot: 'gilded-goblet', weight: 3 },
  { loot: 'jeweled-dagger', weight: 2 },
  { loot: 'ancient-amulet', weight: 1 },
];

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Placed extends Point {
  readonly def: LocationDef;
  /** Dungeons: what kind. */
  readonly template?: DungeonTemplateId;
}

export function generateMap(seed: string, size: WorldSize): MapDef {
  const rng = createRng(seed).fork('geography');
  const spec = SIZES[size];
  const { width, height } = spec;
  const names = new Set<string>();

  // Regions: hearts spread over the map, each one kind of land.
  const hearts = scatter(
    rng,
    spec.regions,
    width,
    height,
    Math.sqrt((width * height) / spec.regions) * 0.7,
  );
  const biomes = assignBiomes(rng, hearts, width, height);
  const cultures = assignCultures(rng, hearts, biomes, size);
  const regions: RegionDef[] = hearts.map((p, i) => {
    const biome = biomes[i]!;
    const culture = cultures[i] ?? undefined;
    const parts = culture ? packOf(culture)!.regionNames : BIOMES[biome].regionNames;
    const name = uniqueName(rng, names, () => `the ${compose(rng, parts)}`);
    return {
      id: slug(name),
      name,
      biome,
      ...(culture ? { culture } : {}),
      x: round(p.x),
      y: round(p.y),
    };
  });
  const regionAt = (p: Point): RegionDef => nearest(regions, p);

  const placed: Placed[] = [];
  const tooClose = (p: Point, spacing: number, kinds?: readonly string[]) =>
    placed.some((q) => (!kinds || kinds.includes(q.def.kind)) && dist(p, q) < spacing);
  /** A spot in `region` (or anywhere, if null) not too close to anything placed. */
  const spot = (region: RegionDef | null, test: (p: Point) => boolean): Point | null => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const p = {
        x: MARGIN + rng.next() * (width - 2 * MARGIN),
        y: MARGIN + rng.next() * (height - 2 * MARGIN),
      };
      if (region && regionAt(p).id !== region.id) continue;
      if (test(p)) return p;
    }
    return null;
  };

  // Towns: each people's homeland first, then wherever the land is settled.
  const townRegions = regions.filter((r) => BIOMES[r.biome].settled > 0);
  const plannedTowns: { region: RegionDef; people: PeopleId }[] = [];
  for (const people of PEOPLES) {
    const homes = regions.filter((r) => r.biome === HOMELANDS[people]);
    if (homes.length > 0) plannedTowns.push({ region: rng.pick(homes), people });
  }
  while (plannedTowns.length < spec.towns) {
    const region = rng.weighted(townRegions.map((r) => [r, BIOMES[r.biome].settled] as const));
    const peoples = Object.entries(BIOMES[region.biome].peoples) as [PeopleId, number][];
    plannedTowns.push({ region, people: rng.weighted(peoples) });
  }
  for (const { region, people } of plannedTowns) {
    let p = spot(region, (q) => !tooClose(q, TOWN_SPACING, ['town']));
    p ??= spot(region, (q) => !tooClose(q, TOWN_SPACING / 2, ['town']));
    if (!p) continue;
    placed.push({ ...p, def: townDef(rng, names, region, people, p) });
  }

  // A few towns on the border between two peoples' lands take in both.
  mixBorderTowns(rng, placed, regions, regionAt, spec.borderTowns);

  // Fortresses guard the more settled lands.
  const fortresses = Math.max(1, Math.round(spec.towns / 5));
  for (let i = 0; i < fortresses; i++) {
    const region = rng.weighted(townRegions.map((r) => [r, BIOMES[r.biome].settled] as const));
    const p = spot(region, (q) => !tooClose(q, 5));
    if (!p) continue;
    const name = uniqueName(rng, names, () => fortressName(rng, region));
    placed.push({ ...p, def: base(name, 'fortress', region, p, 'generic') });
  }

  // Dungeons, away from the towns; the further out, the deadlier.
  const dungeons = Math.max(3, Math.round(spec.towns * 0.75));
  for (let i = 0; i < dungeons; i++) {
    const p = spot(
      null,
      (q) => !tooClose(q, DUNGEON_SPACING, ['town', 'fortress']) && !tooClose(q, 4),
    );
    if (!p) continue;
    const region = regionAt(p);
    const nearestTown = Math.min(
      ...placed.filter((q) => q.def.kind === 'town').map((q) => dist(p, q)),
    );
    const template = pickTemplate(rng, region);
    placed.push({
      ...p,
      def: dungeonDef(rng, names, region, p, nearestTown, template),
      template,
    });
  }

  // Every culture's lands hold at least one dungeon of its own kind (a barrow, a haunted shrine).
  for (const culture of PACK_CULTURES) {
    const lands = regions.filter((r) => r.culture === culture);
    if (lands.length === 0) continue;
    const pack = packOf(culture)!;
    const signature = (Object.entries(pack.dungeons) as [DungeonTemplateId, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0]![0];
    const has = placed.some(
      (q) => q.def.kind === 'dungeon' && q.def.culture === culture && q.template === signature,
    );
    if (has) continue;
    const region = rng.pick(lands);
    const p =
      spot(region, (q) => !tooClose(q, DUNGEON_SPACING, ['town', 'fortress']) && !tooClose(q, 4)) ??
      spot(region, (q) => !tooClose(q, 3));
    if (!p) continue;
    const nearestTown = Math.min(
      ...placed.filter((q) => q.def.kind === 'town').map((q) => dist(p, q)),
    );
    placed.push({
      ...p,
      def: dungeonDef(rng, names, region, p, nearestTown, signature),
      template: signature,
    });
  }

  // Wild places along the way: forests, passes, fens.
  const wilds = Math.max(2, Math.round(spec.towns * 0.6));
  for (let i = 0; i < wilds; i++) {
    const p = spot(null, (q) => !tooClose(q, 6));
    if (!p) continue;
    const region = regionAt(p);
    const pack = region.culture ? packOf(region.culture) : null;
    const parts = pack ? pack.wildNames : BIOMES[region.biome].wildNames;
    const name = uniqueName(rng, names, () => `the ${compose(rng, parts)}`);
    const def = base(name.slice(4), 'wilderness', region, p, region.culture ?? 'generic', true);
    // Something native haunts the wild places of a culture's lands.
    const haunted = pack?.haunt && rng.chance(0.7) ? { haunt: pack.haunt } : {};
    placed.push({ ...p, def: { ...def, ...haunted } });
  }

  return {
    locations: placed.map((p) => p.def),
    routes: buildRoads(rng, placed, regionAt),
    regions,
    width,
    height,
  };
}

/**
 * Culture packs (Phase 10) each take a cluster of regions: a heart region
 * whose people they raise, and its nearest neighbors of the same kind. Two
 * packs never share a region, and the wastes belong to nobody.
 */
function assignCultures(
  rng: Rng,
  hearts: readonly Point[],
  biomes: readonly BiomeId[],
  size: WorldSize,
): (CultureId | null)[] {
  const cultures: (CultureId | null)[] = hearts.map(() => null);
  for (const id of PACK_CULTURES) {
    const pack = packOf(id)!;
    const fits = (i: number) =>
      cultures[i] === null && biomes[i] !== 'wastes' && mainPeople(biomes[i]!) in pack.peoples;
    const candidates = hearts.map((_, i) => i).filter(fits);
    if (candidates.length === 0) continue;
    const heart = rng.pick(candidates);
    const reach = size === 'small' ? 1 : size === 'medium' ? Math.min(2, pack.reach) : pack.reach;
    const cluster = candidates
      .filter((i) => i !== heart)
      .sort((a, b) => dist(hearts[a]!, hearts[heart]!) - dist(hearts[b]!, hearts[heart]!))
      .slice(0, reach - 1);
    for (const i of [heart, ...cluster]) cultures[i] = id;
  }
  return cultures;
}

/** The people most at home in a land. */
function mainPeople(biome: BiomeId): PeopleId | 'none' {
  const peoples = Object.entries(BIOMES[biome].peoples) as [PeopleId, number][];
  return peoples.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
}

/** Spreads `count` points over the map, no two closer than `spacing` if it can. */
function scatter(rng: Rng, count: number, width: number, height: number, spacing: number): Point[] {
  const points: Point[] = [];
  let gap = spacing;
  while (points.length < count) {
    let found = false;
    for (let attempt = 0; attempt < 200 && !found; attempt++) {
      const p = { x: rng.next() * width, y: rng.next() * height };
      if (points.every((q) => dist(p, q) >= gap)) {
        points.push(p);
        found = true;
      }
    }
    if (!found) gap *= 0.9;
  }
  return points;
}

/**
 * One homeland for each people, the wastes as far from the middle as the map
 * goes, and the rest by weight.
 */
function assignBiomes(
  rng: Rng,
  hearts: readonly Point[],
  width: number,
  height: number,
): BiomeId[] {
  const biomes: (BiomeId | undefined)[] = hearts.map(() => undefined);
  const centre = { x: width / 2, y: height / 2 };
  const farthest = hearts
    .map((p, i) => [i, dist(p, centre)] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  biomes[farthest] = 'wastes';
  const free = hearts.map((_, i) => i).filter((i) => biomes[i] === undefined);
  for (const people of PEOPLES) {
    const i = free.splice(rng.int(0, free.length - 1), 1)[0];
    if (i !== undefined) biomes[i] = HOMELANDS[people];
  }
  for (const i of free) {
    biomes[i] = rng.weighted(Object.entries(BIOME_WEIGHTS) as [BiomeId, number][]);
  }
  return biomes as BiomeId[];
}

function townDef(
  rng: Rng,
  names: Set<string>,
  region: RegionDef,
  people: PeopleId,
  p: Point,
): LocationDef {
  const biome = biomeDef(region.biome);
  // A people living in a culture's lands is raised in its ways, if the culture takes them in.
  const local = region.culture && packOf(region.culture)?.peoples[people];
  const culture: CultureId = local ? region.culture! : SPECIES[people].culture;
  const parts = CULTURES[culture] as CultureDef;
  const name = uniqueName(rng, names, () =>
    compose(rng, { first: parts.townPrefixes ?? [], second: parts.townSuffixes ?? [], join: '' }),
  );
  const mine = rng.chance(biome.mine);
  const workforce: Partial<Record<ProfessionId, number>> = { ...biome.workforce };
  if (!mine && workforce.miners) {
    workforce.farmers = (workforce.farmers ?? 0) + workforce.miners;
    delete workforce.miners;
  }
  const economy: EconomyDef = mine ? { workforce, mine: true } : { workforce };
  return {
    ...base(name, 'town', region, p, culture),
    population: { [people]: rng.int(biome.townSize[0], biome.townSize[1]) },
    academy: rng.chance(biome.academy),
    economy,
  };
}

/**
 * Towns close to land of another people's homeland take in some of that
 * people too: the rare mixed places where trade and tongues cross.
 */
function mixBorderTowns(
  rng: Rng,
  placed: Placed[],
  regions: readonly RegionDef[],
  regionAt: (p: Point) => RegionDef,
  count: number,
): void {
  const candidates: { index: number; margin: number; other: PeopleId }[] = [];
  placed.forEach((town, index) => {
    if (town.def.kind !== 'town') return;
    const own = regionAt(town);
    const people = Object.keys(town.def.population ?? {})[0] as PeopleId;
    for (const r of regions) {
      if (r.id === own.id) continue;
      const theirs = homelandPeople(r.biome);
      if (!theirs || theirs === people) continue;
      // How much nearer their own heart is than the other land's.
      candidates.push({ index, margin: dist(town, r) - dist(town, own), other: theirs });
    }
  });
  candidates.sort((a, b) => a.margin - b.margin);
  const mixed = new Set<number>();
  for (const c of candidates) {
    if (mixed.size >= count) break;
    if (mixed.has(c.index)) continue;
    mixed.add(c.index);
    const town = placed[c.index]!;
    const population = { ...town.def.population } as Partial<Record<SpeciesId, number>>;
    const total = Object.values(population).reduce<number>((a, n) => a + (n ?? 0), 0);
    population[c.other] = Math.round(total * (0.35 + 0.2 * rng.next()));
    placed[c.index] = { ...town, def: { ...town.def, population } };
  }
}

function homelandPeople(biome: BiomeId): PeopleId | null {
  return PEOPLES.find((p) => HOMELANDS[p] === biome) ?? null;
}

function dungeonDef(
  rng: Rng,
  names: Set<string>,
  region: RegionDef,
  p: Point,
  nearestTown: number,
  id: DungeonTemplateId,
): LocationDef {
  const template = DUNGEON_TEMPLATES[id];
  const danger = Math.max(
    1,
    Math.min(
      5,
      Math.round(1 + nearestTown / 10 + (region.biome === 'wastes' ? 1 : 0) + rng.next()),
    ),
  );
  const scale = 0.6 + 0.2 * danger;
  const name = uniqueName(rng, names, () => compose(rng, template.names));
  const dungeon: DungeonDef = {
    danger,
    depth: 6 + danger * 2 + rng.int(-1, 1),
    rooms: template.rooms,
    inhabitants: template.inhabitants
      .map((i) => {
        const max = Math.round(i.max * scale);
        return {
          creature: i.creature,
          initial: Math.round(max * 0.75),
          max,
          regrowthPerDay: Math.round(i.regrowthPerDay * scale * 1000) / 1000,
        };
      })
      .filter((i) => i.max >= 1),
    treasureGold: template.treasureGold,
    treasure: COMMON_TREASURE,
    masters: template.masters,
  };
  return {
    ...base(name, 'dungeon', region, p, region.culture ?? 'generic', template.article),
    dungeon,
  };
}

/** A culture's own kinds of dungeon, mostly, among the land's. */
function pickTemplate(rng: Rng, region: RegionDef): DungeonTemplateId {
  const pack = region.culture ? packOf(region.culture) : null;
  const weights = new Map(
    Object.entries(biomeDef(region.biome).dungeons) as [DungeonTemplateId, number][],
  );
  for (const [t, w] of Object.entries(pack?.dungeons ?? {}) as [DungeonTemplateId, number][]) {
    weights.set(t, (weights.get(t) ?? 0) + 3 * w);
  }
  return rng.weighted([...weights]);
}

function fortressName(rng: Rng, region: RegionDef): string {
  const first = [
    'Raven',
    'Iron',
    'Storm',
    'High',
    'Grey',
    'Black',
    'Wolf',
    'Eagle',
    'Stag',
    'Dawn',
    'Bright',
    'Hawk',
  ];
  const second =
    region.biome === 'mountains'
      ? ['crag', 'hold', 'spire']
      : ['watch', 'keep', 'guard', 'tower', 'hold'];
  return compose(rng, { first, second, join: '' });
}

function base(
  name: string,
  kind: LocationDef['kind'],
  region: RegionDef,
  p: Point,
  culture: LocationDef['culture'],
  article = false,
): LocationDef {
  return {
    id: slug(name),
    name,
    ...(article ? { article: 'the' as const } : {}),
    kind,
    culture,
    x: round(p.x),
    y: round(p.y),
    region: region.id,
  };
}

/**
 * Roads: the Gabriel graph of the towns, fortresses and wild places (two
 * places are joined when no third lies between them), without its longest
 * detours. Each dungeon hangs off the road at its nearest place, and the
 * hours follow the land the road crosses.
 */
function buildRoads(
  rng: Rng,
  placed: readonly Placed[],
  regionAt: (p: Point) => RegionDef,
): RouteDef[] {
  const nodes = placed.filter((p) => p.def.kind !== 'dungeon');
  const routes: RouteDef[] = [];
  const hours = (a: Point, b: Point) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const land =
      (BIOMES[regionAt(a).biome].travel +
        2 * BIOMES[regionAt(mid).biome].travel +
        BIOMES[regionAt(b).biome].travel) /
      4;
    return Math.max(2, Math.round(dist(a, b) * land * HOURS_PER_LEAGUE));
  };

  const edges: [number, number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = dist(a, b) / 2;
      if (nodes.some((c, k) => k !== i && k !== j && dist(c, mid) < r)) continue;
      edges.push([i, j, dist(a, b)]);
    }
  }
  // Keep a spanning tree whatever happens, then the rest unless they're long detours.
  const lengths = edges.map((e) => e[2]).sort((a, b) => a - b);
  const longest = (lengths[Math.floor(lengths.length * 0.5)] ?? 0) * 2.2;
  const tree = spanningTree(nodes.length, edges);
  for (const [i, j, d] of edges) {
    if (!tree.has(`${i}-${j}`) && d > longest) continue;
    const a = nodes[i]!;
    const b = nodes[j]!;
    routes.push({ between: [a.def.id, b.def.id], hours: hours(a, b) });
  }

  for (const d of placed.filter((p) => p.def.kind === 'dungeon')) {
    const byDistance = [...nodes].sort((a, b) => dist(d, a) - dist(d, b));
    const links = rng.chance(0.3) ? byDistance.slice(0, 2) : byDistance.slice(0, 1);
    for (const n of links) routes.push({ between: [n.def.id, d.def.id], hours: hours(n, d) });
  }
  return routes;
}

/** Kruskal: the shortest edges that join everything, as "i-j" keys. */
function spanningTree(count: number, edges: readonly [number, number, number][]): Set<string> {
  const parent = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const tree = new Set<string>();
  for (const [i, j] of [...edges].sort((a, b) => a[2] - b[2])) {
    const a = find(i);
    const b = find(j);
    if (a === b) continue;
    parent[a] = b;
    tree.add(`${i}-${j}`);
  }
  return tree;
}

function compose(rng: Rng, parts: NameParts): string {
  return `${rng.pick(parts.first)}${parts.join}${rng.pick(parts.second)}`;
}

/** A name nobody else in the world has; numbered if the words run out. */
function uniqueName(rng: Rng, taken: Set<string>, make: () => string): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = make();
    if (!taken.has(name) && !taken.has(slug(name))) {
      taken.add(name);
      taken.add(slug(name));
      return name;
    }
  }
  const name = `${make()} ${rng.int(2, 99)}`;
  taken.add(name);
  taken.add(slug(name));
  return name;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the /, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function nearest<T extends Point>(points: readonly T[], p: Point): T {
  let best = points[0]!;
  let bestD = Infinity;
  for (const q of points) {
    const d = dist(p, q);
    if (d < bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
