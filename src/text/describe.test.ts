import { describe, expect, it } from 'vitest';

import { PASTIMES } from '../content';
import { createSimulation, DAY, HOUR, MINUTE, type SimEvent } from '../sim';
import { describeDuration, formatDate, formatTimestamp } from './calendar';
import { describeEvent, toPlainText } from './describe';
import { worldNames } from './names';

const events: SimEvent[] = [];
const sim = createSimulation({ seed: 'prose', onEvent: (e) => events.push(e) });
sim.advance(sim.world.time + 100 * DAY);
const names = worldNames(sim.world);
const text = (e: SimEvent) => toPlainText(describeEvent(e, names));

describe('describeEvent', () => {
  it('covers every event type that a season of simulation produces', () => {
    const types = new Set(events.map((e) => e.type));
    expect([...types].sort()).toEqual([
      'calendar.season',
      'character.introduced',
      'character.pastime',
      'character.rest',
      'travel.arrive',
      'travel.depart',
      'travel.pass',
      'world.created',
    ]);
  });

  it('writes a clean sentence for every event', () => {
    for (const event of events) {
      const sentence = text(event);
      expect(sentence, JSON.stringify(event)).toMatch(/^[A-Z].*[.]$/);
      expect(sentence).not.toMatch(/undefined|NaN|null|\[object|Someone|somewhere| {2}/);
    }
  });

  it('has phrasings for every pastime', () => {
    const seen = new Set(
      events.flatMap((e) => (e.type === 'character.pastime' ? [e.data.pastime] : [])),
    );
    expect([...seen].sort()).toEqual(PASTIMES.map((p) => p.id).sort());
  });

  it('always phrases the same event the same way', () => {
    for (const event of events.slice(0, 200)) expect(text(event)).toBe(text(event));
  });

  it('marks names of characters and places as references', () => {
    const departure = events.find((e) => e.type === 'travel.depart')!;
    const refs = describeEvent(departure, names).flatMap((s) => ('ref' in s ? [s.ref.kind] : []));
    expect(refs).toEqual(['character', 'location', 'location']);
  });

  it('uses the article for places that have one', () => {
    const pass = events.find(
      (e) => e.type === 'travel.pass' && e.data.locationId === 'witherwood',
    )!;
    expect(text(pass)).toContain('the Witherwood');
  });
});

describe('calendar text', () => {
  it('formats timestamps and dates', () => {
    const t = 11 * DAY + 9 * HOUR + 5 * MINUTE + 7;
    expect(formatTimestamp(t)).toBe('Y1 · Day 12 · 09:05:07');
    expect(formatDate(t)).toBe('Year 1 · Thaw 12 · 09:05:07');
    expect(formatDate(100 * DAY)).toBe('Year 1 · Highsun 11 · 00:00:00');
  });

  it('describes durations roughly', () => {
    expect(describeDuration(HOUR)).toBe('about an hour');
    expect(describeDuration(9 * HOUR)).toBe('about 9 hours');
    expect(describeDuration(26 * HOUR)).toBe('about 26 hours');
    expect(describeDuration(36 * HOUR)).toBe('about 2 days');
  });
});
