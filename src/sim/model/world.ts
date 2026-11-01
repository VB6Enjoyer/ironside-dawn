import type { SchedulerState } from '../core/scheduler';
import type { CreatureId, CultureId, SpeciesId } from '../../content';
import type { Calling, Character, DeathCause } from './character';
import type { Ledger, Market, Shock } from './market';
import type { Encounter } from './encounter';
import type {
  CharacterId,
  EncounterId,
  ItemId,
  LocationId,
  PartyId,
  RegionId,
  RouteId,
} from './ids';
import type { Bounty, Party } from './social';
import type { Legend } from './item';
import type { Job } from './jobs';
import type { Location, Region, Route } from './location';

/**
 * The whole world state: plain data, entities referring to each other by ID
 * (ARCHITECTURE.md §4.3). Behavior lives in systems, never on these objects.
 */
export interface World {
  readonly seed: string;
  /** Current world time, in seconds. */
  time: number;
  /** Every character who ever lived, including the dead. */
  readonly characters: Map<CharacterId, Character>;
  readonly locations: Map<LocationId, Location>;
  readonly routes: Map<RouteId, Route>;
  /** The lands of a generated world; none on the starter map. */
  readonly regions: Map<RegionId, Region>;
  /** The map's extent in leagues. */
  readonly width: number;
  readonly height: number;
  /** Fights in progress. */
  readonly encounters: Map<EncounterId, Encounter>;
  /** Every legendary item ever found. */
  readonly legends: Map<ItemId, Legend>;
  readonly parties: Map<PartyId, Party>;
  /** Prices on outlaws' heads, by outlaw. */
  readonly bounties: Map<CharacterId, Bounty>;
  readonly scheduler: SchedulerState<Job>;
  /** Full names in use, so new characters get distinct ones. */
  readonly takenNames: Set<string>;
  nextCharacterNumber: number;
  nextEncounterNumber: number;
  nextItemNumber: number;
  nextPartyNumber: number;
  nextEventId: number;
  /** Running totals of things that happened, for statistics. */
  readonly tally: Tally;
  /** The state of the world at the start of every season. */
  readonly history: WorldSample[];
  /** Each town's market. */
  readonly markets: Map<LocationId, Market>;
  /** Troubles in progress. */
  shocks: Shock[];
  readonly ledger: Ledger;
  /** The great dead, whose deeds are told in taverns, most recent last. */
  readonly heroes: CharacterId[];
  /** Local legends grown out of what happened (Phase 10), oldest first. */
  readonly myths: Myth[];
  /** Deaths so far to each creature at each wild place, by "place|creature", toward a myth. */
  readonly omens: Record<string, number>;
}

/**
 * A local legend: something that has killed people at a place, as the folk
 * of the land tell it ("the kappa of the Yanagi Ford").
 */
export interface Myth {
  readonly id: number;
  readonly locationId: LocationId;
  readonly regionId: RegionId | null;
  /** Whose tale it is: the culture of the land, or the generic one. */
  readonly culture: CultureId;
  readonly subject:
    | { readonly kind: 'creature'; readonly creature: CreatureId }
    | { readonly kind: 'dread'; readonly characterId: CharacterId };
  readonly born: number;
  /** Lives it has taken. */
  deaths: number;
  /** When the dread it tells of was destroyed. */
  endedAt: number | null;
}

export interface Tally {
  robberies: number;
  murders: number;
  bountiesClaimed: number;
  legendsFound: number;
  raids: number;
  /** Dread masters destroyed. */
  dreadSlain: number;
}

export interface WorldSample {
  readonly t: number;
  /** Everyone living, by species: adventurers, merchants, townsfolk and children. */
  readonly population: Partial<Record<SpeciesId, number>>;
  /** Everyone living, by how they live. */
  readonly callings: Partial<Record<Calling, number>>;
  /** Deaths so far, by cause. */
  readonly deaths: Partial<Record<DeathCause['kind'], number>>;
  readonly meanLevel: number;
  readonly maxLevel: number;
  /** Gold held by living adventurers; levels are theirs too. */
  readonly gold: number;
  readonly outlaws: number;
  readonly parties: number;
  readonly robberies: number;
  readonly murders: number;
  readonly bountiesClaimed: number;
  readonly legendsFound: number;
  /** Gold held by everyone: adventurers, merchants, trades and trading houses. */
  readonly money: number;
  /** Each town's prices against where they started (1 = unchanged), for a basket of everyday goods. */
  readonly prices: Partial<Record<LocationId, number>>;
}
