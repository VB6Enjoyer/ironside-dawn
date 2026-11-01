import { GOODS, type ProfessionId } from '../content';
import {
  goingPrice,
  houseQuote,
  Importance,
  moneyHeld,
  priceIndex,
  renownOf,
  toCalendar,
  type Character,
  type CharacterId,
  type EventQuery,
  type Location,
  type LocationId,
  type Party,
  type PartyId,
  type Simulation,
} from '../sim';
import type {
  CaravanEntry,
  CharacterSummary,
  CharacterView,
  ChronicleView,
  FallenEntry,
  FamilyTree,
  GoodQuote,
  HallsView,
  HeroEntry,
  HouseEntry,
  DreadEntry,
  LocationView,
  MapTraveler,
  MapView,
  MarketView,
  PlaceEntry,
  PlaceSummary,
  SavedGame,
  SearchView,
  StatsView,
  TradeView,
  WantedEntry,
  WorldSlice,
} from './protocol';

/** Answers to the UI's requests, read from the world inside the worker. */

const STORY_LIMIT = 200;
const PLACE_EVENTS_LIMIT = 100;
const HALL_SIZE = 25;
const SEARCH_LIMIT = 30;
const EVENTS_LIMIT = 500;
/** Everyday events kept in a save, besides the whole chronicle. */
const SAVED_RECENT_EVENTS = 2_000;
/** Notable, but not worth a place in the chronicle. */
const ROUTINE = new Set(['calendar.season', 'world.created']);

export const fullName = (c: Character) => `${c.givenName} ${c.familyName}`;

export function summarize(c: Character): CharacterSummary {
  return {
    id: c.id,
    name: fullName(c),
    species: c.species,
    level: c.level,
    homeId: c.homeId,
    locationId: c.locationId,
    outlaw: c.outlaw !== null,
    dead: c.death !== null,
    calling: c.calling,
    born: c.born,
    died: c.death?.at ?? null,
    legend: legends.has(c.id),
  };
}

/** Who is remembered in song, as a set for summaries, rebuilt when the world or its heroes change. */
let legends: ReadonlySet<CharacterId> = new Set();
let legendsOf: readonly CharacterId[] | null = null;
function noteLegends(sim: Simulation): void {
  const heroes = sim.world.heroes;
  if (legendsOf === heroes && legends.size === heroes.length) return;
  legendsOf = heroes;
  legends = new Set(heroes);
}

export function placeEntry(l: Location): PlaceEntry {
  return { id: l.id, name: l.name, article: l.article, kind: l.kind };
}

/** A slice of the world holding these people and what they belong to. */
function sliceFor(sim: Simulation, ids: Iterable<CharacterId>): WorldSlice {
  const world = sim.world;
  noteLegends(sim);
  const characters = new Map<CharacterId, CharacterSummary>();
  const parties = new Map<PartyId, Party>();
  const add = (id: CharacterId) => {
    const c = world.characters.get(id);
    if (!c || characters.has(id)) return;
    characters.set(id, summarize(c));
    if (c.partyId) {
      const party = world.parties.get(c.partyId);
      if (party) parties.set(party.id, party);
    }
  };
  for (const id of ids) add(id);
  for (const party of [...parties.values()]) party.members.forEach(add);
  const bounties = new Map(
    [...characters.keys()].flatMap((id) => {
      const bounty = world.bounties.get(id);
      return bounty ? [[id, bounty] as const] : [];
    }),
  );
  return { time: world.time, characters, locations: world.locations, parties, bounties };
}

export function characterView(sim: Simulation, id: CharacterId): CharacterView | null {
  const character = sim.world.characters.get(id);
  if (!character) return null;
  noteLegends(sim);
  const family = familyOf(sim, character);
  const related = [
    id,
    ...(Object.keys(character.opinions) as CharacterId[]),
    ...Object.values(family)
      .flat()
      .filter((x): x is CharacterId => typeof x === 'string'),
  ];
  for (const memory of character.memories) {
    if ('characterId' in memory) related.push(memory.characterId);
  }
  if (character.death?.cause.kind === 'character') related.push(character.death.cause.characterId);
  return {
    slice: sliceFor(sim, related),
    family,
    character,
    events: sim.events.query({
      actor: id,
      minImportance: Importance.Normal,
      limit: STORY_LIMIT,
    }),
  };
}

function familyOf(sim: Simulation, c: Character): FamilyTree {
  const get = (id: CharacterId) => sim.world.characters.get(id);
  const parents = [...c.parents];
  const grandparents = parents.flatMap((p) => get(p)?.parents ?? []);
  const siblings = [
    ...new Set(parents.flatMap((p) => get(p)?.children ?? []).filter((x) => x !== c.id)),
  ];
  const children = [...c.children];
  const grandchildren = children.flatMap((k) => get(k)?.children ?? []);
  return { grandparents, parents, siblings, spouse: c.spouseId, children, grandchildren };
}

