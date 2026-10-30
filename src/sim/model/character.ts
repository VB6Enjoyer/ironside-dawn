import type {
  CreatureId,
  CultureId,
  LootId,
  PastimeId,
  SpeciesId,
  Stats,
  TrapId,
  WeaponId,
} from '../../content';
import type { CreatureRef } from './encounter';
import type { CharacterId, EncounterId, LocationId } from './ids';

export interface Character {
  readonly id: CharacterId;
  readonly givenName: string;
  readonly familyName: string;
  readonly species: SpeciesId;
  readonly culture: CultureId;
  readonly homeId: LocationId;
  /** World time the character entered the world. */
  readonly arrivedAt: number;

  readonly stats: Stats;
  readonly weapon: WeaponId;
  /** 0 (timid) to 1 (fearless). The first trait; full personalities arrive in Phase 4. */
  readonly bravery: number;

  hp: number;
  readonly maxHp: number;
  stamina: number;
  readonly maxStamina: number;
  /** Timed conditions. Wounded and exhausted are derived from hp and stamina instead. */
  statuses: TimedStatus[];

  gold: number;
  /** Loot carried, waiting to be sold. */
  pack: LootItem[];
  kills: Partial<Record<CreatureId, number>>;
  /** Lifetime gold from loot sold and coins found, for reports. */
  goldEarned: number;
  /** After a trip, adventurers spend a few days in town before setting out again. */
  homeUntil: number;

  /** Where the character is, or null while on the road. */
  locationId: LocationId | null;
  activity: Activity;
  death: Death | null;
}

export interface TimedStatus {
  readonly kind: 'dizzy';
  readonly until: number;
}

export interface LootItem {
  readonly loot: LootId;
  readonly value: number;
}

export interface Death {
  readonly at: number;
  readonly locationId: LocationId;
  readonly cause: DeathCause;
}

export type DeathCause =
  | { readonly kind: 'creature'; readonly creature: CreatureRef }
  | { readonly kind: 'trap'; readonly trap: TrapId };

export interface DelveProgress {
  readonly locationId: LocationId;
  /** Chambers explored so far. */
  readonly room: number;
  readonly goldFound: number;
  readonly itemsFound: number;
}

export type Activity =
  /** At a location, about to decide what to do next. */
  | { readonly kind: 'idle' }
  /** Passing time at a location from `since` until `until`. */
  | {
      readonly kind: 'pastime';
      readonly pastime: PastimeId;
      readonly since: number;
      readonly until: number;
    }
  /** Sleeping. `paid` is false when there was no inn, or no money for one. */
  | {
      readonly kind: 'resting';
      readonly since: number;
      readonly until: number;
      readonly paid: boolean;
    }
  /** Resting in town by day to heal wounds. */
  | { readonly kind: 'convalescing'; readonly since: number; readonly until: number }
  | {
      readonly kind: 'traveling';
      readonly destinationId: LocationId;
      readonly leg: TravelLeg;
      /** Stops still to come after the current leg, ending at the destination. */
      readonly remaining: readonly LocationId[];
    }
  | ({ readonly kind: 'delving' } & DelveProgress)
  | {
      readonly kind: 'fighting';
      readonly encounterId: EncounterId;
      /** The delve to return to after the fight. */
      readonly delve: DelveProgress;
    }
  | { readonly kind: 'dead' };

export interface TravelLeg {
  readonly from: LocationId;
  readonly to: LocationId;
  readonly departedAt: number;
  readonly arrivesAt: number;
}
