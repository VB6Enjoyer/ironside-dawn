import { affixDef, creatureDef, lootDef, type LootId, type TrapId } from '../content';
import type { CreatureRef, LootItem } from '../sim';

const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "a" or "an", by the sound of the next word (good enough for our vocabulary). */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "and"-joined list: "a, b and c". */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function creatureBase(ref: CreatureRef): string {
  const name = creatureDef(ref.species).name;
  return ref.affix ? `${affixDef(ref.affix).name} ${name}` : name;
}

/** "the skeleton", "the second skeleton", "the enraged warg". */
export function theCreature(ref: CreatureRef): string {
  const ordinal = ref.ordinal > 0 ? `${ORDINALS[ref.ordinal] ?? `number ${ref.ordinal}`} ` : '';
  return `the ${ordinal}${creatureBase(ref)}`;
}

/** "a skeleton", "an enraged warg". */
export function aCreature(ref: CreatureRef): string {
  const base = creatureBase(ref);
  return `${article(base)} ${base}`;
}

/** "two skeletons", "an enraged warg and a warg". */
export function creatureGroup(refs: readonly CreatureRef[]): string {
  const groups = new Map<string, { ref: CreatureRef; count: number }>();
  for (const ref of refs) {
    const key = `${ref.species}/${ref.affix ?? ''}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ref, count: 1 });
  }
  return listOf(
    [...groups.values()].map(({ ref, count }) => {
      if (count === 1) return aCreature(ref);
      const def = creatureDef(ref.species);
      const affix = ref.affix ? `${affixDef(ref.affix).name} ` : '';
      return `${countWord(count)} ${affix}${def.plural}`;
    }),
  );
}

/** "a silver ring and two bone charms". */
export function lootList(items: readonly LootItem[]): string {
  const counts = new Map<LootId, number>();
  for (const item of items) counts.set(item.loot, (counts.get(item.loot) ?? 0) + 1);
  return listOf(
    [...counts].map(([loot, count]) => {
      const def = lootDef(loot);
      return count === 1 ? `${article(def.name)} ${def.name}` : `${countWord(count)} ${def.plural}`;
    }),
  );
}

/** "14 gold and a silver ring", or just one of the two. */
export function spoils(gold: number, items: readonly LootItem[]): string {
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold} gold`);
  if (items.length > 0) parts.push(lootList(items));
  return listOf(parts);
}

/** How someone looks after a fight. */
export function condition(hp: number, maxHp: number): string {
  const fraction = hp / maxHp;
  if (fraction >= 0.9) return 'barely scratched';
  if (fraction >= 0.6) return 'bruised';
  if (fraction >= 0.35) return 'wounded';
  return 'badly wounded';
}

export const TRAP_NAMES: Record<TrapId, string> = {
  pit: 'hidden pit',
  darts: 'dart trap',
  gas: 'gas trap',
  'falling-stones': 'rigged ceiling',
};