export function locationView(sim: Simulation, id: LocationId): LocationView | null {
  const world = sim.world;
  const location = world.locations.get(id);
  if (!location) return null;
  const present: Character[] = [];
  const fallen: Character[] = [];
  for (const c of world.characters.values()) {
    if (c.death) {
      if (c.death.locationId === id) fallen.push(c);
    } else if (c.locationId === id) {
      present.push(c);
    }
  }
  fallen.sort((a, b) => a.death!.at - b.death!.at);
  const recentFallen = fallen.slice(-HALL_SIZE);
  const living = (cid: CharacterId | null | undefined) => {
    const c = cid ? world.characters.get(cid) : undefined;
    return c && !c.death ? summarize(c) : null;
  };
  const region = location.regionId ? world.regions.get(location.regionId) : undefined;
  const holder = [...world.locations.values()].find((l) => l.fortress?.territory.includes(id));
  return {
    region: region ? { name: region.name, biome: region.biome, weather: region.weather } : null,
    lord: living(location.fortress?.lordId),
    territory: (location.fortress?.territory ?? []).map((t) => placeEntry(world.locations.get(t)!)),
    heldBy: holder ? placeEntry(holder) : null,
    master: living(location.dungeon?.masterId),
    slice: sliceFor(
      sim,
      [...present, ...recentFallen].map((c) => c.id),
    ),
    location,
    present: present.map(summarize),
    fallen: recentFallen.map(summarize),
    events: sim.events.query({
      locationId: id,
      minImportance: Importance.Normal,
      limit: PLACE_EVENTS_LIMIT,
    }),
  };
}

export function placesView(sim: Simulation): PlaceSummary[] {
  const summaries = new Map<LocationId, { present: number; outlaws: number; fallen: number }>();
  for (const id of sim.world.locations.keys())
    summaries.set(id, { present: 0, outlaws: 0, fallen: 0 });
  for (const c of sim.world.characters.values()) {
    if (c.death) {
      const s = summaries.get(c.death.locationId);
      if (s) s.fallen++;
    } else if (c.locationId) {
      const s = summaries.get(c.locationId)!;
      s.present++;
      if (c.outlaw) s.outlaws++;
    }
  }
  return [...sim.world.locations.values()].map((l) => ({
    id: l.id,
    ...summaries.get(l.id)!,
    creatures: l.dungeon
      ? Object.values(l.dungeon.population).reduce<number>((a, n) => a + (n ?? 0), 0)
      : null,
    region: regionOf(sim, l),
  }));
}

function regionOf(sim: Simulation, l: Location): PlaceSummary['region'] {
  const region = l.regionId ? sim.world.regions.get(l.regionId) : undefined;
  return region ? { name: region.name, biome: region.biome } : null;
}

export function statsView(sim: Simulation): StatsView {
  const levels: Record<number, number> = {};
  for (const c of sim.world.characters.values()) {
    if (!c.death && c.calling === 'adventurer') levels[c.level] = (levels[c.level] ?? 0) + 1;
  }
  return {
    time: sim.world.time,
    history: sim.world.history,
    levels,
    ledger: sim.world.ledger,
    money: moneyHeld(sim.world),
  };
}

const TRADE_EVENTS = [
  'trade.load',
  'trade.unload',
  'market.shock',
  'market.recover',
  'crime.robbery',
] as const;

export function marketView(sim: Simulation, id: LocationId): MarketView | null {
  const world = sim.world;
  const market = world.markets.get(id);
  if (!market) return null;
  const quotes: GoodQuote[] = GOODS.map(({ id: good }) => {
    const history = market.history[good] ?? [];
    const price = goingPrice(market, good);
    const then = history.length > 30 ? history[history.length - 31]! : null;
    const quote = houseQuote(market, good);
    return {
      good,
      price,
      change: then ? price / then : null,
      day: market.today[good] ?? null,
      bid: quote.bid,
      ask: quote.ask,
      stock: market.house.stock[good] ?? 0,
    };
  });
  const roads = new Set(
    [...world.routes.values()].filter((r) => r.a === id || r.b === id).map((r) => r.id),
  );
  return {
    townId: id,
    quotes,
    history: market.history,
    workforce: market.agents.map((a) => ({
      id: a.id as ProfessionId,
      workers: a.workers,
      income: a.income,
      vigor: a.vigor,
    })),
    shocks: world.shocks.filter((s) => s.locationId === id || (s.routeId && roads.has(s.routeId))),
    houseGold: market.house.gold,
    priceIndex: priceIndex(market),
  };
}

