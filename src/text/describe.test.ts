import { describe, expect, it } from 'vitest';

import { PASTIMES } from '../content';
import {
  createSimulation,
  DAY,
  EVENT_IMPORTANCE,
  HOUR,
  MINUTE,
  type CharacterId,
  type CreatureRef,
  type LocationId,
  type SimEvent,
} from '../sim';
import { describeDuration, formatDate, formatTimestamp } from './calendar';
import { describeEvent, toPlainText } from './describe';
import { worldNames } from './names';
import {
  aCreature,
  article,
  condition,
  creatureGroup,
  lootList,
  spoils,
  theCreature,
} from './words';

const events: SimEvent[] = [];
const sim = createSimulation({ seed: 'prose', onEvent: (e) => events.push(e) });
sim.advance(sim.world.time + 365 * DAY);
const names = worldNames(sim.world);
const text = (e: SimEvent) => toPlainText(describeEvent(e, names));

describe('describeEvent', () => {
  it('sees every event type in a year of simulation', () => {
    const seen = new Set(events.map((e) => e.type));
    expect([...seen].sort()).toEqual(Object.keys(EVENT_IMPORTANCE).sort());
  });

  it('writes a clean sentence for every event', () => {
    for (const event of events) {
      const sentence = text(event);
      expect(sentence, JSON.stringify(event)).toMatch(/^[A-Z].*[.]$/);
      expect(sentence, JSON.stringify(event)).not.toMatch(
        /undefined|NaN|null|\[object|Someone|somewhere| {2}|\ba [aeiou]|\ban (?!hour)[^aeiou ]/i,
      );
    }
  });

  it('has phrasings for every pastime', () => {
    const someone = [...sim.world.characters.keys()][0]!;
    for (const [i, pastime] of PASTIMES.entries()) {
      const event = {
        id: i,
        t: 0,
        type: 'character.pastime',
        data: {
          characterId: someone,
          locationId: 'concordale' as LocationId,
          pastime: pastime.id,
          why: [],
        },
        importance: 0,
        actors: [someone],
        locationId: null,
      } as SimEvent;
      expect(text(event)).toMatch(/^[A-Z].*Concordale/);
    }
  });

  it('always phrases the same event the same way', () => {
    for (const event of events.slice(0, 500)) expect(text(event)).toBe(text(event));
  });

  it('marks names of characters and places as references', () => {
    const departure = events.find((e) => e.type === 'travel.depart' && e.data.reason === 'wander')!;
    const refs = describeEvent(departure, names).flatMap((s) => ('ref' in s ? [s.ref.kind] : []));
    expect(refs).toEqual(['character', 'location', 'location']);
  });

  it('uses the article for places that have one', () => {
    const pass = events.find(
      (e) => e.type === 'travel.pass' && e.data.locationId === 'witherwood',
    )!;
    expect(text(pass)).toContain('the Witherwood');
  });

  it('opens sentences that start with a creature with a capital letter', () => {
    const creatureFirst = events.filter(
      (e) => e.type === 'combat.attack' && e.data.attacker.kind === 'creature',
    );
    expect(creatureFirst.length).toBeGreaterThan(0);
    for (const e of creatureFirst.slice(0, 50)) expect(text(e)).toMatch(/^[A-Z]/);
  });

  it('shows a character’s remaining hit points when they are hurt', () => {
    const hurt = events.find(
      (e) =>
        e.type === 'combat.attack' &&
        e.data.hit &&
        e.data.target.kind === 'character' &&
        e.data.targetHp > 0,
    )!;
    expect(text(hurt)).toMatch(/\(\d+\/\d+\)\.$/);
  });

  it('names the killer and the count of foes felled in an obituary', () => {
    const death = events.find(
      (e) => e.type === 'character.death' && e.data.cause.kind === 'creature' && e.data.kills > 1,
    )!;
    expect(text(death)).toMatch(/(slain by|falls to) an? .+, having felled \w+ foes\.$/);
  });
});

describe('words', () => {
  const ref = (species: CreatureRef['species'], ordinal = 0, affix: CreatureRef['affix'] = null) =>
    ({ species, ordinal, affix }) as CreatureRef;

  it('names creatures with articles, affixes and ordinals', () => {
    expect(aCreature(ref('infernal-imp'))).toBe('an infernal imp');
    expect(aCreature(ref('warg', 0, 'enraged'))).toBe('an enraged warg');
    expect(theCreature(ref('skeleton', 2))).toBe('the second skeleton');
    expect(theCreature(ref('skeleton', 0, 'ancient'))).toBe('the ancient skeleton');
  });

  it('groups creatures', () => {
    expect(creatureGroup([ref('skeleton', 1), ref('skeleton', 2)])).toBe('two skeletons');
    expect(creatureGroup([ref('wolf', 1), ref('wolf', 0, 'swift')])).toBe(
      'a wolf and a swift wolf',
    );
    expect(creatureGroup([ref('wolf', 1), ref('wolf', 2), ref('giant-rat')])).toBe(
      'two wolves and a giant rat',
    );
  });

  it('lists loot and spoils', () => {
    const items = [
      { loot: 'bone-charm' as const, value: 6 },
      { loot: 'bone-charm' as const, value: 5 },
      { loot: 'imp-horn' as const, value: 20 },
    ];
    expect(lootList(items)).toBe('two bone charms and an imp horn');
    expect(spoils(14, items.slice(2))).toBe('14 gold and an imp horn');
    expect(spoils(0, items.slice(2))).toBe('an imp horn');
    expect(spoils(3, [])).toBe('3 gold');
  });

  it('picks articles and describes condition', () => {
    expect(article('elf')).toBe('an');
    expect(article('dwarf')).toBe('a');
    expect(condition(28, 28)).toBe('barely scratched');
    expect(condition(5, 28)).toBe('badly wounded');
  });

  it('refers to characters by name in every fight line', () => {
    const someone = [...sim.world.characters.values()][0]!;
    const event = {
      id: 1,
      t: 0,
      type: 'combat.attack',
      data: {
        attacker: { kind: 'character', id: someone.id as CharacterId },
        target: { kind: 'creature', ref: ref('skeleton') },
        hit: true,
        critical: false,
        damage: 5,
        absorbed: 0,
        targetHp: 3,
        targetMaxHp: 8,
      },
      importance: 0,
      actors: [someone.id],
      locationId: null,
    } as SimEvent;
    expect(text(event)).toMatch(
      new RegExp(`^${someone.givenName} .+ the skeleton for 5 damage\\.$`),
    );
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
