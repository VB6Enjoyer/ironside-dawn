/**
 * Skills improve with use (ROADMAP.md Phase 3). Proficiency runs from 0 to
 * 100; every 10 points is +1 on the rolls the skill helps with.
 */
export const SKILLS = [
  'blades',
  'axes',
  'blunt',
  'polearms',
  'stealth',
  'lockpicking',
  'awareness',
  'arcana',
] as const;
export type SkillId = (typeof SKILLS)[number];

export type WeaponSkill = Extract<SkillId, 'blades' | 'axes' | 'blunt' | 'polearms'>;

/** What a character's best skills make them, as others would describe them. */
export type Role = 'fighter' | 'scout' | 'mystic';

export const SKILL_ROLE: Record<SkillId, Role> = {
  blades: 'fighter',
  axes: 'fighter',
  blunt: 'fighter',
  polearms: 'fighter',
  stealth: 'scout',
  lockpicking: 'scout',
  awareness: 'scout',
  arcana: 'mystic',
};

/** Skill ranks, for milestones and display. */
export const SKILL_RANKS = [
  { at: 20, name: 'apprentice' },
  { at: 40, name: 'journeyman' },
  { at: 60, name: 'expert' },
  { at: 80, name: 'master' },
] as const;
