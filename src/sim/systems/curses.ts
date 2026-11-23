import { CURSES, EFFECTS, type CurseId, type CurseSource, type EffectDef } from '../../content';
import { DAY, YEAR } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Effect, Item, LocationId } from '../model';
import { addEffect } from './effects';
import { priestsIn } from './faith-core';
import { hardshipOf } from './hardship';
import { payHouse } from './market';

/**
 * Curses (0.4.0, ROADMAP.md "Body and Soul", step 8): ill luck in fights, a
 * wasting, a weakness, or the mark that makes people wary. Laid by cursed
 * things found in dungeons, by haunted places, by the touch of the undead,
 * by the dread, and now and then by a murder victim's dying breath. Someone
 * notices theirs after a while and seeks help: a priest (likelier to lift it
 * the more faith they have), or the wise folk of the town (cheap, and often
 * no use). Lesser curses pass with time; a cursed thing is thrown away once
 * its curse is noticed.
 */

/** Days a curse lasts, at least and at most; the wasting lasts until it is lifted. */
const DAYS: Readonly<Record<CurseId, readonly [number, number]>> = {
  'ill-luck': [20, 40],
  wasting: [10 * 360, 10 * 360],
  weakness: [20, 40],
  marked: [90, 180],
};
/** Days before someone notices they are cursed. */
const NOTICE_DAYS = 6;
/** A curse that comes with a cursed thing lasts as long as it is worn. */
const WORN = 100 * YEAR;
/** Chance a piece of armor or a trinket found in a dungeon is cursed, worth half. */
export const CURSED_FIND = 0.04;
/** What a priest asks to try to lift a curse, and wise folk. */
const PRIEST_FEE = 20;
const WISE_FEE = 3;
/** A day's chance someone who knows they are cursed tries the wise folk, and their odds. */
const WISE_VISIT = 0.03;
const WISE_SUCCESS = 0.35;

const isCurse = (e: Effect): e is Effect & { kind: CurseId } =>
  (CURSES as readonly string[]).includes(e.kind);

/** The curses someone carries now. */
export function cursesOf(c: Character, now: number): (Effect & { kind: CurseId })[] {
  return c.effects.filter((e): e is Effect & { kind: CurseId } => isCurse(e) && e.until > now);
}

/** Whether they know of a curse: after a run of bad luck, a few days on. */
export function noticed(effect: Effect, now: number): boolean {
  return now - effect.since >= NOTICE_DAYS * DAY;
}

/** Lays a curse on someone, and tells of it. */
export function layCurse(
  ctx: SimContext,
  c: Character,
  curse: CurseId,
  source: CurseSource,
  at: LocationId,
  item?: Item,
): void {
  if (c.calling === 'dread') return;
  // A gentle world spares some, a harsh one none (item curses always come with the item).
  if (!item && !ctx.rng.people.chance(Math.min(1, hardshipOf(ctx.world)))) return;
  const now = ctx.world.time;
  const def: EffectDef = EFFECTS[curse];
  const [least, most] = DAYS[curse];
  const until = item ? now + WORN : now + ctx.rng.people.int(least, most) * DAY;
  const effect: Effect = {
    kind: curse,
    mods: def.mods!,
    since: now,
    fadeFrom: until,
    until,
    ...(item ? { itemId: item.id } : {}),
  };
  if (!addEffect(c, effect, now)) return;
  ctx.emit(
    { type: 'character.cursed', data: { characterId: c.id, locationId: at, curse, source } },
    [c.id],
    at,
  );
}

/** A curse picked at random, for sources that may lay any. */
export function anyCurse(ctx: SimContext): CurseId {
  return ctx.rng.people.pick(CURSES);
}

function lift(
  ctx: SimContext,
  c: Character,
  effect: Effect & { kind: CurseId },
  by: 'priest' | 'wise' | 'discard',
  at: LocationId,
): void {
  c.effects = c.effects.filter((e) => e !== effect);
  // Lifting a curse that came with a thing lifts it from the thing too.
  if (effect.itemId) {
    for (const slot of ['armor', 'trinket'] as const) {
      const item = c.equipment[slot];
      if (item?.id === effect.itemId && item.curse) {
        const clean: Item = { ...item };
        delete (clean as { curse?: CurseId }).curse;
        // A new equipment object, so what it adds up to is worked out afresh.
        c.equipment = { ...c.equipment, [slot]: by === 'discard' ? null : clean };
      }
    }
  }
  ctx.emit(
    {
      type: 'character.uncursed',
      data: { characterId: c.id, locationId: at, curse: effect.kind, by },
    },
    [c.id],
    at,
  );
}

/** At a shrine, a priest may lift a curse they know of, for a fee: likelier the more faith they have. */
export function seekPriest(ctx: SimContext, c: Character, townId: LocationId): void {
  const now = ctx.world.time;
  const curse = cursesOf(c, now).find((e) => noticed(e, now));
  const market = ctx.world.markets.get(townId);
  if (!curse || !market || priestsIn(ctx.world, townId) === 0 || c.gold < PRIEST_FEE * 2) return;
  payHouse(market, c, PRIEST_FEE);
  if (ctx.rng.people.chance(0.3 + 0.5 * c.faith)) lift(ctx, c, curse, 'priest', townId);
}

/**
 * A day of curses for one person: what they wear brings its curse on them,
 * and takes it away once taken off; a cursed thing whose curse they have
 * noticed is thrown away; and now and then they try the wise folk in town.
 */
export function cursesDay(ctx: SimContext, c: Character): void {
  if (c.calling === 'dread') return;
  const now = ctx.world.time;
  const worn = [c.equipment.armor, c.equipment.trinket].filter(
    (item): item is Item => item !== null && item.curse !== undefined,
  );
  // A curse from something no longer worn goes with it.
  const wornIds = new Set(worn.map((i) => i.id));
  if (c.effects.some((e) => e.itemId && !wornIds.has(e.itemId))) {
    c.effects = c.effects.filter((e) => !e.itemId || wornIds.has(e.itemId));
  }
  const at = c.locationId ?? c.homeId;
  for (const item of worn) {
    const effect = c.effects.find((e) => e.itemId === item.id);
    if (!effect) layCurse(ctx, c, item.curse!, 'item', at, item);
    else if (isCurse(effect) && noticed(effect, now)) lift(ctx, c, effect, 'discard', at);
  }
  // The wise folk: cheap, and often no help at all.
  const town = c.locationId ? ctx.world.locations.get(c.locationId) : undefined;
  const market = town ? ctx.world.markets.get(town.id) : undefined;
  if (!town || town.kind !== 'town' || !market) return;
  const curse = cursesOf(c, now).find((e) => noticed(e, now) && !e.itemId);
  if (!curse || c.gold < WISE_FEE * 3 || !ctx.rng.people.chance(WISE_VISIT)) return;
  payHouse(market, c, WISE_FEE);
  if (ctx.rng.people.chance(WISE_SUCCESS)) lift(ctx, c, curse, 'wise', town.id);
}

/** Whether someone carries the mark, which makes people wary of them. */
export function isMarked(c: Character, now: number): boolean {
  return c.effects.some((e) => e.kind === 'marked' && e.until > now);
}
