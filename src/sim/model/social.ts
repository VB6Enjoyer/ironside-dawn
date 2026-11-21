import type { CharacterId, LocationId, PartyId } from './ids';

/**
 * Bonds between characters (ROADMAP.md Phase 5, ARCHITECTURE.md §4.6, the
 * third memory layer): what each thinks of the others they have met.
 */
export interface Opinion {
  /** -1 (hatred) to 1 (devotion). */
  affinity: number;
  /** 0 to 1: how far they would rely on the other. */
  trust: number;
  /** 0 to 1: how well they know each other. */
  familiarity: number;
  lastSeen: number;
  /** Announced bonds, so each is announced once. */
  bond: 'friend' | 'rival' | null;
  /** Times they have hunted the other without success. */
  hunted?: number;
  /** Since when they have been lovers, if they are (0.3.0). */
  lovers?: number;
}

/** An adventuring party, or a gang when its members are outlaws. */
export interface Party {
  readonly id: PartyId;
  leaderId: CharacterId;
  members: CharacterId[];
  readonly formedAt: number;
}

/** A character who has turned to crime. */
/**
 * What drove someone to crime: want (broke and desperate), or temptation for
 * a reason (0.3.0): a ruthless ambition, a thief's skills, an outlaw friend,
 * a grudge.
 */
export type OutlawReason = 'want' | 'ambition' | 'skill' | 'company' | 'grudge';

export interface Outlaw {
  readonly since: number;
  /** Why they turned; missing for those who turned before 0.3.0 (all from want). */
  readonly reason?: OutlawReason;
  crimes: number;
  murders: number;
  lastCrimeAt: number;
  /** Where they were last seen at work, for bounty hunters. */
  lastSeenAt: LocationId;
}

/** A price on an outlaw's head, posted by a victim's home town. */
export interface Bounty {
  readonly outlawId: CharacterId;
  amount: number;
  readonly townId: LocationId;
  readonly postedAt: number;
}