export function tradeView(sim: Simulation): TradeView {
  const world = sim.world;
  const merchants: CaravanEntry[] = [...world.characters.values()]
    .filter((c) => c.calling === 'merchant' && !c.death)
    .map((c) => ({
      ...summarize(c),
      gold: c.gold,
      cargo: c.cargo,
      cargoPaid: c.cargoPaid,
      destinationId: c.goal?.kind === 'trade' ? c.goal.locationId : null,
      languages: c.languages,
    }))
    .sort((a, b) => b.gold - a.gold);
  return {
    merchants,
    shocks: world.shocks.filter((s) => s.routeId !== null),
    events: sim.events.query({ types: TRADE_EVENTS, limit: 80 }),
    routes: [...world.routes.values()].map((r) => ({ id: r.id, a: r.a, b: r.b })),
  };
}

export function chronicleView(sim: Simulation, year: number | null): ChronicleView {
  const all = sim.events
    .query({ minImportance: Importance.Notable })
    .filter((e) => !ROUTINE.has(e.type));
  const years = [...new Set(all.map((e) => toCalendar(e.t).year))];
  const shown = year ?? years.at(-1) ?? null;
  return {
    years,
    year: shown,
    events: shown === null ? [] : all.filter((e) => toCalendar(e.t).year === shown),
  };
}

export function hallsView(sim: Simulation): HallsView {
  noteLegends(sim);
  const everyone = [...sim.world.characters.values()];
  const kills = (c: Character) => Object.values(c.kills).reduce((a, n) => a + (n ?? 0), 0);
  const legends = (c: Character) => c.deeds.filter((d) => d.kind === 'legend').length;

  const heroes: HeroEntry[] = everyone
    .filter((c) => !c.death && !c.outlaw && c.calling !== 'dread')
    .sort((a, b) => b.level - a.level || kills(b) - kills(a))
    .slice(0, HALL_SIZE)
    .map((c) => ({
      ...summarize(c),
      kills: kills(c),
      legends: legends(c),
      goldEarned: c.goldEarned,
    }));

  const fallen: FallenEntry[] = everyone
    .filter((c) => c.death)
    .sort((a, b) => b.death!.at - a.death!.at)
    .slice(0, HALL_SIZE * 2)
    .map((c) => ({
      ...summarize(c),
      diedAt: c.death!.at,
      cause: c.death!.cause,
      diedIn: c.death!.locationId,
    }));

  const wanted: WantedEntry[] = [...sim.world.bounties.values()]
    .map((b) => sim.world.characters.get(b.outlawId)!)
    .filter((c) => c.outlaw && !c.death)
    .map((c) => ({
      ...summarize(c),
      bounty: sim.world.bounties.get(c.id)!.amount,
      crimes: c.outlaw!.crimes,
      murders: c.outlaw!.murders,
      lastSeenAt: c.outlaw!.lastSeenAt,
    }))
    .sort((a, b) => b.bounty - a.bounty);

  const legendEntries: HeroEntry[] = [...sim.world.heroes]
    .reverse()
    .slice(0, HALL_SIZE)
    .map((id) => sim.world.characters.get(id)!)
    .map((c) => ({
      ...summarize(c),
      kills: kills(c),
      legends: legends(c),
      goldEarned: c.goldEarned,
    }));

  return {
    heroes,
    fallen,
    wanted,
    legends: legendEntries,
    houses: housesOf(sim),
    dread: dreadOf(sim),
  };
}

/** The dread, living first (most murderous first), then the fallen (latest first). */
function dreadOf(sim: Simulation): DreadEntry[] {
  const world = sim.world;
  const falls = new Map(
    sim.events
      .query({ types: ['dread.fall'] })
      .flatMap((e) => (e.type === 'dread.fall' ? [[e.data.characterId, e.data.slayerIds]] : [])),
  );
  const entry = (c: Character): DreadEntry => ({
    ...summarize(c),
    slain: c.slain,
    lairId: c.homeId,
    rose: c.arrivedAt,
    slayers: (falls.get(c.id) ?? []).map((id) => summarize(world.characters.get(id)!)),
  });
  const dread = [...world.characters.values()].filter((c) => c.calling === 'dread');
  const living = dread.filter((c) => !c.death).sort((a, b) => b.slain - a.slain);
  const fallen = dread
    .filter((c) => c.death)
    .sort((a, b) => b.death!.at - a.death!.at)
    .slice(0, HALL_SIZE);
  return [...living, ...fallen].map(entry);
}

