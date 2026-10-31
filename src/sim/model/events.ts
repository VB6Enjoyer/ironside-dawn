import type { LanguageId, PastimeId, SkillId, SpellId, StatId, TrapId } from '../../content';
import type { DeathCause, LootItem } from './character';
import type { CreatureRef } from './encounter';
import type { CharacterId, EntityId, EventId, LocationId } from './ids';
import type { Item } from './item';
import type { Motive } from './mind';

/**
 * Structured events: the single source of truth for "what happened"
 * (ARCHITECTURE.md §4.4). The simulation never builds display text; the
 * renderer in `src/text` turns these into prose.
 */

export const Importance = {
  Trivial: 0,
  Normal: 1,
  Notable: 2,
  Legendary: 3,
} as const;
export type Importance = (typeof Importance)[keyof typeof Importance];

/** Either side of a fight. */
export type Combatant =
  | { readonly kind: 'character'; readonly id: CharacterId }
  | { readonly kind: 'creature'; readonly ref: CreatureRef };

interface CharacterAt {
  readonly characterId: CharacterId;
  readonly locationId: LocationId;
}

type Body<T extends string, D> = { readonly type: T; readonly data: D };

interface WithOther {
  readonly otherId: CharacterId;
}

/** Decisions carry their reasons (ROADMAP.md Phase 4). */
interface Decided {
  readonly why: readonly Motive[];
}

export type EventBody =
  // World
  | Body<'world.created', { readonly seed: string }>
  | Body<'calendar.season', { readonly year: number; readonly season: number }>
  // Characters
  | Body<
      'character.introduced',
      {
        readonly characterId: CharacterId;
        readonly homeId: LocationId;
        /** True for adventurers who arrive after the world began. */
        readonly newcomer: boolean;
      }
    >
  | Body<'character.pastime', CharacterAt & Decided & { readonly pastime: PastimeId }>
  | Body<'character.rest', CharacterAt & { readonly paid: boolean }>
  | Body<'character.convalesce', CharacterAt & Decided>
  | Body<'character.levelup', CharacterAt & { readonly level: number }>
  | Body<'character.skill', CharacterAt & { readonly skill: SkillId; readonly rank: string }>
  | Body<'character.death', CharacterAt & { readonly cause: DeathCause; readonly kills: number }>
  // Travel
  | Body<
      'travel.depart',
      {
        readonly characterId: CharacterId;
        readonly fromId: LocationId;
        readonly destinationId: LocationId;
        /** Typical duration of the whole journey, in seconds. */
        readonly expectedDuration: number;
        readonly reason: 'wander' | 'delve' | 'heal' | 'home' | 'hunt';
        readonly why: readonly Motive[];
        /** Party members traveling along. */
        readonly companions: readonly CharacterId[];
      }
    >
  | Body<'travel.pass', CharacterAt & { readonly destinationId: LocationId }>
  | Body<'travel.arrive', CharacterAt>
  // Delves
  | Body<'delve.enter', CharacterAt & Decided & { readonly companions: readonly CharacterId[] }>
  | Body<'delve.quiet', CharacterAt & { readonly room: number }>
  | Body<
      'delve.treasure',
      CharacterAt & {
        readonly room: number;
        readonly gold: number;
        readonly items: readonly LootItem[];
        /** How the chest was opened. */
        readonly lock: 'none' | 'picked' | 'forced';
      }
    >
  | Body<
      'delve.trap',
      CharacterAt & {
        readonly trap: TrapId;
        readonly avoided: boolean;
        readonly damage: number;
        readonly dizzy: boolean;
      }
    >
  | Body<
      'delve.avoid',
      CharacterAt & {
        readonly foes: readonly CreatureRef[];
        /** False when the character tried to slip away but was spotted. */
        readonly success: boolean;
      }
    >
  | Body<
      'delve.exit',
      CharacterAt & {
        readonly rooms: number;
        readonly gold: number;
        readonly items: number;
        readonly fled: boolean;
      }
    >
  // Combat
  | Body<
      'combat.start',
      CharacterAt & {
        /** The side that was attacked or went in: the party, or the travelers. */
        readonly characterIds: readonly CharacterId[];
        readonly foes: readonly Combatant[];
        readonly kind: 'delve' | 'ambush' | 'hunt';
      }
    >
  | Body<
      'combat.attack',
      {
        readonly attacker: Combatant;
        readonly target: Combatant;
        readonly hit: boolean;
        readonly critical: boolean;
        readonly damage: number;
        /** Damage soaked up by a magical ward. */
        readonly absorbed: number;
        readonly targetHp: number;
        readonly targetMaxHp: number;
      }
    >
  | Body<'combat.kill', CharacterAt & { readonly foe: CreatureRef }>
  | Body<'combat.flee', { readonly who: Combatant; readonly success: boolean }>
  | Body<
      'combat.victory',
      CharacterAt & {
        readonly characterIds: readonly CharacterId[];
        readonly foes: readonly Combatant[];
        readonly hp: number;
        readonly maxHp: number;
        readonly gold: number;
        readonly items: readonly LootItem[];
      }
    >
  | Body<'combat.escape', CharacterAt & { readonly hp: number; readonly maxHp: number }>
  // Gear
  | Body<'item.equip', CharacterAt & { readonly item: Item; readonly replaced: Item | null }>
  | Body<
      'item.legend',
      CharacterAt & {
        readonly item: Item;
        /** Whose it was before, if it was lost with a fallen adventurer. */
        readonly previousOwner: CharacterId | null;
      }
    >
  // Magic
  | Body<'magic.learn', CharacterAt & { readonly spell: SpellId }>
  | Body<
      'magic.cast',
      CharacterAt & {
        readonly spell: SpellId;
        readonly outcome: 'success' | 'partial' | 'failure' | 'backlash';
        readonly target: Combatant | null;
        /** Damage dealt, hit points healed, or ward strength. 0 if nothing happened. */
        readonly amount: number;
        readonly paid: {
          readonly stamina: number;
          readonly health: number;
          readonly drained: StatId | null;
          readonly dizzy: boolean;
        };
      }
    >
  // Bonds
  | Body<'social.meet', CharacterAt & WithOther & { readonly understood: boolean }>
  | Body<'social.friend', CharacterAt & WithOther>
  | Body<'social.rival', CharacterAt & WithOther>
  | Body<'social.quarrel', CharacterAt & WithOther>
  | Body<'social.mourn', CharacterAt & { readonly deceasedId: CharacterId }>
  | Body<
      'social.rumor',
      CharacterAt & WithOther & { readonly aboutId: LocationId; readonly warning: boolean }
    >
  | Body<
      'character.language',
      CharacterAt & { readonly language: LanguageId; readonly level: string }
    >
  // Parties (characterId is the leader unless said otherwise)
  | Body<'party.form', CharacterAt & { readonly memberIds: readonly CharacterId[] }>
  /** characterId joins leaderId's party. */
  | Body<'party.join', CharacterAt & { readonly leaderId: CharacterId }>
  /** characterId leaves leaderId's party. */
  | Body<
      'party.leave',
      CharacterAt & { readonly leaderId: CharacterId; readonly reason: 'quarrel' | 'outlaw' }
    >
  | Body<'party.disband', CharacterAt & { readonly reason: 'death' | 'quarrel' | 'outlaw' }>
  | Body<
      'party.share',
      CharacterAt & {
        readonly gold: number;
        readonly shares: readonly { readonly characterId: CharacterId; readonly gold: number }[];
        readonly fair: boolean;
      }
    >
  // Outlaws (characterId is the outlaw)
  | Body<'outlaw.turn', CharacterAt>
  | Body<
      'outlaw.ambush',
      CharacterAt & {
        readonly outlawIds: readonly CharacterId[];
        readonly victimIds: readonly CharacterId[];
        /** Whether the victims could talk their way through, and chose to. */
        readonly parley: 'surrendered' | 'refused' | 'misunderstood';
      }
    >
  | Body<'crime.robbery', CharacterAt & { readonly victimId: CharacterId; readonly gold: number }>
  /** locationId is the town posting it. */
  | Body<'bounty.post', CharacterAt & { readonly amount: number }>
  /** characterId is the hunter. */
  | Body<'bounty.claim', CharacterAt & { readonly outlawId: CharacterId; readonly amount: number }>
  | Body<'outlaw.reform', CharacterAt>
  // Trade
  | Body<
      'trade.sell',
      CharacterAt & { readonly items: readonly LootItem[]; readonly gold: number }
    >;

