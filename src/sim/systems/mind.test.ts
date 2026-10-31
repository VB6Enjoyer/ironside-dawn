import { describe, expect, it } from 'vitest';

import { createRng } from '../core/rng';
import { DAY } from '../core/time';
import type { LocationId } from '../model';
import { testCharacter, testContext } from '../test-support';
import {
  fearOf,
  learnFromDelve,
  nudgeTrait,
  remember,
  rollTraits,
  satisfy,
  updateDrives,
  vividMemories,
  vividness,
  wealthNeed,
} from './mind';

const place = 'gorefang-caves' as LocationId;

describe('traits', () => {
  it('lean the way each people leans, within bounds', () => {
    const rng = createRng('traits');
    const mean = (species: 'human' | 'elf' | 'dwarf', trait: 'patience' | 'honor') => {
      let total = 0;
      for (let i = 0; i < 2000; i++) {
        const value = rollTraits(rng, species)[trait];
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(1);
        total += value;
      }
      return total / 2000;
    };
    expect(mean('elf', 'patience')).toBeGreaterThan(mean('human', 'patience') + 0.1);
    expect(mean('dwarf', 'honor')).toBeGreaterThan(mean('human', 'honor') + 0.08);
  });

  it('drift with experience but never leave their range', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    for (let i = 0; i < 100; i++) nudgeTrait(c, 'bravery', -0.05);
    expect(c.traits.bravery).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) nudgeTrait(c, 'bravery', 0.05);
    expect(c.traits.bravery).toBeLessThan(1);
  });
});

describe('drives', () => {
  it('build over time, faster for the matching temperament', () => {
    const ctx = testContext();
    const [restless, patient] = [testCharacter(ctx), testCharacter(ctx)];
    for (const c of [restless, patient]) c.drives = { glory: 0, companionship: 0, purpose: 0 };
    restless.traits = { ...restless.traits, patience: 0.1, sociability: 0.9 };
    patient.traits = { ...patient.traits, patience: 0.9, sociability: 0.1 };
    updateDrives(restless, restless.drivesAt + 3 * DAY);
    updateDrives(patient, patient.drivesAt + 3 * DAY);
    expect(restless.drives.purpose).toBeGreaterThan(patient.drives.purpose * 2);
    expect(restless.drives.companionship).toBeGreaterThan(patient.drives.companionship * 3);
  });

  it('stay between 0 and 1', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    updateDrives(c, c.drivesAt + 365 * DAY);
    expect(Object.values(c.drives).every((v) => v <= 1)).toBe(true);
    satisfy(c, 'glory', 5);
    expect(c.drives.glory).toBe(0);
  });

  it('make the greedy and the poor want money', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.gold = 10;
    c.traits = { ...c.traits, greed: 0.9 };
    const greedyPoor = wealthNeed(c);
    c.gold = 5000;
    expect(wealthNeed(c)).toBe(0);
    c.gold = 10;
    c.traits = { ...c.traits, greed: 0.1 };
    expect(wealthNeed(c)).toBeLessThan(greedyPoor);
  });
});

describe('memory', () => {
  it('fades over time, slowest for the most harrowing moments', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const now = ctx.world.time;
    remember(c, now, { kind: 'near-death', locationId: place, creature: null }, 0.9);
    remember(c, now, { kind: 'level', level: 2 }, 0.9);
    const later = now + 120 * DAY;
    const [nearDeath, level] = c.memories;
    expect(vividness(nearDeath!, later)).toBeCloseTo(0.45, 2);
    expect(vividness(level!, later)).toBeLessThan(vividness(nearDeath!, later));
  });

  it('keeps the most vivid memories when full', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const now = ctx.world.time;
    remember(c, now, { kind: 'treasure', locationId: place, itemName: 'Duskblade' }, 1);
    for (let i = 0; i < 40; i++) remember(c, now + i * DAY, { kind: 'level', level: i + 2 }, 0.3);
    expect(c.memories).toHaveLength(20);
    expect(vividMemories(c, now + 40 * DAY, 1)[0]?.kind).toBe('treasure');
  });
});

describe('learned expectations', () => {
  const trip = (gold: number, lowestHp: number) => ({
    locationId: place,
    room: 4,
    goldFound: gold,
    itemsFound: 0,
    valueFound: 0,
    lowestHp,
  });

  it('remember the first trip, then lean toward recent ones', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    learnFromDelve(c, trip(100, 0.9), false, 0);
    expect(c.expectations[place]).toMatchObject({ trips: 1, reward: 100 });
    learnFromDelve(c, trip(0, 0.9), false, 1);
    expect(c.expectations[place]!.reward).toBeCloseTo(65);
    expect(c.expectations[place]!.trips).toBe(2);
  });

  it('make a place frightening after nearly dying there, and the fear fades', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    const now = ctx.world.time;
    learnFromDelve(c, trip(10, 0.1), false, now);
    remember(c, now, { kind: 'near-death', locationId: place, creature: null }, 0.9);
    const fresh = fearOf(c, place, now);
    expect(fresh).toBeGreaterThan(1);
    expect(fearOf(c, place, now + 365 * DAY)).toBeLessThan(fresh);
    expect(fearOf(c, 'dungeon-of-misery' as LocationId, now)).toBe(0);
  });
});
