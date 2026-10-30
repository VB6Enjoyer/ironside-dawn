import { weaponDef, type StatId } from '../../content';
import { HOUR } from '../core/time';
import type { Character, FighterState } from '../model';
import { WOUNDED_BELOW } from './combat-core';

/**
 * A character's body: modifiers, conditions, fitness, and healing.
 * Wounded and exhausted are derived from hit points and stamina; timed
 * conditions such as dizziness are stored (ROADMAP.md Phase 2).
 */

export type Condition = 'wounded' | 'exhausted' | 'dizzy';

const DIZZY_ATTACK_PENALTY = 2;
const DIZZY_DEFENSE_PENALTY = 2;
/** Adventurers wear armor and are trained fighters, unlike the beasts they meet. */
const BASE_DEFENSE = 14;
const BASE_ATTACK = 4;

/** The usual d20 modifier: 10 is average, each 2 points is ±1. */
export function modifier(character: Character, stat: StatId): number {
  return Math.floor((character.stats[stat] - 10) / 2);
}

export function isAlive(character: Character): boolean {
  return character.death === null;
}

export function conditionsOf(character: Character, now: number): Condition[] {
  const conditions: Condition[] = [];
  if (character.hp < character.maxHp * WOUNDED_BELOW) conditions.push('wounded');
  if (character.stamina <= 0) conditions.push('exhausted');
  if (isDizzy(character, now)) conditions.push('dizzy');
  return conditions;
}

export function isDizzy(character: Character, now: number): boolean {
  return character.statuses.some((s) => s.kind === 'dizzy' && s.until > now);
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
  return 0.25 + 0.35 * (1 - character.bravery);
}

/** Below this fraction of hit points, a character stops delving deeper. */
export function retreatThreshold(character: Character): number {
  return 0.45 + 0.3 * (1 - character.bravery);
}

/** Each foe beyond the first makes a character this much quicker to flee. */
const OUTNUMBERED_FLEE_BONUS = 0.1;
const MAX_FLEE_THRESHOLD = 0.8;

export function adventurerFighter(
  character: Character,
  now: number,
  foesStanding: number,
): FighterState {
  const weapon = weaponDef(character.weapon);
  const dizzy = isDizzy(character, now);
  return {
    attack:
      BASE_ATTACK +
      Math.max(modifier(character, 'might'), modifier(character, 'agility')) +
      weapon.accuracy -
      (dizzy ? DIZZY_ATTACK_PENALTY : 0),
    damage: weapon.damage,
    damageBonus: modifier(character, 'might'),
    defense: BASE_DEFENSE + modifier(character, 'agility') - (dizzy ? DIZZY_DEFENSE_PENALTY : 0),
    agility: modifier(character, 'agility'),
    fleeBelow: Math.min(
      MAX_FLEE_THRESHOLD,
      fleeThreshold(character) + OUTNUMBERED_FLEE_BONUS * Math.max(0, foesStanding - 1),
    ),
    hp: character.hp,
    maxHp: character.maxHp,
    stamina: character.stamina,
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
