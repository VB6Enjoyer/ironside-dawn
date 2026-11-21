import { describe, expect, it } from 'vitest';

import type { Character, LocationId } from '../model';
import { DAY } from '../core/time';
import { testCharacter, testContext } from '../test-support';
import {
  capture,
  claimHeads,
  considerRestitution,
  escort,
  justiceDay,
  release,
  restitutionBill,
  sentence,
  tryEscape,
} from './justice';
import { recordCrime, standingIn } from './notoriety';

const concordale = 'concordale' as LocationId;
const saltmere = 'saltmere' as LocationId;
const woods = 'witherwood' as LocationId;

const outlawRecord = (c: Character, crimes = 0) =>
  (c.outlaw = { since: 0, crimes, murders: 0, lastCrimeAt: 0, lastSeenAt: concordale });

function setup(seed: string) {
  const ctx = testContext(seed);
  const outlaw = testCharacter(ctx);
  outlawRecord(outlaw);
  const hunter = testCharacter(ctx);
  return { ctx, outlaw, hunter };
}

/** A known theft in Concordale, so the town knows them and posts a bounty. */
function steal(ctx: ReturnType<typeof testContext>, thief: Character, value = 60) {
  recordCrime(ctx, thief, {
    kind: 'burglary',
    at: ctx.world.time,
    locationId: concordale,
    townId: concordale,
    value,
    known: true,
  });
}

describe('restitution', () => {
  it('pays back what was taken with interest and a fine, and clears the name', () => {
    const { ctx, outlaw } = setup('restitution');
    steal(ctx, outlaw);
    const bill = restitutionBill(outlaw);
    expect(bill.total).toBeGreaterThan(60);
    outlaw.gold = bill.total + 10;
    outlaw.traits = { ...outlaw.traits, honor: 1 };
    outlaw.locationId = concordale;
    // Two years on the road, the last half year quiet.
    outlaw.outlaw = { ...outlaw.outlaw!, since: ctx.world.time - 720 * DAY };
    outlaw.outlaw.lastCrimeAt = ctx.world.time - 200 * DAY;
    const house = ctx.world.markets.get(concordale)!.house;
    const before = house.gold;
    for (let i = 0; i < 400 && outlaw.outlaw; i++) considerRestitution(ctx, outlaw);
    expect(outlaw.outlaw).toBeNull();
    expect(outlaw.gold).toBe(10);
    expect(house.gold).toBe(before + bill.total);
    expect(ctx.world.bounties.has(outlaw.id)).toBe(false);
    // Standing must still be earned back.
    expect(standingIn(outlaw, concordale)).toBe('suspected');
  });

  it('is not for those with blood on their hands', () => {
    const { ctx, outlaw } = setup('blood');
    outlaw.outlaw!.murders = 1;
    outlaw.gold = 10_000;
    outlaw.locationId = concordale;
    for (let i = 0; i < 400; i++) considerRestitution(ctx, outlaw);
    expect(outlaw.outlaw).not.toBeNull();
  });
});

describe('justice', () => {
  it('sends a thief to prison for years, more for a longer record', () => {
    const { ctx, outlaw } = setup('prison');
    const town = ctx.world.locations.get(concordale)!;
    steal(ctx, outlaw);
    sentence(ctx, outlaw, town);
    const short = outlaw.activity.kind === 'jailed' ? outlaw.activity.until - ctx.world.time : 0;
    const other = testCharacter(ctx);
    outlawRecord(other);
    for (let i = 0; i < 8; i++) steal(ctx, other, 200);
    sentence(ctx, other, town);
    const long = other.activity.kind === 'jailed' ? other.activity.until - ctx.world.time : 0;
    expect(short).toBeGreaterThanOrEqual(360 * DAY);
    expect(long).toBeGreaterThan(short * 2);
  });

  it('hangs a known murderer on a set day, but not for a murder nobody knows of', () => {
    const { ctx, outlaw } = setup('gallows');
    const town = ctx.world.locations.get(concordale)!;
    recordCrime(ctx, outlaw, {
      kind: 'murder',
      at: ctx.world.time,
      locationId: concordale,
      townId: concordale,
      value: 0,
      known: true,
    });
    sentence(ctx, outlaw, town);
    expect(outlaw.activity.kind === 'jailed' && outlaw.activity.sentence).toBe('death');
    release(ctx, outlaw);
    expect(outlaw.death?.cause.kind).toBe('executed');
    const quiet = testCharacter(ctx);
    outlawRecord(quiet);
    recordCrime(ctx, quiet, {
      kind: 'murder',
      at: ctx.world.time,
      locationId: woods,
      townId: concordale,
      value: 0,
      known: false,
    });
    steal(ctx, quiet);
    sentence(ctx, quiet, town);
    expect(quiet.activity.kind === 'jailed' && quiet.activity.sentence).toBe('prison');
  });
});

