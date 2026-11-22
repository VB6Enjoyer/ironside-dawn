import type {
  Aspect,
  CreatureId,
  CultureId,
  EffectId,
  Goods,
  LanguageId,
  LootId,
  PastimeId,
  SkillId,
  SpeciesId,
  SpellId,
  Stats,
  TrapId,
  Traits,
} from '../../content';
import type { CreatureRef } from './encounter';
import type { CharacterId, EncounterId, ItemId, LocationId, PartyId } from './ids';
import type { Opinion, Outlaw } from './social';
import type { Captivity, Crime, ExecutionMethod, Head, Judgment, Notoriety } from './crime';
import type { Equipment, Item } from './item';
import type { Drives, Expectation, Goal, Memory } from './mind';
import type { PriceNote } from './market';

/**
 * What a character does with their life: adventurers delve, merchants trade,
 * townsfolk (the retired, and those who never took up the sword) live and
 * work in town, and children grow up there.
 */
export type Calling =
  | 'adventurer'
  | 'merchant'
  | 'townsfolk'
  | 'child'
  /** Holds a fortress and the lands around it, with a garrison. */
  | 'lord'
  /** One of the dread: a lich, revenant or demon lord in its lair. */
  | 'dread';

/** Townsfolk's work, mostly taken up on retiring. */
export type Occupation = 'innkeeper' | 'smith' | 'trainer' | 'farmer' | 'clerk';

export interface Character {
  readonly id: CharacterId;
  /** Adventurers seek glory and gold in dungeons; merchants buy low and sell high. */
  calling: Calling;
  readonly givenName: string;
  readonly familyName: string;
  readonly species: SpeciesId;
  readonly culture: CultureId;
  homeId: LocationId;
  /** World time of birth; before the world began for those who were already grown. */
  readonly born: number;
  /** Townsfolk's work. */
  occupation: Occupation | null;
  /** Married to, living or dead. */
  spouseId: CharacterId | null;
  /** Mother and father, for those born in the world. */
  readonly parents: readonly CharacterId[];
  readonly children: CharacterId[];
  /** World time the character entered the world. */
  readonly arrivedAt: number;

  stats: Stats;
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
  /**
   * Lasting effects carried now (0.4.0; see `systems/effects.ts`). Wounded and
   * exhausted are derived from hp and stamina instead.
   */
  effects: Effect[];

  gold: number;
  /** Loot carried, waiting to be sold. */
  pack: LootItem[];
  kills: Partial<Record<CreatureId, number>>;
  /** People they have killed. */
  slain: number;
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

  /** What they think of those they have met. Capped. */
  opinions: Partial<Record<CharacterId, Opinion>>;
  /** Proficiency in each language, 0 to 100. The native tongue is 100. */
  languages: Partial<Record<LanguageId, number>>;
  partyId: PartyId | null;
  outlaw: Outlaw | null;
  /**
   * Since when an adventurer has been broke with nothing left to sell, while
   * they are (0.3.0): want turns no one overnight. Missing from older saves.
   */
  hardshipSince?: number;
  /** When they last went straight, if ever (0.3.0). Missing from older saves. */
  pardonedAt?: number;
  /** How each town sees them for their good deeds, 0 to 1 (celebrated). */
  reputation: Partial<Record<LocationId, number>>;
  /** Their crimes, newest last; the oldest are dropped past a cap (0.3.0). */
  crimes: Crime[];
  /** What each town has heard of their crimes, by town (0.3.0). */
  notoriety: Partial<Record<LocationId, Notoriety>>;
  /** Towns the stolen goods they carry (in `cargo`) came from, where no fence will touch them. */
  stolenFrom: LocationId[];
  /** Outlaws' heads carried to claim the bounties on them (0.3.0). */
  heads: Head[];
  /** Their dealings with justice, oldest first, for their life story (0.3.0). */
  justice: Judgment[];
  /** Taken alive and under escort (0.3.0). */
  captive?: Captivity;
  /** The captive they are escorting to justice (0.3.0). */
  escorting?: CharacterId;
  /** Expecting a child with `withId`, due at `dueAt`; kept on both parents (0.3.0). */
  expecting?: { readonly withId: CharacterId; readonly since: number; readonly dueAt: number };

  /** Healing draughts carried, drunk when a fight goes badly. */
  potions: number;
  /** Alchemists' tonics of vigor and calming draughts carried, drunk going into a delve (0.4.0). */
  draughts: { vigor: number; calm: number };
  /** Merchants: goods carried to sell, in units. */
  cargo: Goods;
  /** Merchants: what the cargo cost, to reckon the profit. */
  cargoPaid: number;
  /** Merchants: what each town's prices were when last seen. */
  priceBook: Partial<Record<LocationId, PriceNote>>;

