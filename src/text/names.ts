import type { ItemBaseId, LocationKind, SpeciesId } from '../content';
import type { CharacterId, LocationId, World } from '../sim';

/** Looks up what the renderer needs to name things in prose. */
export interface NameResolver {
  character(
    id: CharacterId,
  ):
    { readonly name: string; readonly species: SpeciesId; readonly weapon: ItemBaseId } | undefined;
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
      return (
        c && {
          name: `${c.givenName} ${c.familyName}`,
          species: c.species,
          weapon: c.equipment.weapon.base,
        }
      );
    },
    location(id) {
      return world.locations.get(id);
    },
  };
}

export const SPECIES_NAMES: Record<
  SpeciesId,
  { readonly singular: string; readonly plural: string }
> = {
  human: { singular: 'human', plural: 'humans' },
  elf: { singular: 'elf', plural: 'elves' },
  dwarf: { singular: 'dwarf', plural: 'dwarves' },
};
