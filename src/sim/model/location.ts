import type { CultureId, LocationKind } from '../../content';
import type { LocationId, RouteId } from './ids';

export interface Location {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
  readonly culture: CultureId;
}

/** A two-way road between two locations. */
export interface Route {
  readonly id: RouteId;
  readonly a: LocationId;
  readonly b: LocationId;
  /** Typical travel time on foot, in seconds. */
  readonly duration: number;
}