  /** Where the character is, or null while on the road. */
  locationId: LocationId | null;
  activity: Activity;
  /** Identifies the one scheduled wake-up still in force (see systems/wake.ts). */
  wakeToken: number;
  death: Death | null;
  /** How they stood at the start of each season they lived through. */
  history: LifeSample[];
}

/** [time, level, gold, kills], compact because there are many. */
export type LifeSample = readonly [t: number, level: number, gold: number, kills: number];

/**
 * Something a character carries for a while (0.4.0): a lasting effect, good or
 * bad, acting on some of their aspects (see `content/effects.ts`).
 */
export interface Effect {
  readonly kind: EffectId;
  /** What it does to each aspect at full strength. */
  readonly mods: Partial<Record<Aspect, number>>;
  readonly since: number;
  /**
   * From here its strength falls off evenly to nothing at `until`. The same as
   * `until` for one that holds at full strength to the end.
   */
  readonly fadeFrom: number;
  readonly until: number;
}

/** Something carried to sell: a trophy or a piece of gear not worth wearing. */
export type LootItem =
  | { readonly loot: LootId; readonly value: number }
  | { readonly gear: Item; readonly value: number };

export type Deed =
  | { readonly kind: 'level'; readonly at: number; readonly level: number }
  | { readonly kind: 'legend'; readonly at: number; readonly itemId: ItemId; readonly name: string }
  | { readonly kind: 'slay'; readonly at: number; readonly creature: CreatureRef }
  | { readonly kind: 'spell'; readonly at: number; readonly spell: SpellId }
  | { readonly kind: 'rank'; readonly at: number; readonly skill: SkillId; readonly rank: string }
  /** Helped destroy one of the dread. */
  | {
      readonly kind: 'vanquish';
      readonly at: number;
      readonly characterId: CharacterId;
      readonly name: string;
    };

export interface Death {
  readonly at: number;
  readonly locationId: LocationId;
  readonly cause: DeathCause;
  /** Their killer hid the body: as far as anyone knows, they vanished (0.3.0). */
  readonly hidden?: boolean;
  /** When word got out of who killed them, for a murder nobody saw (0.3.0). */
  readonly pinnedAt?: number;
}

export type DeathCause =
  | { readonly kind: 'creature'; readonly creature: CreatureRef }
  | {
      readonly kind: 'character';
      readonly characterId: CharacterId;
      /** The killer's weapon, by base (0.3.0). */
      readonly weapon?: string;
      /** The spell that killed them, if it was one (0.3.2). */
      readonly spell?: SpellId;
      /** Killed by an outlaw: murder (0.3.0). */
      readonly murder?: boolean;
    }
  | { readonly kind: 'trap'; readonly trap: TrapId }
  | { readonly kind: 'magic'; readonly spell: SpellId }
  | { readonly kind: 'age'; readonly age: number }
  /** Put to death for murder, by the town's way of it (0.3.0). */
  | { readonly kind: 'executed'; readonly method?: ExecutionMethod }
  /** Died behind bars (0.3.0). */
  | { readonly kind: 'prison' }
  /**
   * Not a death: they left for distant lands, and the world stopped following
   * them; `fled` for an outlaw running from the law (0.3.0).
   */
  | { readonly kind: 'departed'; readonly fled?: boolean };

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
  /** Townsfolk and children: living their lives in town, not deciding moment to moment. */
  | { readonly kind: 'living' }
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
      /** The best room at the inn, or a night at home (0.4.0): wakes them refreshed. */
      readonly comfort?: 'inn' | 'home';
    }
  /** Resting in town by day to heal wounds. */
  | { readonly kind: 'convalescing'; readonly since: number; readonly until: number }
  | {
      readonly kind: 'traveling';
      readonly destinationId: LocationId;
      readonly leg: TravelLeg;
      /** When the journey began, for how long the road has been (0.4.0). */
      readonly setOutAt?: number;
      /** Stops still to come after the current leg, ending at the destination. */
      readonly remaining: readonly LocationId[];
    }
  | ({ readonly kind: 'delving' } & DelveProgress)
  | { readonly kind: 'fighting'; readonly encounterId: EncounterId }
  /**
   * Traveling or delving with a party, led by `leaderId`, who decides for all;
   * or, for a captive, led under escort.
   */
  | { readonly kind: 'accompanying'; readonly leaderId: CharacterId }
  /**
   * Held in a town's jail until `until` (0.3.0): awaiting trial, then tried;
   * serving a prison sentence, then released; or condemned, then executed.
   */
  | {
      readonly kind: 'jailed';
      readonly since: number;
      readonly until: number;
      readonly sentence: 'trial' | 'prison' | 'death';
    }
  | { readonly kind: 'dead' };

export interface TravelLeg {
  readonly from: LocationId;
  readonly to: LocationId;
  readonly departedAt: number;
  readonly arrivesAt: number;
}
