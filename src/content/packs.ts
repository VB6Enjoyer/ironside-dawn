import { CREATURES, type CreatureDef } from './creatures';
import { CULTURES, type CultureDef } from './cultures';
import { DUNGEON_TEMPLATES, type DungeonTemplate } from './dungeons';
import {
  ARMORS,
  TRINKETS,
  WEAPONS,
  type ArmorBase,
  type TrinketBase,
  type WeaponBase,
} from './items';
import { LOOT, type LootDef } from './loot';
import { SKILLS } from './skills';
import { SPECIES } from './species';
import { SPELLS, type SpellDef } from './spells';

/**
 * Content packs (ROADMAP.md Phase 11): extra creatures, loot, arms, dungeon
 * kinds, spells, whole cultures and more names, as plain JSON. A pack is
 * checked, then added to the content tables before a world is made; worlds
 * remember the packs they were made with, so saves carry them.
 *
 * Packs only add: they never change or remove what is already there.
 */

export const PACK_FORMAT = 'ironside-dawn/content-pack';

export interface ContentPack {
  readonly format: typeof PACK_FORMAT;
  /** Unique among packs: letters, digits and dashes. */
  readonly id: string;
  readonly name: string;
  /** A line about what the pack adds, shown where packs are chosen. */
  readonly description?: string;
  readonly version: number;
  readonly creatures?: readonly CreatureDef[];
  readonly loot?: readonly LootDef[];
  readonly weapons?: readonly WeaponBase[];
  readonly armor?: readonly ArmorBase[];
  readonly trinkets?: readonly TrinketBase[];
  readonly spells?: readonly SpellDef[];
  readonly dungeons?: Readonly<Record<string, DungeonTemplate>>;
  readonly cultures?: Readonly<Record<string, CultureDef>>;
  /** More names for existing cultures, merged into their lists. */
  readonly names?: Readonly<
    Record<
      string,
      Partial<
        Pick<
          CultureDef,
          | 'givenNames'
          | 'familyNamePrefixes'
          | 'familyNameSuffixes'
          | 'townPrefixes'
          | 'townSuffixes'
        >
      >
    >
  >;
}

/** Packs installed in this process, by id. */
const installed = new Map<string, string>();

/**
 * Checks a pack and adds it to the content tables. Installing the same pack
 * again does nothing; a different pack with an id already in use is refused.
 */
export function installPack(raw: unknown): ContentPack {
  // A pack already in: the very same is fine (a world loaded twice), another with its id isn't.
  const id = (raw as { id?: unknown } | null)?.id;
  const before = typeof id === 'string' ? installed.get(id) : undefined;
  if (before !== undefined) {
    if (before === JSON.stringify(raw)) return raw as ContentPack;
    throw new PackError(`"${String(id)}"`, `a different pack with this id is already in use`);
  }
  const pack = checkPack(raw);
  const text = JSON.stringify(pack);

  // Cast past the tables' readonly types: this is the one place they grow.
  (CREATURES as unknown as CreatureDef[]).push(...(pack.creatures ?? []));
  (LOOT as unknown as LootDef[]).push(...(pack.loot ?? []));
  (WEAPONS as unknown as WeaponBase[]).push(...(pack.weapons ?? []));
  (ARMORS as unknown as ArmorBase[]).push(...(pack.armor ?? []));
  (TRINKETS as unknown as TrinketBase[]).push(...(pack.trinkets ?? []));
  (SPELLS as unknown as SpellDef[]).push(...(pack.spells ?? []));
  Object.assign(DUNGEON_TEMPLATES, pack.dungeons ?? {});
  Object.assign(CULTURES, pack.cultures ?? {});
  for (const [culture, lists] of Object.entries(pack.names ?? {})) {
    const def = (CULTURES as Record<string, CultureDef>)[culture]!;
    for (const [key, names] of Object.entries(lists)) {
      const list = def[key as keyof typeof lists] as string[] | undefined;
      if (list) list.push(...(names as string[]).filter((n) => !list.includes(n)));
    }
  }
  installed.set(pack.id, text);
  return pack;
}

/** The packs installed so far, in order. */
export function installedPacks(): ContentPack[] {
  return [...installed.values()].map((text) => JSON.parse(text) as ContentPack);
}

