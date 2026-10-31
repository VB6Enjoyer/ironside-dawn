import type { Character, CharacterId, LocationId, World } from '../model';

/**
 * Who is where: an index of characters by location, so meetings, ambushes and
 * hunts look only at the people present instead of everyone in the world.
 * Every change of `locationId` goes through `moveTo` to keep it right.
 *
 * Each place's list is kept in order of creation, however it was built, so a
 * world indexed from scratch (after loading, say) makes the same choices as
 * one indexed as it went.
 */

const indexes = new WeakMap<World, Map<LocationId, CharacterId[]>>();

/** Characters are numbered as they are created: c1, c2, … */
const ordinal = (id: CharacterId) => Number(id.slice(1));

function indexOf(world: World): Map<LocationId, CharacterId[]> {
  let index = indexes.get(world);
  if (!index) {
    index = new Map();
    for (const c of world.characters.values()) {
      if (c.locationId) add(index, c.locationId, c.id);
    }
    indexes.set(world, index);
  }
  return index;
}

function add(index: Map<LocationId, CharacterId[]>, at: LocationId, id: CharacterId): void {
  let ids = index.get(at);
  if (!ids) {
    ids = [];
    index.set(at, ids);
  }
  const n = ordinal(id);
  let lo = 0;
  let hi = ids.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ordinal(ids[mid]!) < n) lo = mid + 1;
    else hi = mid;
  }
  ids.splice(lo, 0, id);
}

function remove(index: Map<LocationId, CharacterId[]>, at: LocationId, id: CharacterId): void {
  const ids = index.get(at);
  const i = ids?.indexOf(id) ?? -1;
  if (i >= 0) ids!.splice(i, 1);
}

/** Sets where a character is (null: on the road). */
export function moveTo(world: World, character: Character, locationId: LocationId | null): void {
  if (character.locationId === locationId) return;
  const index = indexes.get(world);
  if (index) {
    if (character.locationId) remove(index, character.locationId, character.id);
    if (locationId) add(index, locationId, character.id);
  }
  character.locationId = locationId;
}

/** Everyone at a place, the dead included (they stay where they fell), oldest first. */
export function charactersAt(world: World, locationId: LocationId): Character[] {
  const ids = indexOf(world).get(locationId);
  return ids ? ids.map((id) => world.characters.get(id)!) : [];
}

/** Adds a newly created character to the index. */
export function arrive(world: World, character: Character): void {
  const index = indexes.get(world);
  if (index && character.locationId) add(index, character.locationId, character.id);
}
