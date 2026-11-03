import type { BiomeId } from './biomes';
import type { CreatureId } from './creatures';
import type { ProfessionId } from './economy';
import type { CultureId } from './cultures';
import type { LootId } from './loot';
import type { SpeciesId } from './species';

export type LocationKind = 'town' | 'dungeon' | 'wilderness' | 'fortress';

export interface LocationDef {
  readonly id: string;
  readonly name: string;
  /** Article used before the name in prose ("the Witherwood"). */
  readonly article?: 'the';
  readonly kind: LocationKind;
  readonly culture: CultureId;
  /** Where it lies on the map, in leagues from the top left (generated worlds). */
  readonly x?: number;
  readonly y?: number;
  /** The region it lies in (generated worlds). */
  readonly region?: string;
  /** Wild places: a creature that haunts it, regrowing to `max` (a kappa at a ford). */
  readonly haunt?: { readonly creature: CreatureId; readonly max: number };
  /**
   * Towns: the commoners who live here, by people. A statistical population
   * (ARCHITECTURE.md §4.2) that new adventurers are drawn from.
   */
  readonly population?: Partial<Record<SpeciesId, number>>;
  /** Towns with a library or mentors, where arcana can be studied. */
  readonly academy?: boolean;
  /** Dungeons: what lives inside and what can be found. */
  readonly dungeon?: DungeonDef;
  /** Towns: how the commoners make a living, and what the land offers. */
  readonly economy?: EconomyDef;
}

export interface EconomyDef {
  /** Share of the townsfolk in each trade; the shares add up to 1. */
  readonly workforce: Partial<Record<ProfessionId, number>>;
  /** An iron mine, for miners. */
  readonly mine?: boolean;
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
  /** Which of the dread may make their lair here. */
  readonly masters?: readonly SpeciesId[];
}

export interface RouteDef {
  readonly between: readonly [string, string];
  /** Typical travel time on foot. Actual journeys vary around it. */
  readonly hours: number;
}

/** A stretch of one kind of land: the Silverwood, the Grey Peaks. */
export interface RegionDef {
  readonly id: string;
  readonly name: string;
  readonly biome: BiomeId;
  /** A regional culture (Phase 10), if its lands have one. */
  readonly culture?: CultureId;
  /** Its heart, in leagues; places belong to the nearest heart. */
  readonly x: number;
  readonly y: number;
}

export interface MapDef {
  readonly locations: readonly LocationDef[];
  readonly routes: readonly RouteDef[];
  /** Generated worlds have regions; the starter map has none. */
  readonly regions?: readonly RegionDef[];
  /** The map's extent in leagues, for drawing it. */
  readonly width?: number;
  readonly height?: number;
}