export class PackError extends Error {
  constructor(pack: string, problem: string) {
    super(`Content pack ${pack}: ${problem}`);
    this.name = 'PackError';
  }
}

/** Checks a pack's shape and that everything it names exists, before anything is added. */
export function checkPack(raw: unknown): ContentPack {
  const fail = (problem: string): never => {
    throw new PackError(typeof id === 'string' ? `"${id}"` : '(no id)', problem);
  };
  const obj = (value: unknown, what: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail(`${what} must be an object`);
    return value as Record<string, unknown>;
  };
  const list = (value: unknown, what: string): unknown[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(`${what} must be a list`);
    return value as unknown[];
  };
  const text = (o: Record<string, unknown>, key: string, what: string): string => {
    const v = o[key];
    if (typeof v !== 'string' || v.trim() === '') fail(`${what} needs "${key}" as text`);
    return v as string;
  };
  const num = (o: Record<string, unknown>, key: string, what: string): number => {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} needs "${key}" as a number`);
    return v as number;
  };
  const dice = (o: Record<string, unknown>, key: string, what: string): void => {
    if (!/^(\d*d\d+([+-]\d+)?|[+-]?\d+)$/.test(text(o, key, what))) {
      fail(`${what} has "${key}" that isn't dice notation (like "2d6+1")`);
    }
  };

  const top = obj(raw, 'the pack');
  const id = top.id;
  if (top.format !== PACK_FORMAT) fail(`"format" must be "${PACK_FORMAT}"`);
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    fail('"id" must be lowercase letters, digits and dashes');
  }
  text(top, 'name', 'the pack');
  if (top.description !== undefined) text(top, 'description', 'the pack');
  num(top, 'version', 'the pack');

  const ids = (what: string, existing: readonly { id: string }[], items: unknown[]) => {
    const seen = new Set(existing.map((e) => e.id));
    for (const item of items) {
      const o = obj(item, what);
      const itemId = text(o, 'id', what);
      if (seen.has(itemId)) fail(`${what} "${itemId}" already exists`);
      seen.add(itemId);
    }
    return seen;
  };
  const cultures = new Set([
    ...Object.keys(CULTURES),
    ...Object.keys(obj(top.cultures ?? {}, '"cultures"')),
  ]);
  const culture = (o: Record<string, unknown>, what: string) => {
    if (!cultures.has(text(o, 'culture', what)))
      fail(`${what} names an unknown culture "${String(o.culture)}"`);
  };

  // Loot first: creatures drop it.
  const lootIds = ids('loot', LOOT, list(top.loot, '"loot"'));
  for (const item of list(top.loot, '"loot"')) {
    const o = item as Record<string, unknown>;
    culture(o, `loot "${String(o.id)}"`);
    text(o, 'name', 'loot');
    text(o, 'plural', 'loot');
    num(o, 'value', 'loot');
  }
  const creatureIds = ids('creature', CREATURES, list(top.creatures, '"creatures"'));
  for (const item of list(top.creatures, '"creatures"')) {
    const o = item as Record<string, unknown>;
    const what = `creature "${String(o.id)}"`;
    culture(o, what);
    text(o, 'name', what);
    text(o, 'plural', what);
    if (!['beast', 'undead', 'demon', 'mortal'].includes(String(o.family))) {
      fail(`${what} needs "family": beast, undead, demon or mortal`);
    }
    for (const key of ['level', 'attack', 'defense', 'agility', 'fleeBelow']) num(o, key, what);
    dice(o, 'hp', what);
    dice(o, 'damage', what);
    const group = o.group;
    if (!Array.isArray(group) || group.length !== 2)
      fail(`${what} needs "group" as [fewest, most]`);
    for (const drop of list(o.drops, `${what} drops`)) {
      const d = obj(drop, `${what} drops`);
      if (!lootIds.has(text(d, 'loot', what)))
        fail(`${what} drops unknown loot "${String(d.loot)}"`);
      num(d, 'chance', what);
    }
  }
  const weaponIds = ids('weapon', WEAPONS, list(top.weapons, '"weapons"'));
  for (const item of list(top.weapons, '"weapons"')) {
    const o = item as Record<string, unknown>;
    const what = `weapon "${String(o.id)}"`;
    culture(o, what);
    if (o.slot !== 'weapon') fail(`${what} needs "slot": "weapon"`);
    if (!(SKILLS as readonly string[]).includes(String(o.skill)))
      fail(`${what} has an unknown skill`);
    dice(o, 'damage', what);
    for (const key of ['accuracy', 'value', 'weight']) num(o, key, what);
  }
  const armorIds = ids('armor', ARMORS, list(top.armor, '"armor"'));
  for (const item of list(top.armor, '"armor"')) {
    const o = item as Record<string, unknown>;
    const what = `armor "${String(o.id)}"`;
    culture(o, what);
    if (o.slot !== 'armor') fail(`${what} needs "slot": "armor"`);
    for (const key of ['defense', 'value', 'weight']) num(o, key, what);
  }
  ids('trinket', TRINKETS, list(top.trinkets, '"trinkets"'));
  ids('spell', SPELLS, list(top.spells, '"spells"'));
  for (const item of list(top.spells, '"spells"')) {
    const o = item as Record<string, unknown>;
    const what = `spell "${String(o.id)}"`;
    culture(o, what);
    const effect = obj(o.effect, `${what} effect`);
    if (!['damage', 'heal', 'quicken', 'ward'].includes(String(effect.kind))) {
      fail(`${what} needs an effect of kind damage, heal, quicken or ward`);
    }
    for (const key of ['difficulty', 'arcana']) num(o, key, what);
  }

  const templates = new Set(Object.keys(DUNGEON_TEMPLATES));
  for (const [key, value] of Object.entries(obj(top.dungeons ?? {}, '"dungeons"'))) {
    const what = `dungeon kind "${key}"`;
    if (templates.has(key)) fail(`${what} already exists`);
    const o = obj(value, what);
    for (const i of list(o.inhabitants, `${what} inhabitants`)) {
      const inhabitant = obj(i, what);
      if (!creatureIds.has(text(inhabitant, 'creature', what))) {
        fail(`${what} houses an unknown creature "${String(inhabitant.creature)}"`);
      }
    }
    for (const master of list(o.masters, `${what} masters`)) {
      if (!((master as string) in SPECIES))
        fail(`${what} names an unknown master "${String(master)}"`);
    }
    templates.add(key);
  }

  for (const [key, value] of Object.entries(obj(top.cultures ?? {}, '"cultures"'))) {
    const what = `culture "${key}"`;
    if (key in CULTURES) fail(`${what} already exists`);
    const o = obj(value, what);
    text(o, 'name', what);
    for (const names of ['givenNames', 'familyNamePrefixes', 'familyNameSuffixes']) {
      if (list(o[names], `${what} ${names}`).length === 0) fail(`${what} needs some ${names}`);
    }
    if (o.pack === undefined) continue;
    const pack = obj(o.pack, `${what} pack`);
    for (const w of Object.keys(obj(pack.weapons, `${what} weapons`))) {
      if (!weaponIds.has(w)) fail(`${what} favors an unknown weapon "${w}"`);
    }
    for (const a of Object.keys(obj(pack.armor, `${what} armor`))) {
      if (!armorIds.has(a)) fail(`${what} favors unknown armor "${a}"`);
    }
    for (const d of Object.keys(obj(pack.dungeons, `${what} dungeons`))) {
      if (!templates.has(d)) fail(`${what} names an unknown kind of dungeon "${d}"`);
    }
    const haunt = pack.haunt;
    if (haunt !== null && haunt !== undefined) {
      const h = obj(haunt, `${what} haunt`);
      if (!creatureIds.has(text(h, 'creature', what)))
        fail(`${what} is haunted by an unknown creature`);
    }
    for (const people of Object.keys(obj(pack.peoples, `${what} peoples`))) {
      if (!(people in SPECIES)) fail(`${what} raises an unknown people "${people}"`);
    }
  }
  for (const key of Object.keys(obj(top.names ?? {}, '"names"'))) {
    if (!cultures.has(key)) fail(`names are given for an unknown culture "${key}"`);
  }
  return raw as ContentPack;
}