export type EventType = EventBody['type'];

export type SimEvent = EventBody & {
  readonly id: EventId;
  /** World time, in seconds. */
  readonly t: number;
  readonly importance: Importance;
  /** Who was involved, for filtering, following and (later) memory. */
  readonly actors: readonly EntityId[];
  readonly locationId: LocationId | null;
};

export type EventOfType<T extends EventType> = Extract<SimEvent, { readonly type: T }>;

/** How much each kind of event matters. Decided here, not at each emit site. */
export const EVENT_IMPORTANCE: Record<EventType, Importance> = {
  'world.created': Importance.Notable,
  'calendar.season': Importance.Notable,
  'character.introduced': Importance.Normal,
  'character.pastime': Importance.Trivial,
  'character.rest': Importance.Trivial,
  'character.convalesce': Importance.Trivial,
  'character.levelup': Importance.Normal,
  'character.skill': Importance.Normal,
  'character.death': Importance.Notable,
  'travel.depart': Importance.Normal,
  'travel.pass': Importance.Trivial,
  'travel.arrive': Importance.Normal,
  'delve.enter': Importance.Normal,
  'delve.quiet': Importance.Trivial,
  'delve.treasure': Importance.Normal,
  'delve.trap': Importance.Normal,
  'delve.avoid': Importance.Normal,
  'delve.exit': Importance.Normal,
  'combat.start': Importance.Normal,
  'combat.attack': Importance.Trivial,
  'combat.kill': Importance.Normal,
  'combat.flee': Importance.Trivial,
  'combat.victory': Importance.Normal,
  'combat.escape': Importance.Normal,
  'item.equip': Importance.Normal,
  'item.legend': Importance.Notable,
  'magic.learn': Importance.Normal,
  'magic.cast': Importance.Normal,
  'social.meet': Importance.Trivial,
  'social.friend': Importance.Normal,
  'social.rival': Importance.Normal,
  'social.quarrel': Importance.Normal,
  'social.mourn': Importance.Normal,
  'social.rumor': Importance.Trivial,
  'character.language': Importance.Normal,
  'party.form': Importance.Normal,
  'party.join': Importance.Normal,
  'party.leave': Importance.Normal,
  'party.disband': Importance.Normal,
  'party.share': Importance.Normal,
  'outlaw.turn': Importance.Notable,
  'outlaw.ambush': Importance.Normal,
  'crime.robbery': Importance.Notable,
  'bounty.post': Importance.Normal,
  'bounty.claim': Importance.Notable,
  'outlaw.reform': Importance.Notable,
  'trade.sell': Importance.Normal,
};
