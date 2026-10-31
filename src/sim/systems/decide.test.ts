import { describe, expect, it } from 'vitest';

import type { Character, LocationId, Location } from '../model';
import { testCharacter, testContext, town } from '../test-support';
import { decideAt, type Action } from './decide';

/** How often a character in a given state picks each kind of action. */
function tally(
  setup: (c: Character) => void,
  where: (ctx: ReturnType<typeof testContext>) => Location,
  runs = 600,
) {
  const ctx = testContext('decide');
  const c = testCharacter(ctx);
  setup(c);
  const here = where(ctx);
  c.locationId = here.id;
  const counts = new Map<string, number>();
  for (let i = 0; i < runs; i++) {
    const decision = decideAt(ctx, c, here)!;
    const key = label(decision.action);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (key: string) => (counts.get(key) ?? 0) / runs;
}

function label(action: Action): string {
  switch (action.kind) {
    case 'pastime':
      return action.pastime;
    case 'travel':
      return `travel:${action.reason}`;
    default:
      return action.kind;
  }
}

const dungeon = (ctx: ReturnType<typeof testContext>) =>
  ctx.world.locations.get('dungeon-of-misery' as LocationId)!;

describe('utility AI', () => {
  it('sends the bold into a dungeon more readily than the timid', () => {
    const scared = (bravery: number) =>
      tally((c) => {
        c.traits = { ...c.traits, bravery };
        c.drives = { glory: 0.6, companionship: 0, purpose: 0.5 };
        c.expectations['dungeon-of-misery' as LocationId] = {
          trips: 3,
          reward: 20,
          danger: 0.6,
          lastAt: 0,
        };
      }, dungeon);
    expect(scared(0.9)('delve')).toBeGreaterThan(scared(0.1)('delve') + 0.2);
  });

  it('keeps the content in town and sends the restless out', () => {
    const rate = (purpose: number) =>
      tally(
        (c) => (c.drives = { glory: 0.2, companionship: 0.1, purpose }),
        (ctx) => town(ctx),
      );
    expect(rate(0.9)('travel:delve')).toBeGreaterThan(0.5);
    expect(rate(0)('travel:delve')).toBeLessThan(0.05);
  });

  it('sends the lonely to the tavern', () => {
    const rate = (companionship: number) =>
      tally(
        (c) => (c.drives = { glory: 0, companionship, purpose: 0 }),
        (ctx) => town(ctx),
      );
    expect(rate(0.9)('tavern')).toBeGreaterThan(rate(0)('tavern') + 0.3);
  });

  it('puts healing first when hurt, and sells loot when carrying it', () => {
    const hurt = tally(
      (c) => (c.hp = c.maxHp * 0.3),
      (ctx) => town(ctx),
    );
    expect(hurt('convalesce')).toBeGreaterThan(0.9);
    const laden = tally(
      (c) => {
        c.drives = { glory: 0, companionship: 0, purpose: 0 };
        c.pack.push({ loot: 'imp-horn', value: 20 });
      },
      (ctx) => town(ctx),
    );
    expect(laden('sell')).toBeGreaterThan(0.9);
  });

  it('never sends the hurt into a dungeon, only toward a town', () => {
    const hurt = tally((c) => (c.hp = c.maxHp * 0.3), dungeon);
    expect(hurt('delve')).toBe(0);
    expect(hurt('travel:heal')).toBe(1);
  });

  it('names its strongest reasons', () => {
    const ctx = testContext();
    const c = testCharacter(ctx);
    c.drives = { glory: 0, companionship: 1, purpose: 0 };
    let named = false;
    for (let i = 0; i < 50 && !named; i++) {
      const d = decideAt(ctx, c, town(ctx))!;
      if (d.action.kind === 'pastime' && d.action.pastime === 'tavern') {
        expect(d.why).toContainEqual({ kind: 'drive', drive: 'companionship' });
        named = true;
      }
    }
    expect(named).toBe(true);
  });
});
