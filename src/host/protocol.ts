import type {
  BiomeId,
  ContentPack,
  CreatureId,
  CultureId,
  Role,
  GoodId,
  Goods,
  ItemBaseId,
  LocationKind,
  ProfessionId,
  SpeciesId,
  WeatherId,
} from '../content';
import type {
  Bounty,
  WorldSettings,
  Calling,
  Character,
  CharacterId,
  EventQuery,
  EventType,
  Importance,
  Ledger,
  Location,
  LocationId,
  MarketDay,
  Party,
  PartyId,
  RouteId,
  Shock,
  SimEvent,
  WorldSave,
  WorldSample,
} from '../sim';
import type { SpeedId } from './speed';

/**
 * Messages between the UI and the engine running the simulation in a Web
 * Worker (ARCHITECTURE.md §5). Everything here crosses by structured clone,
 * so it is plain data.
 */

// ---------------------------------------------------------------------------
// What the UI keeps a copy of

/** Enough about a character to name them in prose. */
export interface NameEntry {
  readonly id: CharacterId;
  readonly name: string;
  readonly species: SpeciesId;
  readonly weapon: ItemBaseId;
  readonly dead: boolean;
  /** The ways they were raised in, and what their best skills make them. */
  readonly culture: CultureId;
  readonly role: Role;
}

export interface PlaceEntry {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
  readonly culture: CultureId;
}

/** Stands in the log for events left out to keep it readable. */
export interface Digest {
  readonly digest: true;
  /** Unique among digests; negative, so never an event ID. */
  readonly id: number;
  readonly t: number;
  readonly count: number;
}

export type LogEntry = SimEvent | Digest;

export const isDigest = (entry: LogEntry): entry is Digest => 'digest' in entry;

export interface EngineStatus {
  readonly seed: string;
  /** The time shown, which at slow speeds trails the simulation a little (playback buffer). */
  readonly time: number;
  readonly running: boolean;
  readonly speed: SpeedId;
  readonly floorOverride: Importance | null;
  /** The floor in effect: the override, or the speed's default. */
  readonly floor: Importance;
  readonly eventCount: number;
  /** Events not added to the log because they were below the floor. */
  readonly hiddenCount: number;
  readonly livingCount: number;
  readonly fallenCount: number;
  /** Measured in-game seconds per real second, smoothed. */
  readonly measuredRate: number;
  readonly following: readonly CharacterId[];
  /** A skip ahead in progress. */
  readonly fastForward: { readonly from: number; readonly to: number } | null;
}

// ---------------------------------------------------------------------------
// Views: answers to requests

/**
 * Part of the world, shaped like the world itself, so the UI can read it the
 * same way: summaries of the people a view mentions, and their parties and
 * bounties.
 */
export interface WorldSlice {
  readonly time: number;
  readonly characters: ReadonlyMap<CharacterId, CharacterSummary>;
  readonly locations: ReadonlyMap<LocationId, Location>;
  readonly parties: ReadonlyMap<PartyId, Party>;
  readonly bounties: ReadonlyMap<CharacterId, Bounty>;
}

export interface CharacterSummary {
  readonly id: CharacterId;
  readonly name: string;
  readonly species: SpeciesId;
  readonly level: number;
  readonly homeId: LocationId;
  readonly locationId: LocationId | null;
  readonly outlaw: boolean;
  readonly dead: boolean;
  readonly calling: Calling;
  readonly culture: CultureId;
  readonly born: number;
  /** When they died or moved on. */
  readonly died: number | null;
  /** Remembered in song. */
  readonly legend: boolean;
}

/** A character's close family, for the family tree. */
export interface FamilyTree {
  readonly grandparents: readonly CharacterId[];
  readonly parents: readonly CharacterId[];
  readonly siblings: readonly CharacterId[];
  readonly spouse: CharacterId | null;
  readonly children: readonly CharacterId[];
  readonly grandchildren: readonly CharacterId[];
}

