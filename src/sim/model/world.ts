import type { SchedulerState } from '../core/scheduler';
import type { SpeciesId } from '../../content';
import type { Calling, Character, DeathCause } from './character';
import type { Ledger, Market, Shock } from './market';
import type { Encounter } from './encounter';
import type { CharacterId, EncounterId, ItemId, LocationId, PartyId, RouteId } from './ids';
import type { Bounty, Party } from './social';
import type { Legend } from './item';
import type { Job } from './jobs';
import type { Location, Route } from './location';

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
}

export interface Tally {
  robberies: number;
  murders: number;
  bountiesClaimed: number;
  legendsFound: number;
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
