import { describe, expect, it } from 'vitest';

import type { Character, LocationId } from '../model';
import { testCharacter, testContext, town } from '../test-support';
import { finishLeg, startJourney } from './travel';
import {
  adjustOpinion,
  communication,
  hostility,
  learnLanguage,
  gatherParty,
  leaveParty,
  mournDeath,
  partyOf,
  shareSpoils,
  socialize,
} from './social';

function pair(seed = 'social') {
  const ctx = testContext(seed);
  const a = testCharacter(ctx);
  const b = testCharacter(ctx);
  return { ctx, a, b };
}

const make = (c: Character, species: Character['species']) => {
  (c as { species: Character['species'] }).species = species;
  c.languages = {
    [species === 'human' ? 'common' : species === 'elf' ? 'sylvan' : 'deeptongue']: 100,
  };
};

describe('language', () => {
  it('lets people of a people talk, and strangers only once one learns the other’s tongue', () => {
    const { a, b, ctx } = pair();
    make(a, 'human');
    make(b, 'elf');
    expect(communication(a, b)).toBe(0);
    for (let i = 0; i < 60; i++) learnLanguage(ctx, a, 'sylvan', 5, a.homeId);
    expect(communication(a, b)).toBeGreaterThan(0.6);
    expect(
      ctx.events.filter((e) => e.type === 'character.language').map((e) => e.data),
    ).toMatchObject([
      { language: 'sylvan', level: 'conversational' },
      { language: 'sylvan', level: 'fluent' },
    ]);
  });
});

describe('opinions', () => {
  it('stay in range', () => {
    const { a, b } = pair();
    const o = adjustOpinion(a, b.id, { affinity: 5, trust: -5, familiarity: 9 }, 0);
    expect([o.affinity, o.trust, o.familiarity]).toEqual([1, 0, 1]);
  });

  it('forget the least known when too many', () => {
    const ctx = testContext();
    const a = testCharacter(ctx);
    const others = Array.from({ length: 40 }, () => testCharacter(ctx));
    others.forEach((o, i) => adjustOpinion(a, o.id, { familiarity: i / 40 }, 0));
    // Forgotten in a batch once a few too many pile up.
    expect(Object.keys(a.opinions).length).toBeLessThanOrEqual(38);
    expect(Object.keys(a.opinions).length).toBeGreaterThanOrEqual(30);
    expect(a.opinions[others[39]!.id]).toBeDefined();
    expect(a.opinions[others[1]!.id]).toBeUndefined();
  });

  it('make a cruel outlaw more hostile to a stranger than a friend is', () => {
    const { a, b } = pair();
    a.traits = { ...a.traits, compassion: 0.05 };
    a.outlaw = { since: 0, crimes: 0, murders: 0, lastCrimeAt: 0, lastSeenAt: a.homeId };
    const strangerHostility = hostility(a, b);
    adjustOpinion(a, b.id, { affinity: 0.9 }, 0);
    expect(hostility(a, b)).toBeLessThan(strangerHostility);
  });
});

describe('meetings', () => {
  /** Puts both at a Concordale tavern and lets them meet many times. */
  function meetOften(
    a: Character,
    b: Character,
    ctx: ReturnType<typeof testContext>,
    times: number,
  ) {
    const tavern = town(ctx);
    for (const c of [a, b]) {
      c.locationId = tavern.id;
      c.activity = { kind: 'pastime', pastime: 'tavern', since: 0, until: 1 };
      c.traits = { ...c.traits, sociability: 1, compassion: 0.8, honor: 0.8 };
    }
    for (let i = 0; i < times; i++) socialize(ctx, a, tavern);
  }

  it('turn kin who can talk into friends, and then into a party', () => {
    const { a, b, ctx } = pair('friends');
    make(a, 'dwarf');
    make(b, 'dwarf');
    meetOften(a, b, ctx, 120);
    expect(a.opinions[b.id]?.bond).toBe('friend');
    expect(ctx.events.some((e) => e.type === 'social.friend')).toBe(true);
    expect(partyOf(ctx, a)).not.toBeNull();
    expect(partyOf(ctx, a)).toBe(partyOf(ctx, b));
  });

  it('warm strangers who share no tongue far more slowly', () => {
    const kin = pair('kin');
    make(kin.a, 'human');
    make(kin.b, 'human');
    meetOften(kin.a, kin.b, kin.ctx, 15);
    const strangers = pair('strangers');
    make(strangers.a, 'dwarf');
    make(strangers.b, 'elf');
    meetOften(strangers.a, strangers.b, strangers.ctx, 15);
    expect(kin.a.opinions[kin.b.id]!.affinity).toBeGreaterThan(
      (strangers.a.opinions[strangers.b.id]?.affinity ?? 0) + 0.1,
    );
  });
});

