import type { EventType, SimEvent } from '../sim';
import type { Mark } from './describe';

/** Broad kinds of event, for filtering the log. */
export type EventCategory =
  'fights' | 'delves' | 'travel' | 'company' | 'crime' | 'treasure' | 'lives' | 'world';

export const EVENT_CATEGORIES: readonly { readonly id: EventCategory; readonly label: string }[] = [
  { id: 'fights', label: 'Fights' },
  { id: 'delves', label: 'Delves' },
  { id: 'travel', label: 'Travel' },
  { id: 'company', label: 'Friends and parties' },
  { id: 'crime', label: 'Crime and bounties' },
  { id: 'treasure', label: 'Magic and treasure' },
  { id: 'lives', label: 'Lives and deaths' },
  { id: 'world', label: 'The world' },
];

export function eventCategory(type: EventType): EventCategory {
  const [group] = type.split('.');
  switch (group) {
    case 'combat':
      return 'fights';
    case 'delve':
      return 'delves';
    case 'travel':
      return 'travel';
    case 'social':
    case 'party':
      return 'company';
    case 'outlaw':
    case 'crime':
    case 'bounty':
    case 'capture':
      return 'crime';
    case 'magic':
    case 'item':
    case 'trade':
      return 'treasure';
    case 'character':
      return type === 'character.language' ? 'company' : 'lives';
    default:
      return 'world';
  }
}

/**
 * The few kinds of event that stand out in the log, coloured as the same
 * marks are everywhere else; most events have none. The log tints their
 * rows, and filters by them.
 */
export function eventTone(event: SimEvent): Mark | null {
  switch (event.type) {
    case 'character.death':
      // Leaving for distant lands is the end of a story here, not a death.
      return event.data.cause.kind === 'departed' ? null : 'death';
    case 'raid.sack':
    case 'dread.fall':
      return 'death';
    case 'family.birth':
      // A child born with the gift is a matter for magic as much as for family.
      return event.data.gifted ? 'magic' : 'love';
    case 'family.marry':
    case 'social.love':
    case 'family.expecting':
      return 'love';
    case 'crime.robbery':
    case 'crime.commit':
    case 'outlaw.notorious':
    case 'outlaw.barred':
    case 'bounty.head':
    case 'capture.attempt':
    case 'capture.escape':
    case 'outlaw.sentenced':
    case 'outlaw.held':
    case 'crime.conceal':
    case 'crime.pinned':
    case 'outlaw.turn':
    case 'outlaw.ambush':
    case 'outlaw.reform':
    case 'bounty.post':
    case 'bounty.claim':
      return 'crime';
    case 'item.legend':
    case 'family.inherit':
    case 'legend.hero':
      return 'wealth';
    case 'dread.rise':
      return 'delve';
    case 'character.introduced':
      return event.data.gifted ? 'magic' : null;
    case 'magic.learn':
    case 'magic.kill':
    case 'magic.backlash':
      return 'magic';
    default:
      return null;
  }
}

/** The tones as the log offers them, each with the symbol its rows carry. */
export const EVENT_TONES: readonly {
  readonly id: Mark;
  readonly label: string;
  readonly symbol: string;
}[] = [
  { id: 'death', label: 'Deaths', symbol: '✝' },
  { id: 'love', label: 'Love', symbol: '♥' },
  { id: 'crime', label: 'Crime', symbol: '⚖' },
  { id: 'wealth', label: 'Fortune', symbol: '◆' },
  { id: 'delve', label: 'The deeps', symbol: '▼' },
  { id: 'magic', label: 'Magic', symbol: '✶' },
];
