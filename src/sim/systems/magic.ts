import { creatureDef, SPELLS, spellDef, type SpellDef, type SpellId } from '../../content';
import { HOUR, MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Encounter, EventOfType, LocationId } from '../model';
import { WOUNDED_BELOW } from './combat-core';
import { isDizzy, isDrained, modifier } from './condition';
import { die } from './death';
import { averageRoll } from './items';
import { remember } from './mind';
import { addDeed, effectiveSkill, gainXp, practice } from './progress';

/**
 * Magic (WORLD.md §4): a high-risk, high-reward tool. Every spell costs the
 * caster something, and the roll can succeed, half-work, fail, or backlash.
 */

type Outcome = EventOfType<'magic.cast'>['data']['outcome'];

/** A partial success comes within this much of the difficulty. */
const PARTIAL_MARGIN = 4;
/** Natural rolls up to this backlash; dizziness and drain widen the band. */
const BACKLASH_BAND = 1;
const DIZZY_BACKLASH = 2;
const DRAINED_BACKLASH = 2;
const BACKLASH_DAMAGE = '1d6';
/** Mastery shrinks costs down to this fraction. */
const MIN_COST_FACTOR = 0.4;
const ARCANA_PER_CAST = 0.3;

export function castingBonus(character: Character, now: number): number {
  return (
    Math.floor(effectiveSkill(character, 'arcana') / 10) +
    modifier(character, 'spirit') +
    (character.gifted ? 1 : 0) -
    (isDizzy(character, now) ? 3 : 0) -
    (isDrained(character, now) ? 2 : 0) -
    (character.hp < character.maxHp * WOUNDED_BELOW ? 1 : 0)
  );
}

/** Chance that the casting roll reaches the spell's difficulty. */
export function successChance(character: Character, spell: SpellDef, now: number): number {
  const needed = spell.difficulty - castingBonus(character, now);
  return Math.min(0.95, Math.max(0.05, (21 - needed) / 20));
}

/** What casting costs this character now: skilled mages pay less. */
export function costsFor(character: Character, spell: SpellDef) {
  const factor = Math.max(MIN_COST_FACTOR, 1 - effectiveSkill(character, 'arcana') / 150);
  const { stamina = 0, health = 0, drain, dizzy = 0 } = spell.costs;
  return {
    stamina: Math.ceil(stamina * factor),
    health: Math.ceil(health * factor),
    drain: drain ? { ...drain, hours: drain.hours * factor } : null,
    dizzyMinutes: Math.round(dizzy * factor),
  };
}

export interface CastResult {
  readonly outcome: Outcome;
  readonly amount: number;
  /** The caster died of it. */
  readonly fatal: boolean;
}

/**
 * Casts a spell: rolls, pays the costs (double on a backlash, plus a burn),
 * and returns how strong the effect was. The caller applies the effect.
 */
export function cast(
  ctx: SimContext,
  character: Character,
  spellId: SpellId,
  locationId: LocationId,
  encounter: Encounter | null,
  targetIndex: number | null,
): CastResult {
  const rng = ctx.rng.magic;
  const now = ctx.world.time;
  const spell = spellDef(spellId);

  const roll = rng.int(1, 20);
  const band =
    BACKLASH_BAND +
    (isDizzy(character, now) ? DIZZY_BACKLASH : 0) +
    (isDrained(character, now) ? DRAINED_BACKLASH : 0);
  const total = roll + castingBonus(character, now);
  const outcome: Outcome =
    roll <= band
      ? 'backlash'
      : total >= spell.difficulty
        ? 'success'
        : total >= spell.difficulty - PARTIAL_MARGIN
          ? 'partial'
          : 'failure';

  // Costs are paid whatever happens; a backlash doubles them and burns.
  const costs = costsFor(character, spell);
  const multiplier = outcome === 'backlash' ? 2 : 1;
  const health =
    costs.health * multiplier + (outcome === 'backlash' ? rng.roll(BACKLASH_DAMAGE) : 0);
  const stamina = Math.min(character.stamina, costs.stamina * multiplier);
  character.stamina -= stamina;
  character.hp = Math.max(0, character.hp - health);
  if (costs.drain) {
    character.statuses.push({
      kind: 'drained',
      stat: costs.drain.stat,
      amount: costs.drain.amount * multiplier,
      until: now + Math.round(costs.drain.hours * HOUR),
    });
  }
  const dizzy = costs.dizzyMinutes > 0 || outcome === 'backlash';
  if (dizzy) {
    const minutes = Math.max(costs.dizzyMinutes, 10) * multiplier;
    character.statuses.push({ kind: 'dizzy', until: now + minutes * MINUTE });
  }

  let amount = 0;
  if (outcome === 'success' || outcome === 'partial') {
    const effect = spell.effect;
    const bonus = Math.floor(effectiveSkill(character, 'arcana') / 15);
    if (effect.kind !== 'quicken') {
      amount = rng.roll(effect.dice) + bonus;
      if (outcome === 'partial') amount = Math.ceil(amount / 2);
    } else {
      amount = outcome === 'partial' ? 1 : 2;
    }
  }

  practice(ctx, character, 'arcana', ARCANA_PER_CAST, locationId);
  if (outcome === 'success') gainXp(ctx, character, 2, locationId);

  const target = targetIndex !== null && encounter ? encounter.foes[targetIndex]!.ref : null;
  ctx.emit(
    {
      type: 'magic.cast',
      data: {
        characterId: character.id,
        locationId,
        spell: spellId,
        outcome,
        target,
        amount,
        paid: { stamina, health, drained: costs.drain?.stat ?? null, dizzy },
      },
    },
    [character.id],
    locationId,
  );

  if (outcome === 'backlash') {
    remember(character, now, { kind: 'backlash', locationId, spell: spellId }, 0.7);
  }
  const fatal = character.hp <= 0;
  if (fatal) die(ctx, character, { kind: 'magic', spell: spellId });
  return { outcome, amount, fatal };
}

