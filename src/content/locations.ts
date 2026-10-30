import type { CreatureId } from './creatures';
import type { CultureId } from './cultures';
import type { LootId } from './loot';
import type { SpeciesId } from './species';

export type LocationKind = 'town' | 'dungeon' | 'wilderness';

export interface LocationDef {
  readonly id: string;
  readonly name: string;
  /** Article used before the name in prose ("the Witherwood"). */
  readonly article?: 'the';
  readonly kind: LocationKind;
  readonly culture: CultureId;
  /**
   * Towns: the commoners who live here, by people. A statistical population
   * (ARCHITECTURE.md §4.2) that new adventurers are drawn from.
   */
  readonly population?: Partial<Record<SpeciesId, number>>;
  /** Towns with a library or mentors, where arcana can be studied. */
  readonly academy?: boolean;
  /** Dungeons: what lives inside and what can be found. */
  readonly dungeon?: DungeonDef;
}

export type RoomOutcome = 'fight' | 'treasure' | 'trap' | 'quiet';

export interface DungeonDef {
  /** 1 (tame) to 5 (deadly). Sets trap difficulty and treasure size. */
  readonly danger: number;
  /** The most chambers a delve can reach. */
  readonly depth: number;
  readonly rooms: Readonly<Record<RoomOutcome, number>>;
  /**
   * The creatures living here, as a statistical population (ARCHITECTURE.md
   * §4.2): counts, not individuals. Encounters draw from them; kills lower
   * them; they regrow toward `max` by `regrowthPerDay` on average.
   */
  readonly inhabitants: readonly {
    readonly creature: CreatureId;
    readonly initial: number;
    readonly max: number;
    readonly regrowthPerDay: number;
  }[];
  /** Gold dice per point of danger, and what treasure rooms may hold. */
  readonly treasureGold: string;
  readonly treasure: readonly { readonly loot: LootId; readonly weight: number }[];
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