describe('heads', () => {
  it('are paid for in a town that knows the bounty, split with the party', () => {
    const { ctx, outlaw, hunter } = setup('head');
    steal(ctx, outlaw);
    const bounty = ctx.world.bounties.get(outlaw.id)!;
    hunter.heads.push({ outlawId: outlaw.id, takenAt: ctx.world.time });
    const friend = testCharacter(ctx);
    const party = {
      id: 'p1' as never,
      leaderId: hunter.id,
      members: [hunter.id, friend.id],
      formedAt: 0,
    };
    ctx.world.parties.set(party.id, party);
    hunter.partyId = friend.partyId = party.id;
    // Saltmere hasn't heard of the outlaw yet: it pays nothing.
    claimHeads(ctx, hunter, ctx.world.locations.get(saltmere)!);
    expect(hunter.heads).toHaveLength(1);
    const before = hunter.gold + friend.gold;
    claimHeads(ctx, hunter, ctx.world.locations.get(concordale)!);
    expect(hunter.heads).toHaveLength(0);
    expect(hunter.gold + friend.gold).toBe(before + bounty.amount);
    expect(friend.gold).toBeGreaterThan(0);
    expect(ctx.world.bounties.has(outlaw.id)).toBe(false);
  });

  it('are lost if carried too long, and the bounty with them', () => {
    const { ctx, outlaw, hunter } = setup('rot');
    steal(ctx, outlaw);
    hunter.heads.push({ outlawId: outlaw.id, takenAt: ctx.world.time });
    ctx.world.time += 100 * DAY;
    justiceDay(ctx);
    expect(hunter.heads).toHaveLength(0);
    expect(ctx.world.bounties.has(outlaw.id)).toBe(false);
  });
});

describe('taken alive', () => {
  it('strips the captive of gold and gear, and pays more when delivered', () => {
    const { ctx, outlaw, hunter } = setup('alive');
    steal(ctx, outlaw);
    const amount = ctx.world.bounties.get(outlaw.id)!.amount;
    outlaw.gold = 100;
    outlaw.locationId = hunter.locationId = woods;
    capture(ctx, outlaw, [hunter], ctx.world.locations.get(woods)!);
    expect(outlaw.captive?.captorId).toBe(hunter.id);
    expect(hunter.escorting).toBe(outlaw.id);
    expect(outlaw.gold).toBe(20);
    expect(hunter.pack.length).toBeGreaterThan(0);
    // Off to a town that would pay.
    let bound: LocationId | null = null;
    escort(ctx, hunter, ctx.world.locations.get(woods)!, (to) => ((bound = to), true));
    expect(bound).toBe(concordale);
    const before = hunter.gold;
    hunter.locationId = outlaw.locationId = concordale;
    escort(ctx, hunter, ctx.world.locations.get(concordale)!, () => true);
    expect(hunter.gold - before).toBeGreaterThan(amount * 2);
    expect(outlaw.activity.kind === 'jailed' && outlaw.activity.sentence).toBe('prison');
    expect(hunter.escorting).toBeUndefined();
    release(ctx, outlaw);
    expect(outlaw.outlaw).toBeNull();
  });

  it('lets a captive slip away on the road, leaving the seized purse to the captors', () => {
    const { ctx, outlaw, hunter } = setup('escape');
    outlaw.level = 30;
    outlaw.gold = 100;
    hunter.level = 1;
    outlaw.locationId = hunter.locationId = woods;
    capture(ctx, outlaw, [hunter], ctx.world.locations.get(woods)!);
    let escaped = false;
    for (let i = 0; i < 200 && !escaped; i++) {
      escaped = tryEscape(ctx, hunter, ctx.world.locations.get(woods)!);
    }
    expect(escaped).toBe(true);
    expect(outlaw.captive).toBeUndefined();
    expect(hunter.gold).toBeGreaterThanOrEqual(80);
    expect(outlaw.activity.kind).toBe('idle');
  });
});
