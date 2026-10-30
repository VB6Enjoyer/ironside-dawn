import { creatureDef, SPELLS, spellDef, type SpellDef, type SpellId } from '../../content';
import { HOUR, MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type { Character, Encounter, EventOfType, LocationId } from '../model';
import { WOUNDED_BELOW } from './combat-core';
import { isDizzy, isDrained, modifier } from './condition';
import { die } from './death';
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
const ARCANA_PER_CAST = 0.6;

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

/**
 * "Cast if the odds are good" (ROADMAP.md Phase 3), until Phase 4's utility
 * AI: heal when hurt, ward and quicken against a frightening fight, throw
 * bolts when likely to land. A brave character near death gambles on any spell.
 */
export function chooseSpell(
  ctx: SimContext,
  character: Character,
  encounter: Encounter,
): SpellChoice | null {
  if (character.spells.length === 0) return null;
  const rng = ctx.rng.magic;
  const now = ctx.world.time;
  const known = character.spells.map(spellDef).filter((s) => affordable(character, s));
  const odds = (spell: SpellDef) => successChance(character, spell, now);
  const hpFraction = character.hp / character.maxHp;
  const standing = encounter.foes
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.fighter.out === null);
  if (standing.length === 0) return null;
  const threat = standing.reduce((sum, { f }) => sum + creatureDef(f.ref.species).level, 0);
  const weakest = standing.reduce((a, b) => (b.f.fighter.hp < a.f.fighter.hp ? b : a)).i;
  const find = (kind: SpellDef['effect']['kind']) => known.find((s) => s.effect.kind === kind);

  const heal = find('heal');
  if (heal && hpFraction < 0.45 && odds(heal) >= 0.45)
    return { spell: heal.id as SpellId, target: null };

  if (encounter.round === 0 && threat >= 3) {
    const ward = find('ward');
    if (ward && encounter.ward === 0 && odds(ward) >= 0.5)
      return { spell: ward.id as SpellId, target: null };
    const quicken = find('quicken');
    if (quicken && !encounter.quickened && odds(quicken) >= 0.5) {
      return { spell: quicken.id as SpellId, target: null };
    }
  }

  const bolt = find('damage');
  if (bolt && odds(bolt) >= 0.55 && rng.chance(0.6))
    return { spell: bolt.id as SpellId, target: weakest };

  // The gamble: brave and nearly dead, cast whatever might turn it around.
  if (hpFraction < 0.25 && character.bravery > 0.6) {
    const desperate = heal ?? bolt;
    if (desperate) {
      return {
        spell: desperate.id as SpellId,
        target: desperate.effect.kind === 'damage' ? weakest : null,
      };
    }
  }
  return null;
}
