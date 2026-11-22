import { SICKNESSES, SPECIES, type SicknessDef, type SicknessId } from '../../content';
import { DAY, HOUR, toCalendar, YEAR } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Location, LocationId } from '../model';
import { modifier } from './condition';
import { die } from './death';
import { addEffect } from './effects';
import { carries } from './effects-core';
import { blessing } from './faith-core';
import { buyFromHouse, payHouse, priceToBuy } from './market';

/**
 * Illness (0.4.0, ROADMAP.md "Body and Soul", step 5). Each town has a
 * sickness level, raised by winter and by the sick within it; anyone there
 * rolls each day to catch something, more so the frailer they are, and so
 * does anyone travelling with someone sick. A sickness weakens while it lasts
 * (a lasting effect), lays the sick up if they can afford it, and passes, or
 * kills: rarely the hale, more often the old, children and the frail.
 */

/** A town's everyday chance of sickness for a hale grown person, a day. */
const BASE_SICKNESS = 0.0008;
/** Out on the road or in the wilds, less: few to catch it from. */
const WILD_SICKNESS = 0.3;
/** By season (thaw, high summer, harvest, winter): sickness is commoner in winter. */
const SEASON_SICKNESS = [1, 0.6, 1.3, 2.8] as const;
/** Each share of a town's named folk who are sick adds this much again. */
const CONTAGION = 25;
/** A day's chance of catching it from a sick companion on the road. */
const PARTY_CONTAGION = 0.02;
/** A town's trading house holding this much gold a head counts as wealthy. */
const WEALTHY_PER_HEAD = 3;
/** A remedy cuts a sickness's course to this share of what it would have been. */
const REMEDY_COURSE = 0.65;
/** Chance a near death's untreated wound festers. */
const WOUND_ROT = 0.25;

/** Where someone is in life: a child, or how far into old age (0 before 70% of their lifespan). */
function lifeStage(c: Character, now: number): { child: boolean; old: number } {
  const def = SPECIES[c.species];
  const age = (now - c.born) / YEAR;
  return { child: age < def.adultAge, old: Math.max(0, age / def.lifespan - 0.7) };
}

/** How readily someone catches a sickness: their hardiness, toughness, age and what they carry. */
export function frailty(c: Character, now: number): number {
  const { child, old } = lifeStage(c, now);
  const ageing = child ? 1.5 : 1 + 3 * old;
  const weakened = carries(c, 'weakened', now) || carries(c, 'worn', now) ? 1.5 : 1;
  const toughness = Math.max(0.4, 1 - 0.08 * modifier(c, 'toughness'));
  return (1.6 - c.hardiness) * ageing * weakened * toughness;
}

/** How much likelier a sickness is to kill them: the very old most, children a little. */
function mortality(c: Character, now: number): number {
  const { child, old } = lifeStage(c, now);
  return (1.5 - c.hardiness) * (child ? 0.8 : 1 + 18 * old);
}

/** Whether someone can fall ill at all: the dread cannot. */
function mortal(c: Character): boolean {
  return c.calling !== 'dread' && !(SPECIES[c.species] as { ageless?: boolean }).ageless;
}

/**
 * How much sickness is about in each town today: the season, and the share of
 * its named folk already sick. Worked out once a day, for everyone.
 */
export function sicknessLevels(
  ctx: SimContext,
  living: readonly Character[],
): Map<LocationId, number> {
  const season = SEASON_SICKNESS[toCalendar(ctx.world.time).season as 0 | 1 | 2 | 3];
  const counts = new Map<LocationId, { sick: number; all: number }>();
  for (const c of living) {
    if (!c.locationId) continue;
    const n = counts.get(c.locationId) ?? { sick: 0, all: 0 };
    n.all++;
    if (c.illness && SICKNESSES[c.illness.sickness].contagious) n.sick++;
    counts.set(c.locationId, n);
  }
  const levels = new Map<LocationId, number>();
  for (const [id, { sick, all }] of counts) {
    const place = ctx.world.locations.get(id);
    const wild = place?.kind === 'town' ? 1 : WILD_SICKNESS;
    // Good remedies and wealth keep a town's sickness down (step 6).
    const care = place?.kind === 'town' ? 1.3 - 0.8 * careIn(ctx, id) : 1;
    levels.set(
      id,
      BASE_SICKNESS * season * wild * care * (1 + (CONTAGION * sick) / Math.max(1, all)),
    );
  }
  return levels;
}

/** Somewhere, and not on the road, in a fight or in a delve. */
function atRest(c: Character): boolean {
  if (!c.locationId) return false;
  const kind = c.activity.kind;
  return (
    kind === 'idle' ||
    kind === 'pastime' ||
    kind === 'resting' ||
    kind === 'living' ||
    kind === 'convalescing' ||
    kind === 'jailed'
  );
}

/**
 * How well a town cares for its sick, 0 to 1 (0.4.0, step 6): whether
 * remedies are to be had, how good its healers are (better ones, dearer),
 * and how wealthy it is. Towns that care well suffer far less sickness.
 */
