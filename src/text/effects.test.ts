import { describe, expect, it } from 'vitest';

import { HOUR, type Character } from '../sim';
import { describeMods, effectLines } from './effects';

const now = 1_000 * HOUR;
const someone = (effects: Character['effects']) => ({ effects }) as Character;

describe('lasting effects in words', () => {
  it('say what an effect does, shares as percentages and the rest as points', () => {
    expect(describeMods({ recovery: 0.4, stamina: 0.1 })).toBe('+40% recovery, +10% stamina');
    expect(describeMods({ attack: -1, defense: -1 })).toBe('-1 attack, -1 defense');
    expect(describeMods({ agility: -6 })).toBe('-6 agility');
  });

  it('give one line a kind, with the time left, good or bad', () => {
    const lines = effectLines(
      someone([
        {
          kind: 'rested',
          mods: { recovery: 0.4 },
          since: now,
          fadeFrom: now,
          until: now + 9 * HOUR,
        },
        { kind: 'drained', mods: { agility: -6 }, since: now, fadeFrom: now, until: now + HOUR },
        {
          kind: 'drained',
          mods: { agility: -6 },
          since: now,
          fadeFrom: now,
          until: now + 3 * HOUR,
        },
        { kind: 'dizzy', mods: { attack: -2 }, since: now, fadeFrom: now, until: now - 1 },
      ]),
      now,
    );
    expect(lines.map((l) => l.name)).toEqual(['well rested', 'drained']);
    expect(lines[0]).toMatchObject({ good: true, left: 'about 9 hours left' });
    // Costs of a kind add up to their cap, and last as long as the longest.
    expect(lines[1]).toMatchObject({
      good: false,
      detail: '-9 agility',
      left: 'about 3 hours left',
    });
  });
});
