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
}

/** An adventuring party, or a gang when its members are outlaws. */
export interface Party {
  readonly id: PartyId;
  leaderId: CharacterId;
  members: CharacterId[];
  readonly formedAt: number;
}

/** A character who has turned to crime. */
export interface Outlaw {
  readonly since: number;
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
