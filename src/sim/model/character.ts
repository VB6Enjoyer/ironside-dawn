import type {
  CreatureId,
  CultureId,
  LootId,
  PastimeId,
  SkillId,
  SpeciesId,
  SpellId,
  StatId,
  Stats,
  TrapId,
  Traits,
} from '../../content';
import type { CreatureRef } from './encounter';
import type { CharacterId, EncounterId, ItemId, LocationId } from './ids';
import type { Equipment, Item } from './item';
import type { Drives, Expectation, Goal, Memory } from './mind';

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
  /** Personality, 0 to 1 each. Mostly fixed; bravery drifts with experience. */
  traits: Traits;
  /** Born with the gift for magic (WORLD.md §4). */
  readonly gifted: boolean;

  level: number;
  xp: number;
  /** Proficiency from 0 to 100 in each skill, grown by use. */
  skills: Record<SkillId, number>;
  equipment: Equipment;
  spells: SpellId[];
  /** Memorable moments, newest last, for the character card. Capped. */
  deeds: Deed[];

  hp: number;
  /** Recomputed from toughness, level and gear. */
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** Timed conditions. Wounded and exhausted are derived from hp and stamina instead. */
  statuses: TimedStatus[];

  gold: number;
  /** Loot carried, waiting to be sold. */
  pack: LootItem[];
  kills: Partial<Record<CreatureId, number>>;
  /** Lifetime gold from loot sold and coins found, for reports. */
  goldEarned: number;

  drives: Drives;
  /** When drives were last brought up to date. */
  drivesAt: number;
  /** Fading episodic memories, most vivid kept. Capped. */
  memories: Memory[];
  /** What each dungeon has been like for them, by location. */
  expectations: Partial<Record<LocationId, Expectation>>;
  /** Places they have been. */
  visited: LocationId[];
  goal: Goal | null;

  /** Where the character is, or null while on the road. */
  locationId: LocationId | null;
  activity: Activity;
  death: Death | null;
}

export type TimedStatus =
  | { readonly kind: 'dizzy'; readonly until: number }
  /** An attribute temporarily weakened, usually by magic. */
  | {
      readonly kind: 'drained';
      readonly stat: StatId;
      readonly amount: number;
      readonly until: number;
    };

/** Something carried to sell: a trophy or a piece of gear not worth wearing. */
export type LootItem =
  | { readonly loot: LootId; readonly value: number }
  | { readonly gear: Item; readonly value: number };

export type Deed =
  | { readonly kind: 'level'; readonly at: number; readonly level: number }
  | { readonly kind: 'legend'; readonly at: number; readonly itemId: ItemId; readonly name: string }
  | { readonly kind: 'slay'; readonly at: number; readonly creature: CreatureRef }
  | { readonly kind: 'spell'; readonly at: number; readonly spell: SpellId }
  | { readonly kind: 'rank'; readonly at: number; readonly skill: SkillId; readonly rank: string };

export interface Death {
  readonly at: number;
  readonly locationId: LocationId;
  readonly cause: DeathCause;
}

export type DeathCause =
  | { readonly kind: 'creature'; readonly creature: CreatureRef }
  | { readonly kind: 'trap'; readonly trap: TrapId }
  | { readonly kind: 'magic'; readonly spell: SpellId };

export interface DelveProgress {
  readonly locationId: LocationId;
  /** Chambers explored so far. */
  readonly room: number;
  readonly goldFound: number;
  readonly itemsFound: number;
  /** Value of items found, for learning what the place is worth. */
  readonly valueFound: number;
  /** The lowest fraction of hit points reached, for learning how dangerous it is. */
  readonly lowestHp: number;
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
