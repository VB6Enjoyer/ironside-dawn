import { describe, expect, it } from 'vitest';

import type { Character, LocationId } from '../model';
import { testCharacter, testContext } from '../test-support';
import { ambush, considerCrime, onCharacterKilled } from './outlaws';
import { learnLanguage } from './social';

const woods = 'witherwood' as LocationId;

function outlawAndTraveler(seed: string) {
  const ctx = testContext(seed);
  const outlaw = testCharacter(ctx);
  const traveler = testCharacter(ctx);
  outlaw.outlaw = { since: 0, crimes: 0, murders: 0, lastCrimeAt: 0, lastSeenAt: woods };
  outlaw.level = 6;
  outlaw.traits = { ...outlaw.traits, compassion: 0.1, bravery: 0.8 };
  outlaw.locationId = woods;
  outlaw.activity = { kind: 'pastime', pastime: 'lurk', since: 0, until: 1e9 };
  traveler.locationId = woods;
  traveler.gold = 100;
  return { ctx, outlaw, traveler, place: ctx.world.locations.get(woods)! };
}

const speak = (c: Character, tongue: 'common' | 'sylvan') => (c.languages = { [tongue]: 100 });

describe('turning outlaw', () => {
  const turned = (traits: Partial<Character['traits']>, gold: number) => {
    const ctx = testContext(`turn-${JSON.stringify(traits)}-${gold}`);
    let count = 0;
    for (let i = 0; i < 200; i++) {
      const c = testCharacter(ctx);
      c.traits = { ...c.traits, ...traits };
      c.gold = gold;
      for (let day = 0; day < 60 && !c.outlaw; day++) considerCrime(ctx, c);
      if (c.outlaw) count++;
    }
    return count;
  };

  it('comes to the broke, greedy and dishonorable, not the honorable or the comfortable', () => {
    const crooked = { honor: 0.05, greed: 0.95, compassion: 0.05 };
    expect(turned(crooked, 0)).toBeGreaterThan(20);
    expect(turned({ honor: 0.95, greed: 0.1, compassion: 0.9 }, 0)).toBeLessThan(3);
    expect(turned(crooked, 500)).toBe(0);
  });
});

describe('ambushes', () => {
  it('end in a fight when the two sides cannot understand each other', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('misunderstood');
    speak(outlaw, 'common');
    speak(traveler, 'sylvan');
    expect(ambush(ctx, traveler, place)).toBe(true);
    const event = ctx.events.find((e) => e.type === 'outlaw.ambush');
    expect(event?.type === 'outlaw.ambush' && event.data.parley).toBe('misunderstood');
    expect(ctx.world.encounters.size).toBe(1);
  });

  it('let a timid traveler who understands pay up, and post a bounty', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('robbed');
    speak(outlaw, 'common');
    speak(traveler, 'common');
    traveler.traits = { ...traveler.traits, bravery: 0.1 };
    let robbed = false;
    for (let i = 0; i < 10 && !robbed; i++) {
      outlaw.activity = { kind: 'pastime', pastime: 'lurk', since: 0, until: 1e9 };
      ambush(ctx, traveler, place);
      robbed = ctx.events.some((e) => e.type === 'crime.robbery');
    }
    expect(robbed).toBe(true);
    expect(traveler.gold).toBeLessThan(100);
    expect(ctx.world.bounties.get(outlaw.id)?.amount).toBeGreaterThan(0);
    expect(outlaw.reputation[traveler.homeId]).toBeLessThan(0);
  });

  it('leave a much stronger party alone', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('strong');
    outlaw.level = 1;
    traveler.level = 20;
    expect(ambush(ctx, traveler, place)).toBe(false);
    expect(ctx.events.some((e) => e.type === 'outlaw.ambush')).toBe(false);
  });

  it('never involve outlaws who are not lying in wait', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('asleep');
    outlaw.activity = { kind: 'idle' };
    expect(ambush(ctx, traveler, place)).toBe(false);
  });
});

describe('bounties', () => {
  it('are paid to whoever kills the outlaw', () => {
    const { ctx, outlaw, traveler } = outlawAndTraveler('claim');
    ctx.world.bounties.set(outlaw.id, {
      outlawId: outlaw.id,
      amount: 80,
      townId: traveler.homeId,
      postedAt: 0,
    });
    const before = traveler.gold;
    outlaw.death = {
      at: 0,
      locationId: woods,
      cause: { kind: 'character', characterId: traveler.id },
    };
    onCharacterKilled(ctx, outlaw, traveler);
    expect(traveler.gold).toBe(before + 80);
    expect(ctx.world.bounties.has(outlaw.id)).toBe(false);
  });

  it('grow with each murder', () => {
    const { ctx, outlaw, traveler } = outlawAndTraveler('murder');
    traveler.death = {
      at: 0,
      locationId: woods,
      cause: { kind: 'character', characterId: outlaw.id },
    };
    onCharacterKilled(ctx, traveler, outlaw);
    expect(outlaw.outlaw?.murders).toBe(1);
    expect(ctx.world.bounties.get(outlaw.id)?.amount).toBe(60);
  });
});

describe('language helps', () => {
  it('a traveler who learned the outlaw’s tongue can talk instead of fight', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('learned');
    speak(outlaw, 'common');
    speak(traveler, 'sylvan');
    for (let i = 0; i < 40; i++) learnLanguage(ctx, traveler, 'common', 5, traveler.homeId);
    traveler.traits = { ...traveler.traits, bravery: 0.05 };
    ambush(ctx, traveler, place);
    const event = ctx.events.find((e) => e.type === 'outlaw.ambush');
    expect(event?.type === 'outlaw.ambush' && event.data.parley).not.toBe('misunderstood');
  });
});
