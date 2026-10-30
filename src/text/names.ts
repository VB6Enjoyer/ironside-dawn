import type { LocationKind, SpeciesId } from '../content';
import type { CharacterId, LocationId, World } from '../sim';

/** Looks up what the renderer needs to name things in prose. */
export interface NameResolver {
  character(id: CharacterId): { readonly name: string; readonly species: SpeciesId } | undefined;
  location(
    id: LocationId,
  ):
    | { readonly name: string; readonly article: 'the' | null; readonly kind: LocationKind }
    | undefined;
}

export function worldNames(world: World): NameResolver {
  return {
    character(id) {
      const c = world.characters.get(id);
      return c && { name: `${c.givenName} ${c.familyName}`, species: c.species };
    },
    location(id) {
      return world.locations.get(id);
    },
  };
}

export const SPECIES_NAMES: Record<SpeciesId, { readonly singular: string }> = {
  human: { singular: 'human' },
};
