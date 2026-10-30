import type { CreatureId, CultureId, DungeonDef, LocationKind, SpeciesId } from '../../content';
import type { LocationId, RouteId } from './ids';
import type { Item } from './item';

export interface Location {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
  readonly culture: CultureId;
  /** Towns: commoners by people, a statistical population new adventurers come from. */
  readonly population: Partial<Record<SpeciesId, number>>;
  readonly academy: boolean;
  readonly dungeon: Dungeon | null;
}

export interface Dungeon {
  readonly def: DungeonDef;
  /** Statistical population: how many of each creature live here now. */
  readonly population: Partial<Record<CreatureId, number>>;
  /** Legendary items lost here with their fallen owners, waiting to be found again. */
  lostItems: Item[];
}

/** A two-way road between two locations. */
export interface Route {
  readonly id: RouteId;
  readonly a: LocationId;
  readonly b: LocationId;
  /** Typical travel time on foot, in seconds. */
  readonly duration: number;
}
