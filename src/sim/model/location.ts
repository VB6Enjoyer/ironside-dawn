import type { CreatureId, CultureId, DungeonDef, LocationKind, SpeciesId } from '../../content';
import type { LocationId, RouteId } from './ids';

export interface Location {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
  readonly culture: CultureId;
  /** Towns: which peoples live here, by relative share. */
  readonly peoples: Partial<Record<SpeciesId, number>>;
  readonly dungeon: Dungeon | null;
}

export interface Dungeon {
  readonly def: DungeonDef;
  /** Statistical population: how many of each creature live here now. */
  readonly population: Partial<Record<CreatureId, number>>;
}

/** A two-way road between two locations. */
export interface Route {
  readonly id: RouteId;
  readonly a: LocationId;
  readonly b: LocationId;
  /** Typical travel time on foot, in seconds. */
  readonly duration: number;
}
