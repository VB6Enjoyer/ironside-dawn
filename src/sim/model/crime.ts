import type { CharacterId, LocationId } from './ids';

/**
 * Crimes and what the towns know of them (0.3.0, ROADMAP.md "The Outlaws
 * Update", steps 3 and 4). A crime is known first where it happened; word of
 * it travels the roads from there, so each town knows a different part of a
 * criminal's record at different times.
 */

export type CrimeKind =
  /** A named traveler robbed on the road. */
  | 'robbery'
  /** A named person killed by an outlaw. */
  | 'murder'
  /** A caravan or band of travelers (unnamed) held up on the road. */
  | 'waylay'
  /** A house broken into by night. */
  | 'burglary'
  /** Goods slipped from a shop or stall. */
  | 'theft'
  /** A shop or counting house robbed at the point of a blade. */
  | 'holdup'
  /** Farms and outlying folk made to pay. */
  | 'extortion'
  /** Stores and stock spoiled or burned, for spite. */
  | 'vandalism';

/** One crime, as recorded for restitution and sentencing. */
export interface Crime {
  readonly kind: CrimeKind;
  readonly at: number;
  readonly locationId: LocationId;
  /** The town it was against, or the nearest, where word of it starts; null if none is near. */
  readonly townId: LocationId | null;
  /** A named victim, if any. */
  readonly victimId?: CharacterId;
  /** Gold, and goods at their worth, taken or destroyed. */
  readonly value: number;
  /** Whether anyone knows who did it. Only known crimes are talked about. */
  readonly known: boolean;
  /** It failed: nothing was taken. */
  readonly foiled?: boolean;
}

/** What one town knows of someone's crimes. */
export interface Notoriety {
  /** How much the town holds against them now. It fades with time. */
  heat: number;
  /** Known crimes, murders among them, over their life. */
  crimes: number;
  murders: number;
  /** Gold worth of what they are known to have taken or ruined. */
  value: number;
  /** When word last came. */
  heardAt: number;
}

/**
 * How a town treats someone, from what it knows: welcome; suspected (worse
 * prices, kept at arm's length); unwelcome (no inn, no trade, posters up);
 * barred (guards turn them away, always so for a known murderer).
 */
export type Standing = 'welcome' | 'suspected' | 'unwelcome' | 'barred';

/** Word of a crime on its way along the roads. */
export interface News {
  readonly characterId: CharacterId;
  readonly crime: Crime;
  /** Towns yet to hear it and when they will, the latest first: the next to hear is last. */
  readonly pending: [LocationId, number][];
}

/** An outlaw's head, carried to a town that knows the bounty on it (0.3.0). */
export interface Head {
  readonly outlawId: CharacterId;
  readonly takenAt: number;
}

/**
 * An outlaw taken alive (0.3.0), escorted by `captorId` to a town that knows
 * the bounty. What was taken off them is held by the captors.
 */
export interface Captivity {
  readonly captorId: CharacterId;
  readonly since: number;
  readonly gold: number;
}

/**
 * A crime nobody has pinned on anyone yet, until word gets out at `pinAt`
 * (0.3.0): a murder with no one to see it, or none who knew the killer.
 */
export interface Unsolved {
  readonly characterId: CharacterId;
  readonly crime: Crime;
  readonly pinAt: number;
}
