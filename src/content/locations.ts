import type { CultureId } from './cultures';

export type LocationKind = 'town' | 'dungeon' | 'wilderness';

export interface LocationDef {
  readonly id: string;
  readonly name: string;
  /** Article used before the name in prose ("the Witherwood"). */
  readonly article?: 'the';
  readonly kind: LocationKind;
  readonly culture: CultureId;
}

export interface RouteDef {
  readonly between: readonly [string, string];
  /** Typical travel time on foot. Actual journeys vary around it. */
  readonly hours: number;
}

export interface MapDef {
  readonly locations: readonly LocationDef[];
  readonly routes: readonly RouteDef[];
}
