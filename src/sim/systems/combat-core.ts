import type { Rng } from '../core/rng';
import type { FighterState } from '../model';

/**
 * Pure combat rules: one round of a fight between an adventurer (index 0) and
 * one or more foes. No world access, so balance can be tested by running
 * thousands of fights directly (ROADMAP.md Phase 2).
 */

/** Below this fraction of hit points a fighter is wounded: -1 to hit. */
export const WOUNDED_BELOW = 0.4;
const WOUNDED_PENALTY = 1;
/** A fighter with no stamina left is exhausted: -2 to hit, -1 defense. */
const EXHAUSTED_ATTACK_PENALTY = 2;
const EXHAUSTED_DEFENSE_PENALTY = 1;
/** Fleeing succeeds on d20 + agility >= this + the fastest enemy's agility. */
export const FLEE_DIFFICULTY = 6;

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

export type FightOutcome = 'won' | 'lost' | 'fled';

/**
 * Everyone still standing acts once, in initiative order (d20 + agility,
 * rolled each round). A fighter below its flee threshold tries to run instead
 * of attacking; a failed attempt costs the turn.
 */
export function fightRound(
  rng: Rng,
  fighters: FighterState[],
  { adventurerActs = true }: { adventurerActs?: boolean } = {},
): FightAction[] {
  const order = fighters
    .map((fighter, index) => ({ index, fighter }))
    .filter(({ fighter }) => fighter.out === null)
    .map(({ index, fighter }) => ({ index, initiative: rng.int(1, 20) + fighter.agility }))
    .sort((a, b) => b.initiative - a.initiative || a.index - b.index);

  const actions: FightAction[] = [];
  for (const { index } of order) {
    const self = fighters[index]!;
    if (self.out !== null) continue;
    // The adventurer may have spent this round casting a spell instead.
    if (index === 0 && !adventurerActs) continue;
    const enemies = enemiesOf(fighters, index);
    if (enemies.length === 0) break;

    if (self.hp < self.maxHp * self.fleeBelow) {
      const fastest = Math.max(...enemies.map((i) => fighters[i]!.agility));
      const success = rng.int(1, 20) + self.agility >= FLEE_DIFFICULTY + fastest;
      if (success) self.out = 'fled';
      actions.push({ kind: 'flee', who: index, success });
      continue;
    }

    const target = index === 0 ? rng.pick(enemies) : 0;
    actions.push(attack(rng, index, self, target, fighters[target]!));
  }
  return actions;
}

/** The result from the adventurer's side, or null if the fight goes on. */
export function fightOutcome(fighters: readonly FighterState[]): FightOutcome | null {
  const adventurer = fighters[0]!;
  if (adventurer.out === 'dead') return 'lost';
  if (adventurer.out === 'fled') return 'fled';
  return enemiesOf(fighters, 0).length === 0 ? 'won' : null;
}

function enemiesOf(fighters: readonly FighterState[], index: number): number[] {
  if (index !== 0) return fighters[0]!.out === null ? [0] : [];
  const enemies: number[] = [];
  for (let i = 1; i < fighters.length; i++) if (fighters[i]!.out === null) enemies.push(i);
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
