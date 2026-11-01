import type { EventType } from '../sim';

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