export function careIn(ctx: SimContext, townId: LocationId): number {
  const market = ctx.world.markets.get(townId);
  const town = ctx.world.locations.get(townId);
  if (!market || !town) return 0;
  const stocked = (market.house.stock.remedies ?? 0) >= 1 ? 1 : 0.3;
  const people = Object.values(town.population).reduce<number>((s, n) => s + (n ?? 0), 0);
  const wealth = Math.min(1, market.house.gold / Math.max(1, people) / WEALTHY_PER_HEAD);
  return Math.min(1, stocked * (0.4 * healersIn(ctx, townId) + 0.6 * wealth));
}

/** How good a town's healers are, 0.5 to 1.5, decided once by the world and never stored. */
export function healersIn(ctx: SimContext, townId: LocationId): number {
  let h = 2166136261;
  for (const ch of `${ctx.world.seed}/healers/${townId}`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return 0.5 + ((h >>> 0) % 1000) / 1000;
}

/**
 * The sick buy a remedy where they can afford one, at the price the town's
 * healers ask (better healers, dearer): it shortens the sickness and makes it
 * far less likely to kill. Townsfolk are tended as well as their town cares.
 */
function seekRemedy(ctx: SimContext, c: Character): void {
  const illness = c.illness;
  if (!illness || illness.treated || !c.locationId) return;
  const town = ctx.world.locations.get(c.locationId);
  const market = ctx.world.markets.get(c.locationId);
  if (!town || !market || town.kind !== 'town') return;
  let treated = false;
  if (c.calling === 'adventurer' || c.calling === 'merchant') {
    const quality = healersIn(ctx, town.id);
    const price = priceToBuy(market, c, town, 'remedies', 1);
    if (price !== null && (market.house.stock.remedies ?? 0) >= 1) {
      const fee = Math.round(price * quality);
      if (c.gold >= fee * 3) {
        buyFromHouse(market, c, town, 'remedies', 1);
        // The better the healer, the more they charge on top.
        const extra = Math.max(0, fee - price);
        if (extra > 0) payHouse(market, c, extra);
        treated = true;
      }
    }
  } else {
    treated = ctx.rng.people.chance(careIn(ctx, town.id));
  }
  if (!treated) return;
  illness.treated = true;
  illness.until = illness.since + Math.round((illness.until - illness.since) * REMEDY_COURSE);
}

/** Falls ill: the sickness runs its course from now, weakening them while it lasts. */
export function fallIll(ctx: SimContext, c: Character, sickness: SicknessId, at: LocationId): void {
  if (c.illness || !mortal(c)) return;
  const def: SicknessDef = SICKNESSES[sickness];
  const now = ctx.world.time;
  const days = ctx.rng.people.int(def.days[0], def.days[1]);
  const until = now + days * DAY;
  c.illness = { sickness, since: now, until, treated: false };
  addEffect(c, { kind: 'sick', mods: def.mods, since: now, fadeFrom: until - DAY, until }, now);
  ctx.emit(
    { type: 'character.sick', data: { characterId: c.id, locationId: at, sickness } },
    [c.id],
    at,
  );
}

/** A near death's wound may fester, untreated in the wilds. */
export function woundMayFester(ctx: SimContext, c: Character, at: Location): void {
  if (at.kind !== 'town' && ctx.rng.people.chance(WOUND_ROT)) fallIll(ctx, c, 'rot', at.id);
}

/**
 * A day of sickness and health for one person: the sick may die of it, or
 * get well; the well may catch something from the town around them or from
 * a sick companion.
 */
export function illnessDay(
  ctx: SimContext,
  c: Character,
  levels: ReadonlyMap<LocationId, number>,
  companionSick: boolean,
): void {
  if (!mortal(c)) return;
  const now = ctx.world.time;
  const at = c.locationId ?? c.homeId;
  const rng = ctx.rng.people;
  if (c.illness) {
    seekRemedy(ctx, c);
    const { sickness, since, until, treated } = c.illness;
    const def: SicknessDef = SICKNESSES[sickness];
    // Death comes, if it comes, spread over the course of the sickness.
    const days = Math.max(1, (until - since) / DAY);
    const resting = c.activity.kind === 'convalescing' || c.activity.kind === 'living';
    const daily =
      (def.deadliness / days) * mortality(c, now) * (resting ? 0.7 : 1) * (treated ? 0.4 : 1);
    // As with old age, death comes to those at rest somewhere, not on the road or mid-fight.
    if (atRest(c) && rng.chance(daily)) {
      die(ctx, c, { kind: 'illness', sickness });
      return;
    }
    if (now >= until) {
      c.illness = null;
      // Coming through it makes many give thanks.
      blessing(c, 0.05, 0);
      ctx.emit(
        { type: 'character.recover', data: { characterId: c.id, locationId: at, sickness } },
        [c.id],
        at,
      );
    }
    return;
  }
  const level = c.locationId ? (levels.get(c.locationId) ?? 0) : BASE_SICKNESS * WILD_SICKNESS;
  const chance = level * frailty(c, now) + (companionSick ? PARTY_CONTAGION : 0);
  if (!rng.chance(chance)) return;
  // In winter it is most often a cough; otherwise a fever.
  const winter = toCalendar(now).season === 3;
  fallIll(ctx, c, winter && rng.chance(0.6) ? 'cough' : 'fever', at);
}

/** Hours of rest a day that being sick costs someone who can afford it: what they would rather do. */
export const SICK_REST_HOURS = 12 * HOUR;
