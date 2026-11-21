import { describe, expect, it } from 'vitest';

import type { Character, LocationId } from '../model';
import { testCharacter, testContext } from '../test-support';
import { DAY } from '../core/time';
import { ambush, considerCrime, onCharacterKilled, temptationReasons } from './outlaws';
import { learnLanguage } from './social';
import { nearestTown, standingIn } from './notoriety';

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
  /** How many of 200 such characters turn outlaw within so many days. */
  const turned = (
    traits: Partial<Character['traits']>,
    gold: number,
    days: number,
    shape: (c: Character, now: number) => void = () => {},
  ) => {
    const ctx = testContext(`turn-${JSON.stringify(traits)}-${gold}-${days}`);
    let count = 0;
    for (let i = 0; i < 200; i++) {
      const c = testCharacter(ctx);
      c.traits = { ...c.traits, ...traits };
      c.gold = gold;
      shape(c, ctx.world.time);
      for (let day = 0; day < days && !c.outlaw; day++) {
        considerCrime(ctx, c);
        ctx.world.time += DAY;
      }
      if (c.outlaw) count++;
    }
    return count;
  };
  const crooked = { honor: 0.05, greed: 0.95, compassion: 0.05 };
  const decent = { honor: 0.95, greed: 0.1, compassion: 0.9 };
  /** No ambition (greed too low), no thief's skills, no outlaw friends, no grudges. */
  const unprovoked = { honor: 0.05, greed: 0.5, compassion: 0.05 };

  it('comes from want to the broke and dishonorable, not the honorable', () => {
    expect(turned(crooked, 0, 120)).toBeGreaterThan(20);
    expect(turned(decent, 0, 120)).toBeLessThan(3);
  });

  it('takes nobody in their first days broke, as a new arrival who bought their gear', () => {
    expect(turned(unprovoked, 0, 9)).toBe(0);
  });

  it('comes to the comfortable only for a reason', () => {
    expect(turned(unprovoked, 500, 360)).toBe(0);
    expect(turned(decent, 500, 360)).toBe(0);
  });

  it('comes rarely to a thief at heart, and says why', () => {
    const thief = (c: Character) => {
      c.skills = {
        ...c.skills,
        stealth: 80,
        blades: 10,
        axes: 10,
        blunt: 10,
        polearms: 10,
        bows: 10,
      };
    };
    const n = turned(unprovoked, 500, 360, thief);
    // Some, over a year, but far from all: one reason, rarely acted on.
    expect(n).toBeGreaterThan(3);
    expect(n).toBeLessThan(100);
    const ctx = testContext('reason');
    const c = testCharacter(ctx);
    c.traits = { ...c.traits, ...unprovoked };
    c.gold = 500;
    thief(c);
    for (let day = 0; day < 5000 && !c.outlaw; day++) {
      considerCrime(ctx, c);
      ctx.world.time += DAY;
    }
    expect(c.outlaw?.reason).toBe('skill');
    expect(temptationReasons(ctx, c, ctx.world.time)).toContain('skill');
  });

  it('finds no hold on someone lately pardoned', () => {
    const n = turned(unprovoked, 500, 360, (c, now) => {
      c.skills = {
        ...c.skills,
        stealth: 80,
        blades: 10,
        axes: 10,
        blunt: 10,
        polearms: 10,
        bows: 10,
      };
      c.pardonedAt = now;
    });
    expect(n).toBe(0);
  });
});

