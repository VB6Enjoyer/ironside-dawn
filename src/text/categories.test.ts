import { describe, expect, it } from 'vitest';

import type { SimEvent } from '../sim';
import { EVENT_TONES, eventTone } from './categories';

/** Just enough of an event to tell its tone. */
const ev = (type: string, data: object = {}) => ({ type, data }) as unknown as SimEvent;

describe('event tones', () => {
  it('pick out the few kinds of event that stand out', () => {
    expect(eventTone(ev('character.death', { cause: { kind: 'creature' } }))).toBe('death');
    expect(eventTone(ev('family.marry'))).toBe('love');
    expect(eventTone(ev('crime.robbery'))).toBe('crime');
    expect(eventTone(ev('item.legend'))).toBe('wealth');
  });

  it('do not mourn those who only moved away', () => {
    expect(eventTone(ev('character.death', { cause: { kind: 'departed' } }))).toBeNull();
  });

  it('leave everyday events alone', () => {
    for (const type of ['travel.depart', 'delve.enter', 'combat.attack', 'trade.sell'] as const) {
      expect(eventTone(ev(type))).toBeNull();
    }
  });

  it('each have a label and symbol for the log', () => {
    expect(new Set(EVENT_TONES.map((t) => t.symbol)).size).toBe(EVENT_TONES.length);
  });
});
