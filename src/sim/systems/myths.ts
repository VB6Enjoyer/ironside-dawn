import type { CreatureId } from '../../content';
import type { SimContext } from '../context';
import type { Character, Location, LocationId, Myth, World } from '../model';

/**
 * Myths in the simulation (ROADMAP.md Phase 10): local legends grow out of
 * what really happened. Something that kills people at a wild place, again
 * and again, becomes a tale the folk of the land tell ("the kappa of the
 * Yanagi Ford"); so does one of the dread once it has claimed enough lives.
 * Those raised in the land tell the tale in taverns and give the place a
 * wide berth.
 */

/** Deaths to one kind of creature at one place before folk start telling of it. */
const MYTH_DEATHS = 3;
const DUNGEON_MYTH_DEATHS = 8;
/** Lives one of the dread must claim to pass into local legend. */
const DREAD_MYTH = 8;

/** Someone died to a creature at a wild place: an omen, and in time a myth. */
export function creatureKilled(ctx: SimContext, place: Location, creature: CreatureId): void {
  if (place.kind === 'town') return;
  const world = ctx.world;
  const existing = world.myths.find(
    (m) =>
      m.locationId === place.id &&
      m.subject.kind === 'creature' &&
      m.subject.creature === creature,
  );
  if (existing) {
    existing.deaths++;
    return;
  }
  const key = `${place.id}|${creature}`;
  const deaths = (world.omens[key] ?? 0) + 1;
  world.omens[key] = deaths;
  // In a dungeon death is the trade; it takes more to make a legend there.
  if (deaths < (place.kind === 'dungeon' ? DUNGEON_MYTH_DEATHS : MYTH_DEATHS)) return;
  delete world.omens[key];
  bear(ctx, place, { kind: 'creature', creature }, deaths);
}

/** One of the dread has claimed enough lives to pass into legend. */
export function dreadInfamous(ctx: SimContext, master: Character): void {
  const world = ctx.world;
  if (master.slain < DREAD_MYTH) return;
  const tale = world.myths.find(
    (m) => m.subject.kind === 'dread' && m.subject.characterId === master.id,
  );
  if (tale) {
    tale.deaths = master.slain;
    return;
  }
  const lair = world.locations.get(master.homeId);
  if (lair) bear(ctx, lair, { kind: 'dread', characterId: master.id }, master.slain);
}

/** The dread a tale tells of has been destroyed: the tale has its ending. */
export function dreadEnded(ctx: SimContext, master: Character, at: LocationId): void {
  const tale = ctx.world.myths.find(
    (m) => m.subject.kind === 'dread' && m.subject.characterId === master.id && !m.endedAt,
  );
  if (!tale) return;
  tale.endedAt = ctx.world.time;
  ctx.emit(
    { type: 'myth.end', data: { characterId: master.id, locationId: at, mythId: tale.id } },
    [],
    at,
  );
}

function bear(
  ctx: SimContext,
  place: Location,
  subject: Myth['subject'],
  deaths: number,
): void {
  const world = ctx.world;
  const region = place.regionId ? world.regions.get(place.regionId) : undefined;
  const myth: Myth = {
    id: world.myths.length + 1,
    locationId: place.id,
    regionId: place.regionId,
    culture: region?.culture ?? 'generic',
    subject,
    born: world.time,
    deaths,
    endedAt: null,
  };
  world.myths.push(myth);
  ctx.emit(
    {
      type: 'myth.born',
      data: {
        locationId: place.id,
        mythId: myth.id,
        creature: subject.kind === 'creature' ? subject.creature : null,
        characterId: subject.kind === 'dread' ? subject.characterId : null,
        deaths,
      },
    },
    subject.kind === 'dread' ? [subject.characterId] : [],
    place.id,
  );
}

/** Living tales set at each place, worked out once a day. */
const byPlace = new WeakMap<World, { day: number; tales: Map<LocationId, Myth[]> }>();

export function mythsAt(world: World, place: LocationId): readonly Myth[] {
  const day = Math.floor(world.time / 86_400);
  let cached = byPlace.get(world);
  if (!cached || cached.day !== day || cached.tales.size === 0) {
    const tales = new Map<LocationId, Myth[]>();
    for (const m of world.myths) {
      if (m.endedAt !== null) continue;
      tales.set(m.locationId, [...(tales.get(m.locationId) ?? []), m]);
    }
    cached = { day, tales };
    byPlace.set(world, cached);
  }
  return cached.tales.get(place) ?? [];
}

/**
 * How much the tales of a place frighten someone: only those raised on them,
 * the folk of the culture that tells them.
 */
export function mythFear(world: World, character: Character, place: LocationId): number {
  let fear = 0;
  for (const m of mythsAt(world, place)) {
    if (m.culture === character.culture) fear += 0.3 + Math.min(0.3, m.deaths / 30);
  }
  return fear;
}

/** A tale the teller knows: one of their own culture's, if any. */
export function taleToTell(world: World, teller: Character, roll: number): Myth | null {
  const tales = world.myths.filter((m) => m.culture === teller.culture && m.endedAt === null);
  if (tales.length === 0) return null;
  return tales[Math.floor(roll * tales.length)] ?? null;
}
