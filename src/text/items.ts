import {
  itemAffixDef,
  itemBase,
  materialDef,
  spellDef,
  type SkillId,
  type SpellId,
} from '../content';
import type { Item } from '../sim';
import { article } from './words';

/**
 * Item names: "keen steel longsword of the Ember", "silver ring of Vigor".
 * Plain iron is left unsaid. Legendary items go by their own name.
 */
export function itemName(item: Item): string {
  if (item.uniqueName) return item.uniqueName;
  return plainName(item);
}

/** With an article, or bare for legendary items: "a keen axe", "Duskblade". */
export function anItem(item: Item): string {
  if (item.uniqueName) return item.uniqueName;
  const name = plainName(item);
  return `${article(name)} ${name}`;
}

/** "Duskblade, a legendary dwarven-steel longsword of the Ember". */
export function legendTitle(item: Item): string {
  return `${item.uniqueName}, a legendary ${plainName(item)}`;
}

function plainName(item: Item): string {
  const prefixes = item.affixes.map(itemAffixDef).filter((a) => a.position === 'prefix');
  const suffixes = item.affixes.map(itemAffixDef).filter((a) => a.position === 'suffix');
  const material =
    item.material && item.material !== 'iron' ? materialDef(item.material).name : null;
  return [
    ...prefixes.map((a) => a.name),
    material,
    itemBase(item.base).name,
    ...suffixes.map((a) => a.name),
  ]
    .filter(Boolean)
    .join(' ');
}

export function spellName(id: SpellId): string {
  return spellDef(id).name;
}

/** "with blades", "at picking locks": how a skill reads after a rank. */
export const SKILL_PHRASES: Record<SkillId, string> = {
  blades: 'with blades',
  axes: 'with axes',
  blunt: 'with hammers and maces',
  polearms: 'with spears',
  stealth: 'at moving unseen',
  lockpicking: 'at picking locks',
  awareness: 'at spotting danger',
  arcana: 'in the arcane arts',
};

export const SKILL_NAMES: Record<SkillId, string> = {
  blades: 'Blades',
  axes: 'Axes',
  blunt: 'Blunt weapons',
  polearms: 'Polearms',
  stealth: 'Stealth',
  lockpicking: 'Lockpicking',
  awareness: 'Awareness',
  arcana: 'Arcana',
};