export interface CharacterView {
  readonly slice: WorldSlice;
  readonly character: Character;
  /** Their story so far, most recent last: everything kept above the trivial. */
  readonly events: readonly SimEvent[];
  readonly family: FamilyTree;
}

/** A family name and everyone who has borne it. */
export interface HouseEntry {
  readonly familyName: string;
  readonly living: number;
  readonly members: number;
  /** Generations born in the world, plus the founder's. */
  readonly generations: number;
  readonly renown: number;
  readonly legends: number;
  /** The most renowned who bore the name. */
  readonly greatest: CharacterSummary;
}

export interface LocationView {
  readonly slice: WorldSlice;
  readonly location: Location;
  /** The living who are here now. */
  readonly present: readonly CharacterSummary[];
  /** Those who died here, most recent last. */
  readonly fallen: readonly CharacterSummary[];
  readonly events: readonly SimEvent[];
  /** The land it lies in, and its weather today. */
  readonly region: {
    readonly id: string;
    readonly name: string;
    readonly biome: BiomeId;
    readonly weather: WeatherId;
  } | null;
  /** Fortresses: who holds it, and the places it protects. */
  readonly lord: CharacterSummary | null;
  readonly territory: readonly PlaceEntry[];
  /** The fortress whose lands it lies in. */
  readonly heldBy: PlaceEntry | null;
  /** Dungeons: the dread lairing there. */
  readonly master: CharacterSummary | null;
}

/** A place at a glance, for the list of places. */
export interface PlaceSummary {
  readonly id: LocationId;
  /** Living adventurers there now. */
  readonly present: number;
  readonly outlaws: number;
  /** Creatures in a dungeon, if it is one. */
  readonly creatures: number | null;
  /** Adventurers who have died there. */
  readonly fallen: number;
  /** The land it lies in, if the world has regions. */
  readonly region: { readonly id: string; readonly name: string; readonly biome: BiomeId } | null;
}

export interface StatsView {
  readonly time: number;
  readonly history: readonly WorldSample[];
  /** Living adventurers by level, now. */
  readonly levels: Readonly<Record<number, number>>;
  /** Every coin minted and burned so far. */
  readonly ledger: Ledger;
  readonly money: number;
}

/** One good in a town's market. */
export interface GoodQuote {
  readonly good: GoodId;
  /** The going price. */
  readonly price: number;
  /** Against thirty days ago, as a ratio (1 = unchanged), or null without the history. */
  readonly change: number | null;
  /** Yesterday's auction. */
  readonly day: MarketDay | null;
  /** What the trading house pays and asks a named character, before language. */
  readonly bid: number;
  readonly ask: number;
  readonly stock: number;
}

export interface WorkforceEntry {
  readonly id: ProfessionId;
  readonly workers: number;
  /** Gold earned from sales per worker per day. */
  readonly income: number;
  /** Fed and equipped, 0 to 1. */
  readonly vigor: number;
}

export interface MarketView {
  readonly townId: LocationId;
  readonly quotes: readonly GoodQuote[];
  /** The going price each day for the last year, per good. */
  readonly history: Readonly<Partial<Record<GoodId, readonly number[]>>>;
  readonly workforce: readonly WorkforceEntry[];
  /** Troubles in the town, and on roads out of it. */
  readonly shocks: readonly Shock[];
  readonly houseGold: number;
  /** The town's prices against where they started. */
  readonly priceIndex: number;
}

export interface CaravanEntry extends CharacterSummary {
  readonly gold: number;
  readonly cargo: Goods;
  /** What the cargo cost. */
  readonly cargoPaid: number;
  readonly destinationId: LocationId | null;
  readonly languages: Readonly<Partial<Record<string, number>>>;
}

export interface TradeView {
  /** Every living merchant, the richest first. */
  readonly merchants: readonly CaravanEntry[];
  /** Roads closed by trouble. */
  readonly shocks: readonly Shock[];
  /** Recent trading and troubles, oldest first. */
  readonly events: readonly SimEvent[];
  readonly routes: readonly {
    readonly id: RouteId;
    readonly a: LocationId;
    readonly b: LocationId;
  }[];
}

