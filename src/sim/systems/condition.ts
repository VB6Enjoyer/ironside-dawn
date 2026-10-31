import { itemBase, type StatId } from '../../content';
import { HOUR } from '../core/time';
import type { Character, Encounter, FighterState } from '../model';
import { WOUNDED_BELOW } from './combat-core';
import { gearTotals } from './items';
import { levelAttackBonus, levelDefenseBonus, skillBonus } from './progress';

/**
 * A character's body: modifiers, conditions, fitness, and healing.
 * Wounded and exhausted are derived from hit points and stamina; timed
 * conditions such as dizziness and drained attributes are stored.
 */

export type Condition = 'wounded' | 'exhausted' | 'dizzy' | 'drained';

const DIZZY_ATTACK_PENALTY = 2;
const DIZZY_DEFENSE_PENALTY = 2;
/** Without armor. Adventurers start with some (padded, leather or scale). */
const BASE_DEFENSE = 11;
const BASE_ATTACK = 2;

/** An attribute including gear and any drain. */
export function statValue(character: Character, stat: StatId): number {
  const drained = character.statuses.reduce(
    (total, s) => total + (s.kind === 'drained' && s.stat === stat ? s.amount : 0),
    0,
  );
  return character.stats[stat] + (gearTotals(character).stats[stat] ?? 0) - drained;
}

/** The usual d20 modifier: 10 is average, each 2 points is ±1. */
export function modifier(character: Character, stat: StatId): number {
  return Math.floor((statValue(character, stat) - 10) / 2);
}

export function isAlive(character: Character): boolean {
  return character.death === null;
}

export function conditionsOf(character: Character, now: number): Condition[] {
  const conditions: Condition[] = [];
  if (character.hp < character.maxHp * WOUNDED_BELOW) conditions.push('wounded');
  if (character.stamina <= 0) conditions.push('exhausted');
  if (isDizzy(character, now)) conditions.push('dizzy');
  if (isDrained(character, now)) conditions.push('drained');
  return conditions;
}

export function isDizzy(character: Character, now: number): boolean {
  return character.statuses.some((s) => s.kind === 'dizzy' && s.until > now);
}

export function isDrained(character: Character, now: number): boolean {
  return character.statuses.some((s) => s.kind === 'drained' && s.until > now);
}

export function expireStatuses(character: Character, now: number): void {
  character.statuses = character.statuses.filter((s) => s.until > now);
}

/** Healthy enough to go into a dungeon. */
export function isFitToDelve(character: Character, now: number): boolean {
  return (
    character.hp >= character.maxHp * 0.85 &&
    character.stamina >= character.maxStamina * 0.6 &&
    !isDizzy(character, now)
  );
}

/** Should rest in town before setting out again. A little above "fit", so a rested character arrives fit. */
export function needsRecovery(character: Character): boolean {
  return character.hp < character.maxHp * 0.9 || character.stamina < character.maxStamina * 0.7;
}

/** Below this fraction of hit points, a character tries to flee a fight. Braver ones hold on longer. */
export function fleeThreshold(character: Character): number {
  return 0.25 + 0.35 * (1 - character.traits.bravery);
}

/** Below this fraction of hit points, a character stops delving deeper. */
export function retreatThreshold(character: Character): number {
  return 0.45 + 0.3 * (1 - character.traits.bravery);
}

/** Each foe beyond the first makes a character this much quicker to flee. */
const OUTNUMBERED_FLEE_BONUS = 0.1;
const MAX_FLEE_THRESHOLD = 0.8;

export function adventurerFighter(
  character: Character,
  now: number,
  encounter: Encounter,
): FighterState {
  const gear = gearTotals(character);
  const weapon = itemBase(character.equipment.weapon.base);
  const dizzy = isDizzy(character, now);
  const quickened = encounter.quickened;
  const foesStanding = encounter.foes.filter((f) => f.fighter.out === null).length;
  const weaponSkill = weapon.slot === 'weapon' ? skillBonus(character, weapon.skill) : 0;
  return {
    attack:
      BASE_ATTACK +
      weaponSkill +
      levelAttackBonus(character) +
      Math.max(modifier(character, 'might'), modifier(character, 'agility')) +
      gear.attack +
      (quickened?.attack ?? 0) -
      (dizzy ? DIZZY_ATTACK_PENALTY : 0),
    damage: weapon.slot === 'weapon' ? weapon.damage : '1d3',
    damageBonus: modifier(character, 'might') + gear.damage,
    defense:
      BASE_DEFENSE +
      modifier(character, 'agility') +
      levelDefenseBonus(character) +
      gear.defense +
      (quickened?.defense ?? 0) -
      (dizzy ? DIZZY_DEFENSE_PENALTY : 0),
    agility: modifier(character, 'agility'),
    fleeBelow: Math.min(
      MAX_FLEE_THRESHOLD,
      fleeThreshold(character) + OUTNUMBERED_FLEE_BONUS * Math.max(0, foesStanding - 1),
    ),
    hp: character.hp,
    maxHp: character.maxHp,
    stamina: character.stamina,
    ward: encounter.ward,
    out: null,
  };
}

/** How well a place lets a character recover, per hour. */
export type RecoveryPlace = 'inn' | 'rough' | 'convalescing' | 'town' | 'field';

const HP_PER_HOUR: Record<RecoveryPlace, number> = {
  inn: 1.5,
  convalescing: 1.5,
  rough: 0.6,
  town: 0.4,
  field: 0.2,
};
/** Fraction of max stamina regained per hour. */
const STAMINA_PER_HOUR: Record<RecoveryPlace, number> = {
  inn: 1 / 7,
  convalescing: 1 / 6,
  rough: 1 / 10,
  town: 1 / 8,
  field: 1 / 10,
};

export function recover(character: Character, place: RecoveryPlace, seconds: number): void {
  const hours = seconds / HOUR;
  const toughness = 1 + 0.15 * modifier(character, 'toughness');
  character.hp = Math.min(character.maxHp, character.hp + hours * HP_PER_HOUR[place] * toughness);
  character.stamina = Math.min(
    character.maxStamina,
    character.stamina + hours * STAMINA_PER_HOUR[place] * character.maxStamina,
  );
}

/** Whole hours of convalescing needed to stop needing recovery, between 2 and 12. */
export function convalescenceHours(character: Character): number {
  const toughness = 1 + 0.15 * modifier(character, 'toughness');
  const hpHours = (character.maxHp * 0.95 - character.hp) / (HP_PER_HOUR.convalescing * toughness);
  const staminaHours =
    (character.maxStamina * 0.8 - character.stamina) /
    (STAMINA_PER_HOUR.convalescing * character.maxStamina);
  return Math.min(12, Math.max(2, Math.ceil(Math.max(hpHours, staminaHours))));
}
