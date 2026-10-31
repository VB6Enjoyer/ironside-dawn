import { describe, expect, it } from 'vitest';

import { CREATURES, type CreatureDef } from '../../content';
import { createRng } from '../core/rng';
import type { FighterState } from '../model';
import { CORNERED_PENALTY, FLEE_DIFFICULTY, fightRound, fightWinner } from './combat-core';

type FightOutcome = 'won' | 'lost' | 'fled';

/** The result for the adventurer at index 0, or null while the fight goes on. */
function fightOutcome(fighters: readonly FighterState[]): FightOutcome | null {
  const self = fighters[0]!;
  if (self.out === 'dead') return 'lost';
  if (self.out === 'fled') return 'fled';
  return fightWinner(fighters) === 0 ? 'won' : null;
}

const fighter = (overrides: Partial<FighterState> = {}): FighterState => ({
  side: 0,
  attack: 4,
  damage: '1d8',
  damageBonus: 0,
  defense: 14,
  agility: 0,
  fleeBelow: 0.41,
  hp: 28,
  maxHp: 28,
  stamina: 16,
  ward: 0,
  out: null,
  ...overrides,
});

const foe = (def: CreatureDef, rng = createRng('foe')): FighterState => {
  const hp = rng.roll(def.hp);
  return fighter({
    side: 1,
    attack: def.attack,
    damage: def.damage,
    defense: def.defense,
    agility: def.agility,
    fleeBelow: def.fleeBelow,
    hp,
    maxHp: hp,
    stamina: null,
  });
};

/** Fights an average adventurer against a creature's usual group, many times. */
function odds(def: CreatureDef, fights = 3000): Record<FightOutcome, number> {
  const rng = createRng(`odds-${def.id}`);
  const results = { won: 0, lost: 0, fled: 0 };
  for (let n = 0; n < fights; n++) {
    const count = rng.int(def.group[0], def.group[1]);
    const fighters = [fighter(), ...Array.from({ length: count }, () => foe(def, rng))];
    let outcome: FightOutcome | null = null;
    for (let round = 0; round < 40 && outcome === null; round++) {
      fightRound(rng, fighters);
      outcome = fightOutcome(fighters);
    }
    results[outcome ?? 'fled']++;
  }
  return { won: results.won / fights, lost: results.lost / fights, fled: results.fled / fights };
}

const creature = (id: string) => CREATURES.find((c) => c.id === id)!;

describe('balance: an average adventurer against each creature (Monte Carlo)', () => {
  // These ranges are the design intent. If a content change moves a creature
  // out of its band, adjust the creature or, deliberately, the band.
  it.each([
    ['giant-rat', 0, 0.01],
    ['wolf', 0, 0.04],
    ['skeleton', 0, 0.04],
    ['zombie', 0, 0.05],
    ['infernal-imp', 0, 0.04],
    ['giant-spider', 0, 0.05],
    ['warg', 0.01, 0.08],
    ['hellhound', 0.03, 0.15],
    ['cave-bear', 0.03, 0.15],
  ])('%s kills the adventurer between %d and %d of the time', (id, min, max) => {
    const { lost } = odds(creature(id));
    expect(lost).toBeGreaterThanOrEqual(min);
    expect(lost).toBeLessThanOrEqual(max);
  });

  it('makes the deadliest creatures ones an adventurer usually runs from or loses to', () => {
    for (const id of ['cave-bear', 'hellhound']) expect(odds(creature(id)).won).toBeLessThan(0.5);
    expect(odds(creature('giant-rat')).won).toBeGreaterThan(0.9);
  });
});