/** Learns any spell the character's arcana now allows. Only the gifted or the studied learn. */
export function learnSpells(ctx: SimContext, character: Character, locationId: LocationId): void {
  for (const spell of SPELLS) {
    if (character.spells.includes(spell.id)) continue;
    if (character.skills.arcana < spell.arcana) continue;
    character.spells.push(spell.id);
    addDeed(character, { kind: 'spell', at: ctx.world.time, spell: spell.id });
    ctx.emit(
      { type: 'magic.learn', data: { characterId: character.id, locationId, spell: spell.id } },
      [character.id],
      locationId,
    );
  }
}

/** Spells a character could cast right now without the cost alone killing or felling them. */
function affordable(character: Character, spell: SpellDef): boolean {
  const costs = costsFor(character, spell);
  return character.stamina >= costs.stamina + 1 && character.hp > costs.health + 3;
}

export interface SpellChoice {
  readonly spell: SpellId;
  /** The foe to target, for damage spells. */
  readonly target: number | null;
}

/** What a plain swing of the weapon is worth, against which spells are weighed. */
const SWING_VALUE = 0.25;
const SPELL_NOISE = 0.1;

/**
 * Utility choice of spell (ROADMAP.md Phase 4): each affordable spell is
 * worth its odds times what it would do now (healing matters more the more
 * hurt; wards and quickening against a frightening fight; bolts to finish the
 * weak), minus its costs and the risk of backlash. The brave weigh that risk
 * less. Cast if the best spell beats a plain swing.
 */
export function chooseSpell(
  ctx: SimContext,
  character: Character,
  encounter: Encounter,
): SpellChoice | null {
  if (character.spells.length === 0) return null;
  const rng = ctx.rng.magic;
  const now = ctx.world.time;
  const standing = encounter.foes
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.fighter.out === null);
  if (standing.length === 0) return null;

  const hpFraction = character.hp / character.maxHp;
  const threat = standing.reduce((sum, { f }) => sum + creatureDef(f.ref.species).level, 0);
  const weakest = standing.reduce((a, b) => (b.f.fighter.hp < a.f.fighter.hp ? b : a));
  const riskWeight = 1.5 - character.traits.bravery;
  const backlashOdds =
    (1 + (isDizzy(character, now) ? 2 : 0) + (isDrained(character, now) ? 2 : 0)) / 20;

  let best: { choice: SpellChoice; value: number } | null = null;
  for (const spell of character.spells.map(spellDef)) {
    if (!affordable(character, spell)) continue;
    const odds = successChance(character, spell, now);
    let benefit = 0;
    let target: number | null = null;
    switch (spell.effect.kind) {
      case 'heal':
        benefit = 2 * (1 - hpFraction) ** 2;
        break;
      case 'damage':
        benefit = Math.min(1, averageRoll(spell.effect.dice) / Math.max(1, weakest.f.fighter.hp));
        target = weakest.i;
        break;
      case 'ward':
        benefit = encounter.ward === 0 ? 0.25 * threat * (encounter.round === 0 ? 1 : 0.5) : 0;
        break;
      case 'quicken':
        benefit = encounter.quickened ? 0 : 0.2 * threat * (encounter.round === 0 ? 1 : 0.4);
        break;
    }
    const costs = costsFor(character, spell);
    const cost =
      (2 * costs.health) / Math.max(1, character.hp) +
      (0.5 * costs.stamina) / Math.max(1, character.stamina) +
      1.5 * backlashOdds;
    const value = odds * benefit - cost * riskWeight + rng.gaussian(0, SPELL_NOISE);
    if (!best || value > best.value)
      best = { choice: { spell: spell.id as SpellId, target }, value };
  }
  return best && best.value > SWING_VALUE ? best.choice : null;
}