describe('parties', () => {
  function party(seed: string) {
    const ctx = testContext(seed);
    const [leader, member] = [testCharacter(ctx), testCharacter(ctx)];
    ctx.world.parties.set('p1' as never, {
      id: 'p1' as never,
      leaderId: leader.id,
      members: [leader.id, member.id],
      formedAt: 0,
    });
    leader.partyId = member.partyId = 'p1' as never;
    adjustOpinion(member, leader.id, { affinity: 0.6, trust: 0.6 }, 0);
    return { ctx, leader, member };
  }
  const progress = (gold: number) => ({
    locationId: 'dungeon-of-misery' as LocationId,
    room: 3,
    goldFound: gold,
    itemsFound: 0,
    valueFound: 0,
    lowestHp: 1,
  });

  it('share gold evenly under an honorable leader', () => {
    const { ctx, leader, member } = party('fair');
    leader.traits = { ...leader.traits, honor: 0.9 };
    leader.gold = 100;
    member.gold = 0;
    shareSpoils(ctx, leader, [member], progress(100));
    expect(member.gold).toBe(50);
    expect(member.opinions[leader.id]!.affinity).toBeGreaterThan(0.6);
  });

  it('breed resentment, and break up, under a cheating one', () => {
    const { ctx, leader, member } = party('unfair');
    leader.traits = { ...leader.traits, honor: 0.05 };
    leader.gold = 100;
    for (let i = 0; i < 3 && member.partyId; i++) shareSpoils(ctx, leader, [member], progress(100));
    expect(member.opinions[leader.id]!.affinity).toBeLessThan(0.2);
    expect(member.partyId).toBeNull();
    expect(ctx.world.parties.size).toBe(0);
    expect(ctx.events.some((e) => e.type === 'party.disband')).toBe(true);
  });

  it('pass leadership on when the leader leaves a bigger party', () => {
    const { ctx, leader, member } = party('succession');
    const third = testCharacter(ctx);
    const p = partyOf(ctx, leader)!;
    p.members.push(third.id);
    third.partyId = p.id;
    leaveParty(ctx, leader, 'quarrel');
    expect(p.leaderId).toBe(member.id);
    expect(p.members).toEqual([member.id, third.id]);
  });

  it('lets a follower left on the road walk the rest of the way alone', () => {
    const { ctx, leader, member } = party('road');
    const company = gatherParty(ctx, leader, town(ctx));
    expect(company).toEqual([member]);
    startJourney(ctx, leader, 'saltmere' as LocationId, 'wander', [], company);
    expect(member.locationId).toBeNull();
    const leg = leader.activity.kind === 'traveling' ? leader.activity.leg : null;

    leaveParty(ctx, leader, 'outlaw'); // turns outlaw halfway down the road
    expect(member.activity).toMatchObject({ kind: 'traveling', leg, remaining: [] });
    expect(member.locationId).toBeNull();
    expect(finishLeg(ctx, member)).toBe('arrived');
    expect(member.locationId).toBe(leg!.to);
  });
});

describe('mourning', () => {
  it('grieves friends, and turns grief into a grudge against a killer', () => {
    const ctx = testContext('grief');
    const [friend, deceased, killer] = [testCharacter(ctx), testCharacter(ctx), testCharacter(ctx)];
    adjustOpinion(friend, deceased.id, { affinity: 0.8 }, 0);
    deceased.death = {
      at: 0,
      locationId: deceased.homeId,
      cause: { kind: 'character', characterId: killer.id },
    };
    mournDeath(ctx, deceased, killer.id);
    expect(friend.memories.some((m) => m.kind === 'grief')).toBe(true);
    expect(friend.opinions[killer.id]?.bond).toBe('rival');
    expect(
      ctx.events.some((e) => e.type === 'social.mourn' && e.data.characterId === friend.id),
    ).toBe(true);
  });
});
