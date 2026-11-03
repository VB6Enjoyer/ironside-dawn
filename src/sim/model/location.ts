import type {
  BiomeId,
  CreatureId,
  CultureId,
  DungeonDef,
  EconomyDef,
  LocationKind,
  SpeciesId,
  WeatherId,
} from '../../content';
import type { CharacterId, LocationId, RegionId, RouteId } from './ids';
import type { Item } from './item';

export interface Location {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
  readonly culture: CultureId;
  /** On the map, in leagues from the top left. */
  readonly x: number;
  readonly y: number;
  readonly regionId: RegionId | null;
  /** Towns: commoners by people, a statistical population new adventurers come from. */
  readonly population: Partial<Record<SpeciesId, number>>;
  /** How many of each people the town can hold; growth slows as it fills. */
  readonly capacity: Partial<Record<SpeciesId, number>>;
  readonly academy: boolean;
  readonly dungeon: Dungeon | null;
  /** Towns: how the commoners make a living. */
  readonly economy: EconomyDef | null;
  /** Creatures out of their dungeons and loose here, a danger on the roads. */
  readonly roaming: Partial<Record<CreatureId, number>>;
  /** A creature native to the place, that keeps coming back (a kappa at a ford). */
  readonly haunt: { readonly creature: CreatureId; readonly max: number } | null;
  /** Fortresses: who holds it, the lands it guards, and its garrison. */
  readonly fortress: Fortress | null;
}

export interface Fortress {
  lordId: CharacterId | null;
  /** The towns and wild places it protects and taxes. */
  readonly territory: readonly LocationId[];
  /** Soldiers, a statistical population paid from the lord's purse. */
  garrison: number;
  /** Since when it has stood without a lord. */
  vacantSince: number | null;
  /** Everyone who has held it, first to last. */
  readonly lineage: CharacterId[];
}

/** A stretch of one kind of land, with its own weather. */
export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly biome: BiomeId;
  /** A regional culture, if its lands have one. */
  readonly culture: CultureId | null;
  readonly x: number;
  readonly y: number;
  weather: WeatherId;
  /** When the weather last turned. */
  weatherSince: number;
}

export interface Dungeon {
  readonly def: DungeonDef;
  /** Statistical population: how many of each creature live here now. */
  readonly population: Partial<Record<CreatureId, number>>;
  /** Legendary items lost here with their fallen owners, waiting to be found again. */
  lostItems: Item[];
  /** One of the dread, lairing in the deepest chamber, if any. */
  masterId: CharacterId | null;
}

/** A two-way road between two locations. */
export interface Route {
  readonly id: RouteId;
  readonly a: LocationId;
  readonly b: LocationId;
  /** Typical travel time on foot, in seconds. */
  readonly duration: number;
}
