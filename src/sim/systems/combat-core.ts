import type { Rng } from '../core/rng';
import type { FighterState, Side } from '../model';

/**
 * Pure combat rules: one round of a fight between two sides, each any mix of
 * characters and creatures. No world access, so balance can be tested by
 * running thousands of fights directly (ROADMAP.md Phase 2).
 */

/** Below this fraction of hit points a fighter is wounded: -1 to hit. */
export const WOUNDED_BELOW = 0.4;
const WOUNDED_PENALTY = 1;
/** A fighter with no stamina left is exhausted: -2 to hit, -1 defense. */
const EXHAUSTED_ATTACK_PENALTY = 2;
const EXHAUSTED_DEFENSE_PENALTY = 1;
/** Fleeing succeeds on d20 + agility >= this + the fastest enemy's agility. */
export const FLEE_DIFFICULTY = 6;
/** Extra difficulty for a cornered side: hunters come ready to cut off escape. */
export const CORNERED_PENALTY = 5;

export type FightAction =
  | {
      readonly kind: 'attack';
      readonly attacker: number;
      readonly target: number;
      readonly hit: boolean;
      readonly critical: boolean;
      readonly damage: number;
      /** Damage soaked up by the target's ward. */
      readonly absorbed: number;
      readonly targetHp: number;
    }
  | { readonly kind: 'flee'; readonly who: number; readonly success: boolean };

/**
 * Everyone still standing acts once, in initiative order (d20 + agility,
 * rolled each round), attacking a random enemy. A fighter below its flee
 * threshold tries to run instead; a failed attempt costs the turn. Fighters
 * in `idle` (casting a spell this round) don't act. A `cornered` side finds
 * running harder.
 */
export function fightRound(
  rng: Rng,
  fighters: FighterState[],
  {
    idle = new Set<number>(),
    cornered = null,
  }: { idle?: ReadonlySet<number>; cornered?: Side | null } = {},
): FightAction[] {
  const order = fighters
    .map((fighter, index) => ({ index, fighter }))
    .filter(({ fighter }) => fighter.out === null)
    .map(({ index, fighter }) => ({ index, initiative: rng.int(1, 20) + fighter.agility }))
    .sort((a, b) => b.initiative - a.initiative || a.index - b.index);

  const actions: FightAction[] = [];
  for (const { index } of order) {
    const self = fighters[index]!;
    if (self.out !== null || idle.has(index)) continue;
    const enemies = enemiesOf(fighters, self.side);
    if (enemies.length === 0) break;

    if (self.hp < self.maxHp * self.fleeBelow) {
      const fastest = Math.max(...enemies.map((i) => fighters[i]!.agility));
      const difficulty = FLEE_DIFFICULTY + (self.side === cornered ? CORNERED_PENALTY : 0);
      const success = rng.int(1, 20) + self.agility >= difficulty + fastest;
      if (success) self.out = 'fled';
      actions.push({ kind: 'flee', who: index, success });
      continue;
    }

    const target = rng.pick(enemies);
    actions.push(attack(rng, index, self, target, fighters[target]!));
  }
  return actions;
}

/** The side still standing once the other has none left, 'none' if neither, or null if both fight on. */
export function fightWinner(fighters: readonly FighterState[]): Side | 'none' | null {
  const zero = standing(fighters, 0) > 0;
  const one = standing(fighters, 1) > 0;
  if (zero && one) return null;
  return zero ? 0 : one ? 1 : 'none';
}

export function standing(fighters: readonly FighterState[], side: Side): number {
  let count = 0;
  for (const f of fighters) if (f.side === side && f.out === null) count++;
  return count;
}

function enemiesOf(fighters: readonly FighterState[], side: Side): number[] {
  const enemies: number[] = [];
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i]!;
    if (f.side !== side && f.out === null) enemies.push(i);
  }
  return enemies;
}

function attack(
  rng: Rng,
  attackerIndex: number,
  attacker: FighterState,
  targetIndex: number,
  target: FighterState,
): FightAction {
  let toHit = attacker.attack;
  if (attacker.stamina !== null) {
    if (attacker.stamina > 0) attacker.stamina = Math.max(0, attacker.stamina - 1);
    else toHit -= EXHAUSTED_ATTACK_PENALTY;
  }
  if (attacker.hp < attacker.maxHp * WOUNDED_BELOW) toHit -= WOUNDED_PENALTY;

  let defense = target.defense;
  if (target.stamina !== null && target.stamina <= 0) defense -= EXHAUSTED_DEFENSE_PENALTY;

  const die = rng.int(1, 20);
  const critical = die === 20;
  const hit = critical || (die !== 1 && die + toHit >= defense);

  let damage = 0;
  let absorbed = 0;
  if (hit) {
    const dice = rng.roll(attacker.damage) + (critical ? rng.roll(attacker.damage) : 0);
    damage = Math.max(1, dice + attacker.damageBonus);
    absorbed = Math.min(target.ward, damage);
    target.ward -= absorbed;
    target.hp = Math.max(0, target.hp - (damage - absorbed));
    if (target.hp === 0) target.out = 'dead';
  }
  return {
    kind: 'attack',
    attacker: attackerIndex,
    target: targetIndex,
    hit,
    critical,
    damage,
    absorbed,
    targetHp: target.hp,
  };
}