export interface ChronicleView {
  /** Years with something in the chronicle, oldest first. */
  readonly years: readonly number[];
  readonly year: number | null;
  /** Notable and legendary events of that year, oldest first. */
  readonly events: readonly SimEvent[];
}

export interface HeroEntry extends CharacterSummary {
  readonly kills: number;
  readonly legends: number;
  readonly goldEarned: number;
}

export interface FallenEntry extends CharacterSummary {
  readonly diedAt: number;
  readonly cause: NonNullable<Character['death']>['cause'];
  readonly diedIn: LocationId;
}

export interface WantedEntry extends CharacterSummary {
  readonly bounty: number;
  readonly crimes: number;
  readonly murders: number;
  readonly lastSeenAt: LocationId;
}

export interface HallsView {
  readonly heroes: readonly HeroEntry[];
  readonly fallen: readonly FallenEntry[];
  readonly wanted: readonly WantedEntry[];
  /** The great dead, most recent first. */
  readonly legends: readonly HeroEntry[];
  /** Families with several generations or great names, the most renowned first. */
  readonly houses: readonly HouseEntry[];
  /** The dread: those who still lair, the most murderous first, and the fallen, latest first. */
  readonly dread: readonly DreadEntry[];
}

export interface DreadEntry extends CharacterSummary {
  /** The lives it has claimed. */
  readonly slain: number;
  readonly lairId: LocationId;
  /** When it rose, and, for the fallen, who brought it down. */
  readonly rose: number;
  readonly slayers: readonly CharacterSummary[];
}

export interface SearchView {
  readonly characters: readonly CharacterSummary[];
  readonly places: readonly PlaceEntry[];
}

/** Everything needed to carry on a world later. */
export interface SavedGame {
  readonly world: WorldSave;
  /** The chronicle and recent history, so they survive a reload. */
  readonly events: readonly SimEvent[];
  readonly seed: string;
  readonly time: number;
  readonly living: number;
}

/** What happened while skipping ahead. */
export interface FastForwardDigest {
  readonly from: number;
  readonly to: number;
  readonly cancelled: boolean;
  readonly before: WorldSample;
  readonly after: WorldSample;
  readonly counts: Partial<Record<EventType, number>>;
  /** The most important things that happened, oldest first. */
  readonly highlights: readonly SimEvent[];
  /** Highlights left out for space. */
  readonly moreHighlights: number;
}

// ---------------------------------------------------------------------------
// Requests

export type Request =
  | { readonly kind: 'character'; readonly id: CharacterId }
  | { readonly kind: 'location'; readonly id: LocationId }
  | { readonly kind: 'places' }
  | { readonly kind: 'market'; readonly id: LocationId }
  | { readonly kind: 'trade' }
  | { readonly kind: 'stats' }
  | { readonly kind: 'chronicle'; readonly year: number | null }
  | { readonly kind: 'halls' }
  | { readonly kind: 'search'; readonly text: string }
  | { readonly kind: 'events'; readonly query: EventQuery }
  | { readonly kind: 'save' }
  | { readonly kind: 'map' }
  | { readonly kind: 'region'; readonly id: string };

export interface Responses {
  character: CharacterView | null;
  location: LocationView | null;
  places: readonly PlaceSummary[];
  market: MarketView | null;
  trade: TradeView;
  stats: StatsView;
  chronicle: ChronicleView;
  halls: HallsView;
  search: SearchView;
  events: readonly SimEvent[];
  save: SavedGame;
  map: MapView;
  region: RegionView | null;
}

