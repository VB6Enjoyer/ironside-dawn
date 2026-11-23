import { describe, expect, it } from 'vitest';

import { DAY } from '../core/time';
import { testCharacter, testContext, town } from '../test-support';
import { cursesDay, cursesOf, isMarked, layCurse, noticed, seekPriest } from './curses';
import { generateItem } from './items';

function someone(seed = 'curses') {
  const ctx = testContext(seed);
  const c = testCharacter(ctx);
  return { ctx, c };
}

describe('curses', () => {
  it('weigh on someone until time, a priest or the wise folk lift them', () => {
    const { ctx, c } = someone();
    layCurse(ctx, c, 'ill-luck', 'haunt', c.homeId);
    const [curse] = cursesOf(c, ctx.world.time);
    expect(curse!.mods).toEqual({ attack: -2, defense: -2 });
    expect(ctx.events.at(-1)!.type).toBe('character.cursed');
    // Not known at first; after a run of bad luck, it is.
    expect(noticed(curse!, ctx.world.time)).toBe(false);
    ctx.world.time += 7 * DAY;
    expect(noticed(curse!, ctx.world.time)).toBe(true);
    // Lesser curses pass with time.
    expect(cursesOf(c, ctx.world.time + 60 * DAY)).toHaveLength(0);
  });

  it('can be lifted by a priest, likelier for the faithful', () => {
    let lifted = 0;
    for (let i = 0; i < 40; i++) {
      const { ctx, c } = someone(`priest-${i}`);
      const here = town(ctx);
      c.gold = 1000;
      c.faith = 1;
      layCurse(ctx, c, 'wasting', 'undead', here.id);
      ctx.world.time += 7 * DAY;
      seekPriest(ctx, c, here.id);
      if (cursesOf(c, ctx.world.time).length === 0) lifted++;
    }
    expect(lifted).toBeGreaterThan(20);
  });

  it('come with a cursed thing while it is worn, and go when it is thrown away', () => {
    const { ctx, c } = someone();
    const trinket = {
      ...generateItem(ctx, ctx.rng.items, { culture: 'generic', depth: 3, slot: 'trinket' }),
      curse: 'weakness' as const,
    };
    c.equipment = { ...c.equipment, trinket };
    cursesDay(ctx, c);
    expect(cursesOf(c, ctx.world.time).map((e) => e.kind)).toEqual(['weakness']);
    // Once noticed, it is thrown away, and the curse goes with it.
    ctx.world.time += 7 * DAY;
    cursesDay(ctx, c);
    expect(c.equipment.trinket).toBeNull();
    expect(cursesOf(c, ctx.world.time)).toHaveLength(0);
    expect(ctx.events.some((e) => e.type === 'character.uncursed')).toBe(true);
  });

  it('mark someone, so that people shy from them', () => {
    const { ctx, c } = someone();
    expect(isMarked(c, ctx.world.time)).toBe(false);
    layCurse(ctx, c, 'marked', 'dying', c.homeId);
    expect(isMarked(c, ctx.world.time)).toBe(true);
  });
});
