import type { PastimeId, SkillId, SpellId, StatId, TrapId } from '../../content';
import type { DeathCause, LootItem } from './character';
import type { CreatureRef } from './encounter';
import type { CharacterId, EntityId, EventId, LocationId } from './ids';
import type { Item } from './item';

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
  | Body<'character.pastime', CharacterAt & { readonly pastime: PastimeId }>
  | Body<'character.rest', CharacterAt & { readonly paid: boolean }>
  | Body<'character.convalesce', CharacterAt>
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
        readonly reason: 'wander' | 'delve' | 'heal' | 'home';
      }
    >
  | Body<'travel.pass', CharacterAt & { readonly destinationId: LocationId }>
  | Body<'travel.arrive', CharacterAt>
  // Delves
  | Body<'delve.enter', CharacterAt>
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
  | Body<'combat.start', CharacterAt & { readonly foes: readonly CreatureRef[] }>
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
        readonly foes: readonly CreatureRef[];
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
        readonly target: CreatureRef | null;
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
  'trade.sell': Importance.Normal,
};