/** One land (Phase 10): its culture and gods, its places, its tales, and who matters there. */
export interface RegionView {
  readonly slice: WorldSlice;
  readonly id: string;
  readonly name: string;
  readonly biome: BiomeId;
  readonly weather: WeatherId;
  readonly culture: {
    readonly id: CultureId;
    readonly name: string;
    readonly deities: readonly { readonly name: string; readonly domain: string }[];
    /** The peoples it raises, by its own names for them. */
    readonly peoples: readonly string[];
  } | null;
  readonly places: readonly PlaceEntry[];
  readonly myths: readonly {
    readonly id: number;
    readonly placeId: LocationId;
    readonly creature: CreatureId | null;
    readonly subjectId: CharacterId | null;
    readonly born: number;
    readonly deaths: number;
    readonly ended: boolean;
  }[];
  /** Lords and the dread of the land, and its most renowned living folk. */
  readonly notable: readonly (CharacterSummary & { readonly note: string })[];
}

/** Everything the world map draws (ROADMAP.md Phase 9). Distances in leagues. */
export interface MapView {
  readonly time: number;
  readonly width: number;
  readonly height: number;
  readonly regions: readonly {
    readonly id: string;
    readonly name: string;
    readonly biome: BiomeId;
    readonly x: number;
    readonly y: number;
    readonly weather: WeatherId;
  }[];
  readonly places: readonly MapPlace[];
  readonly roads: readonly { readonly a: LocationId; readonly b: LocationId }[];
  /** Everyone on the road, leaders only: their companions travel with them. */
  readonly travelers: readonly MapTraveler[];
}

export interface MapPlace extends PlaceEntry {
  readonly x: number;
  readonly y: number;
  /** Dungeons: how deadly, and the dread lairing there. */
  readonly danger: number | null;
  readonly master: string | null;
  /** Fortresses: the lord, and how many soldiers. */
  readonly lord: string | null;
  readonly garrison: number | null;
  /** Creatures loose there. */
  readonly roaming: number;
  /** Towns: commoners. */
  readonly folk: number;
}

export interface MapTraveler {
  readonly id: CharacterId;
  readonly name: string;
  readonly calling: Calling;
  readonly outlaw: boolean;
  readonly from: LocationId;
  readonly to: LocationId;
  readonly departedAt: number;
  readonly arrivesAt: number;
  /** Including companions. */
  readonly party: number;
}

export type RequestOf<K extends Request['kind']> = Extract<Request, { kind: K }>;

// ---------------------------------------------------------------------------
// Messages

export interface InitOptions {
  readonly seed: string;
  readonly characterCount?: number;
  /** Choices for a new world; anything left out takes its default. */
  readonly settings?: Partial<WorldSettings>;
  /** Content packs to add before the world is made. */
  readonly packs?: readonly ContentPack[];
  readonly restore?: SavedGame;
}

export type ClientMessage =
  | ({ readonly kind: 'init' } & InitOptions)
  | { readonly kind: 'start' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'speed'; readonly speed: SpeedId }
  | { readonly kind: 'floor'; readonly floor: Importance | null }
  | { readonly kind: 'step' }
  | { readonly kind: 'follow'; readonly ids: readonly CharacterId[] }
  | { readonly kind: 'watchPlace'; readonly id: LocationId | null }
  | { readonly kind: 'fastForward'; readonly until: number }
  | { readonly kind: 'cancelFastForward' }
  | { readonly kind: 'request'; readonly id: number; readonly request: Request };

export type EngineMessage =
  | {
      readonly kind: 'update';
      readonly status: EngineStatus;
      /** New log entries, oldest first. */
      readonly entries: readonly LogEntry[];
      /** New or changed names. */
      readonly names: readonly NameEntry[];
      /** Sent once, with the first update. */
      readonly places?: readonly PlaceEntry[];
      /** A skip ahead just finished. */
      readonly digest?: FastForwardDigest;
    }
  | { readonly kind: 'reply'; readonly id: number; readonly result: unknown }
  | { readonly kind: 'error'; readonly id: number | null; readonly message: string };

/** Either end of a message channel: a worker, the worker's `self`, or a test double. */
export interface Port<In, Out> {
  postMessage(message: Out): void;
  onmessage: ((event: { data: In }) => void) | null;
}