/** Families by name: how many generations, how many legends, how renowned. */
function housesOf(sim: Simulation): HouseEntry[] {
  const world = sim.world;
  const depth = new Map<CharacterId, number>();
  const generation = (c: Character): number => {
    const known = depth.get(c.id);
    if (known !== undefined) return known;
    const parents = c.parents.map((p) => world.characters.get(p)!).filter(Boolean);
    const g = parents.length === 0 ? 1 : 1 + Math.max(...parents.map(generation));
    depth.set(c.id, g);
    return g;
  };
  const houses = new Map<string, Character[]>();
  for (const c of world.characters.values()) {
    const list = houses.get(c.familyName);
    if (list) list.push(c);
    else houses.set(c.familyName, [c]);
  }
  const heroes = new Set(world.heroes);
  return [...houses]
    .map(([familyName, members]) => {
      const greatest = members.reduce((a, b) => (renownOf(b) > renownOf(a) ? b : a));
      return {
        familyName,
        living: members.filter((c) => !c.death).length,
        members: members.length,
        // How many generations have borne the name.
        generations: new Set(members.map(generation)).size,
        renown: members.reduce((sum, c) => sum + renownOf(c), 0),
        legends: members.filter((c) => heroes.has(c.id)).length,
        greatest: summarize(greatest),
      };
    })
    .filter((h) => h.generations >= 2 || h.legends > 0)
    .sort((a, b) => b.generations - a.generations || b.renown - a.renown)
    .slice(0, HALL_SIZE);
}

export function searchView(sim: Simulation, text: string): SearchView {
  const needle = text.trim().toLowerCase();
  if (needle.length === 0) return { characters: [], places: [] };
  const characters = [...sim.world.characters.values()]
    .filter((c) => fullName(c).toLowerCase().includes(needle))
    .sort((a, b) => Number(a.death !== null) - Number(b.death !== null) || b.level - a.level)
    .slice(0, SEARCH_LIMIT)
    .map(summarize);
  const places = [...sim.world.locations.values()]
    .filter((l) => l.name.toLowerCase().includes(needle))
    .map(placeEntry);
  return { characters, places };
}

export function eventsView(sim: Simulation, query: EventQuery) {
  return sim.events.query({ ...query, limit: Math.min(query.limit ?? EVENTS_LIMIT, EVENTS_LIMIT) });
}

export function savedGame(sim: Simulation): SavedGame {
  const chronicle = sim.events.query({ minImportance: Importance.Notable });
  const recent = sim.events.query({
    minImportance: Importance.Normal,
    limit: SAVED_RECENT_EVENTS,
  });
  const ids = new Set(chronicle.map((e) => e.id));
  const events = [...chronicle, ...recent.filter((e) => !ids.has(e.id))].sort(
    (a, b) => a.id - b.id,
  );
  let living = 0;
  for (const c of sim.world.characters.values()) if (!c.death) living++;
  return { world: sim.save(), events, seed: sim.world.seed, time: sim.world.time, living };
}

export function mapView(sim: Simulation): MapView {
  const world = sim.world;
  const travelers: MapTraveler[] = [];
  const companions = new Map<CharacterId, number>();
  for (const c of world.characters.values()) {
    if (c.death || c.activity.kind !== 'accompanying') continue;
    companions.set(c.activity.leaderId, (companions.get(c.activity.leaderId) ?? 0) + 1);
  }
  for (const c of world.characters.values()) {
    if (c.death || c.activity.kind !== 'traveling') continue;
    const { leg } = c.activity;
    travelers.push({
      id: c.id,
      name: fullName(c),
      calling: c.calling,
      outlaw: c.outlaw !== null,
      from: leg.from,
      to: leg.to,
      departedAt: leg.departedAt,
      arrivesAt: leg.arrivesAt,
      party: 1 + (companions.get(c.id) ?? 0),
    });
  }
  const nameOf = (id: CharacterId | null | undefined) => {
    const c = id ? world.characters.get(id) : undefined;
    return c && !c.death ? fullName(c) : null;
  };
  return {
    time: world.time,
    width: world.width,
    height: world.height,
    regions: [...world.regions.values()].map((r) => ({
      id: r.id,
      name: r.name,
      biome: r.biome,
      x: r.x,
      y: r.y,
      weather: r.weather,
    })),
    places: [...world.locations.values()].map((l) => ({
      ...placeEntry(l),
      x: l.x,
      y: l.y,
      danger: l.dungeon?.def.danger ?? null,
      master: nameOf(l.dungeon?.masterId),
      lord: l.fortress ? nameOf(l.fortress.lordId) : null,
      garrison: l.fortress?.garrison ?? null,
      roaming: Object.values(l.roaming).reduce<number>((a, n) => a + (n ?? 0), 0),
      folk: Object.values(l.population).reduce<number>((a, n) => a + (n ?? 0), 0),
    })),
    roads: [...world.routes.values()].map((r) => ({ a: r.a, b: r.b })),
    travelers,
  };
}