describe('fightRound', () => {
  it('never takes hit points below zero, and marks the fallen', () => {
    const rng = createRng('floor');
    for (let n = 0; n < 500; n++) {
      const fighters = [
        fighter({ hp: 3, maxHp: 28, fleeBelow: 0 }),
        fighter({ side: 1, hp: 2, stamina: null }),
      ];
      fightRound(rng, fighters);
      for (const f of fighters) {
        expect(f.hp).toBeGreaterThanOrEqual(0);
        expect(f.out === 'dead').toBe(f.hp === 0);
      }
    }
  });

  it('only lets each fighter act once per round', () => {
    const rng = createRng('once');
    const fighters = [
      fighter(),
      fighter({ side: 1, stamina: null }),
      fighter({ side: 1, stamina: null }),
    ];
    const actions = fightRound(rng, fighters);
    const actors = actions.map((a) => (a.kind === 'attack' ? a.attacker : a.who));
    expect(new Set(actors).size).toBe(actors.length);
    expect(actors.length).toBeLessThanOrEqual(3);
  });

  it('spends stamina on attacks and never goes below zero', () => {
    const rng = createRng('stamina');
    const self = fighter({ stamina: 2, fleeBelow: 0, hp: 999, maxHp: 999 });
    const fighters = [self, fighter({ side: 1, hp: 999, maxHp: 999, stamina: null, fleeBelow: 0 })];
    for (let round = 0; round < 5; round++) fightRound(rng, fighters);
    expect(self.stamina).toBe(0);
  });

  it('tries to flee below the threshold instead of attacking', () => {
    const rng = createRng('flee');
    const fighters = [fighter({ hp: 5, fleeBelow: 0.5 }), fighter({ side: 1, stamina: null })];
    const actions = fightRound(rng, fighters);
    expect(actions.find((a) => a.kind === 'flee' || a.attacker === 0)?.kind).toBe('flee');
  });

  it('lets a quick fighter flee a slow one more often than the reverse', () => {
    const rate = (self: number, enemy: number, cornered: 0 | null = null) => {
      const rng = createRng(`flee-${self}-${enemy}`);
      let fled = 0;
      for (let n = 0; n < 2000; n++) {
        const fighters = [
          fighter({ hp: 1, fleeBelow: 0.5, agility: self }),
          fighter({ side: 1, agility: enemy, stamina: null, attack: -99 }),
        ];
        fightRound(rng, fighters, { cornered });
        if (fighters[0]!.out === 'fled') fled++;
      }
      return fled / 2000;
    };
    expect(rate(3, -2)).toBeGreaterThan(rate(-2, 3));
    // d20 + 0 >= FLEE_DIFFICULTY + 0 succeeds on 15 of 20 rolls with the current difficulty.
    expect(rate(0, 0)).toBeCloseTo((21 - FLEE_DIFFICULTY) / 20, 1);
    // A cornered side has a harder time of it.
    expect(rate(0, 0, 0)).toBeCloseTo((21 - FLEE_DIFFICULTY - CORNERED_PENALTY) / 20, 1);
  });
});

describe('fightWinner', () => {
  it('reports the result from the adventurer side', () => {
    const foe = (out: FighterState['out'] = null) => fighter({ side: 1, out });
    expect(fightOutcome([fighter(), foe('dead')])).toBe('won');
    expect(fightOutcome([fighter(), foe('fled')])).toBe('won');
    expect(fightOutcome([fighter({ out: 'dead' }), foe()])).toBe('lost');
    expect(fightOutcome([fighter({ out: 'fled' }), foe()])).toBe('fled');
    expect(fightOutcome([fighter(), foe('dead'), foe()])).toBeNull();
  });
});

describe('sides', () => {
  it('lets several fighters on each side fight it out until one side is left', () => {
    const rng = createRng('sides');
    for (let n = 0; n < 200; n++) {
      const fighters = [
        fighter(),
        fighter({ hp: 20, maxHp: 20 }),
        fighter({ side: 1, stamina: null }),
        fighter({ side: 1, stamina: null }),
      ];
      let rounds = 0;
      while (fightWinner(fighters) === null && rounds++ < 100) {
        for (const action of fightRound(rng, fighters)) {
          if (action.kind === 'attack') {
            expect(fighters[action.attacker]!.side).not.toBe(fighters[action.target]!.side);
          }
        }
      }
      expect(fightWinner(fighters)).not.toBeNull();
    }
  });

  it('skips fighters who spent the round casting', () => {
    const rng = createRng('idle');
    const fighters = [fighter(), fighter({ side: 1, stamina: null })];
    const actions = fightRound(rng, fighters, { idle: new Set([0]) });
    expect(actions.every((a) => (a.kind === 'attack' ? a.attacker : a.who) !== 0)).toBe(true);
  });
});
