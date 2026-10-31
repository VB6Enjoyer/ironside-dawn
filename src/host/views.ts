import {
  Importance,
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
  CharacterSummary,
  CharacterView,
  ChronicleView,
  FallenEntry,
  HallsView,
  HeroEntry,
  LocationView,
  PlaceEntry,
  PlaceSummary,
  SavedGame,
  SearchView,
  StatsView,
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
  };
}

export function placeEntry(l: Location): PlaceEntry {
  return { id: l.id, name: l.name, article: l.article, kind: l.kind };
}

/** A slice of the world holding these people and what they belong to. */
function sliceFor(sim: Simulation, ids: Iterable<CharacterId>): WorldSlice {
  const world = sim.world;
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
  const related = [id, ...(Object.keys(character.opinions) as CharacterId[])];
  for (const memory of character.memories) {
    if ('characterId' in memory) related.push(memory.characterId);
  }
  if (character.death?.cause.kind === 'character') related.push(character.death.cause.characterId);
  return {
    slice: sliceFor(sim, related),
    character,
    events: sim.events.query({
      actor: id,
      minImportance: Importance.Normal,
      limit: STORY_LIMIT,
    }),
  };
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
  return {
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
  }));
}

export function statsView(sim: Simulation): StatsView {
  const levels: Record<number, number> = {};
  for (const c of sim.world.characters.values()) {
    if (!c.death) levels[c.level] = (levels[c.level] ?? 0) + 1;
  }
  return { time: sim.world.time, history: sim.world.history, levels };
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
  const everyone = [...sim.world.characters.values()];
  const kills = (c: Character) => Object.values(c.kills).reduce((a, n) => a + (n ?? 0), 0);
  const legends = (c: Character) => c.deeds.filter((d) => d.kind === 'legend').length;

  const heroes: HeroEntry[] = everyone
    .filter((c) => !c.death && !c.outlaw)
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

  return { heroes, fallen, wanted };
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
