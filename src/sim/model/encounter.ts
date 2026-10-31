import type { AffixId, CreatureId } from '../../content';
import type { DelveProgress, LootItem } from './character';
import type { CharacterId, EncounterId, LocationId } from './ids';

/**
 * Names a creature in a fight. Creatures only exist while fighting; afterwards
 * they are counts in a dungeon's population again, so events carry this
 * description rather than an ID.
 */
export interface CreatureRef {
  readonly species: CreatureId;
  readonly affix: AffixId | null;
  /** 1, 2, 3… among foes of the same species in the fight; 0 if it is the only one. */
  readonly ordinal: number;
}

export type Side = 0 | 1;

/** One combatant's numbers in a fight (ARCHITECTURE.md §4.3: plain data). */
export interface FighterState {
  readonly side: Side;
  readonly attack: number;
  readonly damage: string;
  readonly damageBonus: number;
  readonly defense: number;
  readonly agility: number;
  /** Tries to flee below this fraction of hit points. */
  readonly fleeBelow: number;
  hp: number;
  readonly maxHp: number;
  /** Null for creatures, which never tire. */
  stamina: number | null;
  /** Magical protection that absorbs damage until spent. */
  ward: number;
  out: null | 'dead' | 'fled';
}

export interface EncounterSide {
  readonly characters: CharacterId[];
  readonly creatures: { readonly ref: CreatureRef; readonly fighter: FighterState }[];
}

/**
 * A fight between two sides (ROADMAP.md Phase 5): a party against a dungeon's
 * creatures, outlaws against travelers, bounty hunters against an outlaw.
 */
export interface Encounter {
  readonly id: EncounterId;
  readonly kind: 'delve' | 'ambush' | 'hunt';
  readonly locationId: LocationId;
  readonly sides: readonly [EncounterSide, EncounterSide];
  round: number;
  readonly startedAt: number;
  /** Characters who have left the fight. */
  out: Partial<Record<CharacterId, 'dead' | 'fled'>>;
  /** Spells in effect for each character in this fight. */
  quickened: Partial<Record<CharacterId, { readonly attack: number; readonly defense: number }>>;
  wards: Partial<Record<CharacterId, number>>;
  /** For a delve: whose delve to continue after a won fight. */
  readonly delve: { readonly leaderId: CharacterId; readonly progress: DelveProgress } | null;
  /** Coins and items dropped by slain creatures, claimed by the winners. */
  spoils: { gold: number; items: LootItem[] };
}
