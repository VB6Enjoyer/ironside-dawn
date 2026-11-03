import {
  packOf,
  type CultureId,
  type ItemBaseId,
  type LocationKind,
  type PeopleId,
  type Role,
  type SpeciesId,
} from '../content';
import { roleOf, type CharacterId, type LocationId, type World } from '../sim';

/** Looks up what the renderer needs to name things in prose. */
export interface NameResolver {
  character(id: CharacterId):
    | {
        readonly name: string;
        readonly species: SpeciesId;
        readonly weapon: ItemBaseId;
        readonly culture?: CultureId;
        readonly role?: Role;
      }
    | undefined;
  location(id: LocationId):
    | {
        readonly name: string;
        readonly article: 'the' | null;
        readonly kind: LocationKind;
        readonly culture?: CultureId;
      }
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
          culture: c.culture,
          role: roleOf(c),
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
  centaur: { singular: 'centaur', plural: 'centaurs' },
  lich: { singular: 'lich', plural: 'liches' },
  revenant: { singular: 'revenant', plural: 'revenants' },
  demon: { singular: 'demon', plural: 'demons' },
};

/** What a people is called by those raised in a culture: Norse dvergar for dwarves. */
export function peopleName(
  species: SpeciesId,
  culture: CultureId | undefined,
): { readonly singular: string; readonly plural: string } {
  return (culture && packOf(culture)?.peoples[species as PeopleId]) || SPECIES_NAMES[species];
}

/** What a culture calls someone of this role ("ronin"), if it has its own word. */
export function roleTitle(culture: CultureId | undefined, role: Role | undefined): string | null {
  if (!culture || !role) return null;
  return packOf(culture)?.roles[role] ?? null;
}
