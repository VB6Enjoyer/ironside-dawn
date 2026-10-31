import { SKILL_RANKS, SKILL_ROLE, SKILLS, type Role, type SkillId } from '../../content';
import type { SimContext } from '../context';
import type { Character, Deed, LocationId } from '../model';
import { gearTotals } from './items';
import { remember, satisfy } from './mind';

/**
 * Growth (ROADMAP.md Phase 3): experience and levels, skills that improve with
 * use, and the deeds a character is remembered for.
 */

export const BASE_HP = 18;
export const HP_PER_LEVEL = 3;
export const BASE_STAMINA = 6;
const MAX_DEEDS = 30;
const GLORY_PER_LEVEL = 0.25;
/** Skill gains shrink as proficiency grows: (1 - skill/100) to this power. */
const LEARNING_CURVE = 2;

/** Total experience needed to reach `level`: 100 for level 2, 2,800 for level 8. */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function gainXp(
  ctx: SimContext,
  character: Character,
  amount: number,
  locationId: LocationId,
): void {
  character.xp += amount;
  while (character.xp >= xpForLevel(character.level + 1)) {
    character.level++;
    refreshMaxima(character);
    addDeed(character, { kind: 'level', at: ctx.world.time, level: character.level });
    remember(character, ctx.world.time, { kind: 'level', level: character.level }, 0.5);
    satisfy(character, 'glory', GLORY_PER_LEVEL);
    ctx.emit(
      {
        type: 'character.levelup',
        data: { characterId: character.id, locationId, level: character.level },
      },
      [character.id],
      locationId,
    );
  }
}

/**
 * Practice makes better: raises a skill by `amount`, less the more skilled the
 * character already is, more for quick wits. Announces new ranks.
 */
export function practice(
  ctx: SimContext,
  character: Character,
  skill: SkillId,
  amount: number,
  locationId: LocationId,
): void {
  const before = character.skills[skill];
  const wits = Math.floor((character.stats.wits - 10) / 2);
  const gain = amount * (1 + 0.08 * wits) * (1 - before / 100) ** LEARNING_CURVE;
  const after = Math.min(100, before + gain);
  character.skills[skill] = after;

  const rank = SKILL_RANKS.findLast((r) => before < r.at && after >= r.at);
  if (rank) {
    addDeed(character, { kind: 'rank', at: ctx.world.time, skill, rank: rank.name });
    ctx.emit(
      {
        type: 'character.skill',
        data: { characterId: character.id, locationId, skill, rank: rank.name },
      },
      [character.id],
      locationId,
    );
  }
}

/** Proficiency including what worn gear adds. */
export function effectiveSkill(character: Character, skill: SkillId): number {
  return character.skills[skill] + (gearTotals(character).skills[skill] ?? 0);
}

/** +1 per 10 points of proficiency. */
export function skillBonus(character: Character, skill: SkillId): number {
  return Math.floor(effectiveSkill(character, skill) / 10);
}

/** Level bonuses to hit and to defense. */
export function levelAttackBonus(character: Character): number {
  return Math.floor((character.level - 1) / 3);
}

export function levelDefenseBonus(character: Character): number {
  return Math.floor((character.level - 1) / 4);
}

/**
 * Recomputes maximum hit points and stamina from toughness, level and gear.
 * Gains are added to current values; losses only cap them.
 */
export function refreshMaxima(character: Character): void {
  const gear = gearTotals(character);
  const toughness = character.stats.toughness + (gear.stats.toughness ?? 0);
  const might = character.stats.might + (gear.stats.might ?? 0);
  const maxHp = BASE_HP + toughness + HP_PER_LEVEL * (character.level - 1) + gear.maxHp;
  const maxStamina =
    BASE_STAMINA +
    Math.round((toughness + might) / 2) +
    Math.floor((character.level - 1) / 2) +
    gear.maxStamina;

  character.hp = Math.min(maxHp, character.hp + Math.max(0, maxHp - character.maxHp));
  character.stamina = Math.min(
    maxStamina,
    character.stamina + Math.max(0, maxStamina - character.maxStamina),
  );
  character.maxHp = maxHp;
  character.maxStamina = maxStamina;
}

/** What the character's best skill makes them: fighter, scout or mystic. */
export function roleOf(character: Character): Role {
  let best: SkillId = 'blades';
  for (const skill of SKILLS) if (character.skills[skill] > character.skills[best]) best = skill;
  return SKILL_ROLE[best];
}

export function addDeed(character: Character, deed: Deed): void {
  character.deeds.push(deed);
  if (character.deeds.length > MAX_DEEDS)
    character.deeds.splice(0, character.deeds.length - MAX_DEEDS);
}
