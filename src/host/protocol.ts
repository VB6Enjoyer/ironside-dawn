import type { ItemBaseId, LocationKind, SpeciesId } from '../content';
import type {
  Bounty,
  Character,
  CharacterId,
  EventQuery,
  EventType,
  Importance,
  Location,
  LocationId,
  Party,
  PartyId,
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
}

export interface PlaceEntry {
  readonly id: LocationId;
  readonly name: string;
  readonly article: 'the' | null;
  readonly kind: LocationKind;
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
}

export interface CharacterView {
  readonly slice: WorldSlice;
  readonly character: Character;
  /** Their story so far, most recent last: everything kept above the trivial. */
  readonly events: readonly SimEvent[];
}

export interface LocationView {
  readonly slice: WorldSlice;
  readonly location: Location;
  /** The living who are here now. */
  readonly present: readonly CharacterSummary[];
  /** Those who died here, most recent last. */
  readonly fallen: readonly CharacterSummary[];
  readonly events: readonly SimEvent[];
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
}

export interface StatsView {
  readonly time: number;
  readonly history: readonly WorldSample[];
  /** Living adventurers by level, now. */
  readonly levels: Readonly<Record<number, number>>;
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
  | { readonly kind: 'stats' }
  | { readonly kind: 'chronicle'; readonly year: number | null }
  | { readonly kind: 'halls' }
  | { readonly kind: 'search'; readonly text: string }
  | { readonly kind: 'events'; readonly query: EventQuery }
  | { readonly kind: 'save' };

export interface Responses {
  character: CharacterView | null;
  location: LocationView | null;
  places: readonly PlaceSummary[];
  stats: StatsView;
  chronicle: ChronicleView;
  halls: HallsView;
  search: SearchView;
  events: readonly SimEvent[];
  save: SavedGame;
}

export type RequestOf<K extends Request['kind']> = Extract<Request, { kind: K }>;

// ---------------------------------------------------------------------------
// Messages

export interface InitOptions {
  readonly seed: string;
  readonly characterCount?: number;
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
