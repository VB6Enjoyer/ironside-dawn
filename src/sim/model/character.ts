import type { CultureId, PastimeId, SpeciesId } from '../../content';
import type { CharacterId, LocationId } from './ids';

export interface Character {
  readonly id: CharacterId;
  readonly givenName: string;
  readonly familyName: string;
  readonly species: SpeciesId;
  readonly culture: CultureId;
  readonly homeId: LocationId;
  /** Where the character is, or null while on the road. */
  locationId: LocationId | null;
  activity: Activity;
}

export type Activity =
  /** At a location, about to decide what to do next. */
  | { readonly kind: 'idle' }
  /** Passing time at a location until `until`. */
  | { readonly kind: 'pastime'; readonly pastime: PastimeId; readonly until: number }
  /** Sleeping at a location until `until`. */
  | { readonly kind: 'resting'; readonly until: number }
  | {
      readonly kind: 'traveling';
      readonly destinationId: LocationId;
      readonly leg: TravelLeg;
      /** Stops still to come after the current leg, ending at the destination. */
      readonly remaining: readonly LocationId[];
    };

export interface TravelLeg {
  readonly from: LocationId;
  readonly to: LocationId;
  readonly departedAt: number;
  readonly arrivesAt: number;
}