describe('ambushes', () => {
  it('see the cruel strike without a word, now and then', () => {
    let attacked = false;
    for (let i = 0; i < 20 && !attacked; i++) {
      const { ctx, outlaw, traveler, place } = outlawAndTraveler(`cruel-${i}`);
      speak(outlaw, 'common');
      speak(traveler, 'common');
      outlaw.traits = { ...outlaw.traits, compassion: 0 };
      ambush(ctx, traveler, place);
      const event = ctx.events.find((e) => e.type === 'outlaw.ambush');
      attacked = event?.type === 'outlaw.ambush' && event.data.parley === 'attacked';
    }
    expect(attacked).toBe(true);
  });

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
    // They know the robber's face, so can name them.
    traveler.opinions[outlaw.id] = {
      affinity: 0,
      trust: 0,
      familiarity: 1,
      lastSeen: 0,
      bond: null,
    };
    let robbed = false;
    for (let i = 0; i < 10 && !robbed; i++) {
      outlaw.activity = { kind: 'pastime', pastime: 'lurk', since: 0, until: 1e9 };
      ambush(ctx, traveler, place);
      robbed = ctx.events.some((e) => e.type === 'crime.robbery');
    }
    expect(robbed).toBe(true);
    expect(traveler.gold).toBeLessThan(100);
    expect(ctx.world.bounties.get(outlaw.id)?.amount).toBeGreaterThan(0);
    // Word starts in the nearest town, and is still on its way to the others.
    expect(standingIn(outlaw, nearestTown(ctx, woods)!)).not.toBe('welcome');
    expect(ctx.world.news.length).toBeGreaterThan(0);
  });

  it('often go unnamed when a stranger is robbed alone in the wilds', () => {
    let unnamed = 0;
    for (let i = 0; i < 40; i++) {
      const { ctx, outlaw, traveler, place } = outlawAndTraveler(`unnamed-${i}`);
      speak(outlaw, 'common');
      speak(traveler, 'common');
      traveler.traits = { ...traveler.traits, bravery: 0 };
      ambush(ctx, traveler, place);
      const robbery = ctx.events.find((e) => e.type === 'crime.robbery');
      if (robbery?.type === 'crime.robbery' && robbery.data.known === false) unnamed++;
    }
    // Most are still named: a face seen up close is remembered.
    expect(unnamed).toBeGreaterThan(2);
    expect(unnamed).toBeLessThan(20);
  });

  it('take a merchant’s cargo along with the gold', () => {
    const { ctx, outlaw, traveler, place } = outlawAndTraveler('caravan');
    speak(outlaw, 'common');
    speak(traveler, 'common');
    traveler.calling = 'merchant';
    traveler.cargo = { ore: 20, hides: 4 };
    traveler.traits = { ...traveler.traits, bravery: 0.1 };
    let robbery: (typeof ctx.events)[number] | undefined;
    for (let i = 0; i < 10 && !robbery; i++) {
      outlaw.activity = { kind: 'pastime', pastime: 'lurk', since: 0, until: 1e9 };
      ambush(ctx, traveler, place);
      robbery = ctx.events.find((e) => e.type === 'crime.robbery');
    }
    expect(robbery?.type === 'crime.robbery' && robbery.data.goods).toEqual({ ore: 12, hides: 2 });
    expect(traveler.cargo).toEqual({ ore: 8, hides: 2 });
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
  it('are not paid on the spot: the killer takes the head instead', () => {
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
    expect(traveler.gold).toBe(before);
    expect(traveler.heads.map((h) => h.outlawId)).toEqual([outlaw.id]);
    expect(ctx.world.bounties.has(outlaw.id)).toBe(true);
  });

  it('leave a murder with no witnesses unsolved, and sometimes the body hidden', () => {
    let hidden = 0;
    let unsolved = 0;
    for (let i = 0; i < 30; i++) {
      const { ctx, outlaw, traveler } = outlawAndTraveler(`desolate-${i}`);
      traveler.death = {
        at: 0,
        locationId: woods,
        cause: { kind: 'character', characterId: outlaw.id },
      };
      onCharacterKilled(ctx, traveler, outlaw, { witnesses: 0, familiarity: 0 });
      expect(outlaw.crimes.at(-1)?.known).toBe(false);
      expect(ctx.world.bounties.has(outlaw.id)).toBe(false);
      if (traveler.death.hidden) hidden++;
      unsolved += ctx.world.unsolved.length;
    }
    expect(hidden).toBeGreaterThan(5);
    expect(unsolved).toBeGreaterThan(5);
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
