import type { AffixId, CreatureId } from '../../content';
import type { LootItem } from './character';
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

/** One side's numbers in a fight (ARCHITECTURE.md §4.3: plain data). */
export interface FighterState {
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
  out: null | 'dead' | 'fled';
}

export interface Encounter {
  readonly id: EncounterId;
  readonly characterId: CharacterId;
  readonly locationId: LocationId;
  readonly foes: { readonly ref: CreatureRef; readonly fighter: FighterState }[];
  round: number;
  readonly startedAt: number;
  /** Coins and items dropped by slain foes, claimed if the character wins. */
  spoils: { gold: number; items: LootItem[] };
}
