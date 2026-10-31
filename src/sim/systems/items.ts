import {
  ARMORS,
  ITEM_AFFIXES,
  itemAffixDef,
  itemBase,
  MATERIALS,
  materialDef,
  RARITIES,
  TRINKETS,
  UNIQUE_NAME_ENDINGS,
  UNIQUE_NAME_STARTS,
  WEAPONS,
  weaponBase,
  type CultureId,
  type ItemAffixId,
  type ItemBase,
  type ItemBaseId,
  type MaterialId,
  type Rarity,
  type SkillId,
  type Slot,
  type StatId,
  type WeaponId,
} from '../../content';
import type { Rng } from '../core/rng';
import type { SimContext } from '../context';
import type { Character, Item, ItemId, LocationId } from '../model';
import { remember, satisfy } from './mind';
import { addDeed } from './progress';

/**
 * Equipment (ROADMAP.md Phase 3): generating items, adding up what worn gear
 * does, and deciding whether something found is worth wearing.
 */

export interface GearTotals {
  attack: number;
  damage: number;
  defense: number;
  maxHp: number;
  maxStamina: number;
  skills: Partial<Record<SkillId, number>>;
  stats: Partial<Record<StatId, number>>;
}

export interface ItemOptions {
  readonly culture: CultureId;
  /** 0 at a dungeon's entrance, rising with each chamber deeper. */
  readonly depth: number;
  readonly slot?: Slot;
  /** Fix the rarity instead of rolling it. */
  readonly rarity?: Rarity;
  /** Fix the material instead of rolling it. */
  readonly material?: MaterialId;
  readonly base?: ItemBaseId;
}

/** How much each chamber deeper improves the odds of rare finds. */
const RARITY_DEPTH_BONUS = 0.15;
const SLOT_WEIGHTS: readonly (readonly [Slot, number])[] = [
  ['weapon', 4],
  ['armor', 3],
  ['trinket', 3],
];

export function generateItem(ctx: SimContext, rng: Rng, options: ItemOptions): Item {
  const slot =
    options.slot ?? (options.base ? itemBase(options.base).slot : rng.weighted(SLOT_WEIGHTS));
  const base = options.base ? itemBase(options.base) : pickBase(rng, slot, options.culture);
  const rarity = options.rarity ?? rollRarity(rng, slot, options.depth);
  const takesMaterial = base.slot !== 'armor' || base.metal;
  const material = takesMaterial
    ? (options.material ??
      pickMaterial(rng, slot, options.culture, options.depth, rarity === 'legendary'))
    : null;
  const affixes = pickAffixes(rng, slot, RARITIES.find((r) => r.id === rarity)!.affixes);
  const uniqueName = rarity === 'legendary' ? uniqueNameFor(ctx, rng, base) : null;

  const rarityMultiplier = RARITIES.find((r) => r.id === rarity)!.valueMultiplier;
  const materialMultiplier = material ? materialDef(material).valueMultiplier : 1;
  return {
    id: `g${ctx.world.nextItemNumber++}` as ItemId,
    base: base.id as ItemBaseId,
    material,
    rarity,
    affixes,
    uniqueName,
    value: Math.max(1, Math.round(base.value * materialMultiplier * rarityMultiplier)),
  };
}

/** What a single item adds when worn. */
export function itemEffects(item: Item): GearTotals {
  const totals = emptyTotals();
  const base = itemBase(item.base);
  const material = item.material ? materialDef(item.material) : null;
  if (base.slot === 'weapon') {
    totals.attack += base.accuracy + (material?.attack ?? 0);
    totals.damage += material?.damage ?? 0;
  } else if (base.slot === 'armor') {
    totals.defense += base.defense + (material?.defense ?? 0);
  }
  for (const affix of item.affixes) addEffects(totals, itemAffixDef(affix).effects);
  return totals;
}

/** What everything a character wears adds up to. */
export function gearTotals(character: Character): GearTotals {
  const totals = emptyTotals();
  const { weapon, armor, trinket } = character.equipment;
  for (const item of [weapon, armor, trinket]) {
    if (item) addEffects(totals, itemEffects(item));
  }
  return totals;
}

/**
 * A rough worth of an item to this character. Weapons count the character's
 * skill with them, so a swordsman sticks with swords unless an axe is much better.
 */
export function gearScore(item: Item, character: Character): number {
  const e = itemEffects(item);
  let score =
    e.attack * 1.5 +
    e.damage +
    e.defense * 2 +
    e.maxHp * 0.5 +
    e.maxStamina * 0.4 +
    sum(e.skills) * 0.1 +
    sum(e.stats) * 0.5;
  const base = itemBase(item.base);
  if (base.slot === 'weapon') {
    score += averageRoll(base.damage) + (character.skills[base.skill] / 10) * 1.5;
  }
  return score;
}

/** The weapon skill an item trains, if it is a weapon. */
export function weaponSkillOf(item: Item): SkillId | null {
  const base = itemBase(item.base);
  return base.slot === 'weapon' ? base.skill : null;
}

export function starterWeapon(ctx: SimContext, rng: Rng, id: WeaponId): Item {
  return generateItem(ctx, rng, {
    culture: weaponBase(id).culture,
    depth: 0,
    base: id,
    rarity: 'common',
    material: 'iron',
  });
}

/**
 * Something found: wear it if it beats what's in its slot (the old piece goes
 * in the pack to sell), otherwise pack it. Legendary finds are recorded.
 */
export function takeGear(
  ctx: SimContext,
  character: Character,
  item: Item,
  locationId: LocationId,
): void {
  const slot = itemBase(item.base).slot;
  const current = character.equipment[slot];
  if (current === null || gearScore(item, character) > gearScore(current, character) + 0.25) {
    character.equipment = { ...character.equipment, [slot]: item };
    if (current) character.pack.push({ gear: current, value: current.value });
    ctx.emit(
      {
        type: 'item.equip',
        data: { characterId: character.id, locationId, item, replaced: current },
      },
      [character.id],
      locationId,
    );
  } else {
    character.pack.push({ gear: item, value: item.value });
  }
}

/** All the gear a character carries or wears. */
export function carriedGear(character: Character): Item[] {
  const { weapon, armor, trinket } = character.equipment;
  const packed = character.pack.flatMap((p) => ('gear' in p ? [p.gear] : []));
  return [weapon, ...(armor ? [armor] : []), ...(trinket ? [trinket] : []), ...packed];
}

function pickBase(rng: Rng, slot: Slot, culture: CultureId): ItemBase {
  const bases: readonly ItemBase[] =
    slot === 'weapon' ? WEAPONS : slot === 'armor' ? ARMORS : TRINKETS;
  return rng.weighted(bases.map((b) => [b, b.weight * (b.culture === culture ? 2 : 1)] as const));
}

function rollRarity(rng: Rng, slot: Slot, depth: number): Rarity {
  // A plain trinket does nothing, so trinkets are at least fine.
  const options = RARITIES.filter((r) => slot !== 'trinket' || r.id !== 'common');
  return rng.weighted(
    options.map((r, i) => [r.id, r.weight * (1 + RARITY_DEPTH_BONUS * depth * i)] as const),
  );
}

function pickMaterial(
  rng: Rng,
  slot: Slot,
  culture: CultureId,
  depth: number,
  legendary: boolean,
): MaterialId {
  const options = MATERIALS.filter(
    (m) => (m.slots as readonly Slot[]).includes(slot) && (!legendary || m.valueMultiplier >= 2),
  );
  return rng.weighted(
    options.map((m) => {
      const weight = Math.max(0.05, m.weight * (1 + m.depthBias * depth));
      return [m.id, weight * (m.culture === culture ? 2 : 1)] as const;
    }),
  );
}

/** At most one prefix and one suffix, so names read naturally. */
function pickAffixes(rng: Rng, slot: Slot, count: number): ItemAffixId[] {
  const fits = ITEM_AFFIXES.filter((a) => (a.slots as readonly Slot[]).includes(slot));
  const prefixes = fits.filter((a) => a.position === 'prefix');
  const suffixes = fits.filter((a) => a.position === 'suffix');
  const pick = (from: typeof fits) =>
    from.length > 0 ? rng.weighted(from.map((a) => [a.id, a.weight] as const)) : null;

  if (count <= 0) return [];
  if (count === 1) {
    const one = pick(rng.chance(0.5) && prefixes.length > 0 ? prefixes : suffixes);
    return one ? [one] : [];
  }
  return [pick(prefixes), pick(suffixes)].filter((a): a is ItemAffixId => a !== null);
}

function uniqueNameFor(ctx: SimContext, rng: Rng, base: ItemBase): string {
  const endings = UNIQUE_NAME_ENDINGS[base.slot === 'weapon' ? base.skill : base.slot];
  const taken = new Set([...ctx.world.legends.values()].map((l) => l.item.uniqueName));
  let name = rng.pick(UNIQUE_NAME_STARTS) + rng.pick(endings);
  for (let attempt = 0; attempt < 30 && taken.has(name); attempt++) {
    name = rng.pick(UNIQUE_NAME_STARTS) + rng.pick(endings);
  }
  // Out of fresh names: a namesake, like kings ("Duskblade II").
  for (let n = 2; taken.has(name); n++) name = `${name.split(' ')[0]} ${ROMAN[n] ?? n}`;
  return name;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function emptyTotals(): GearTotals {
  return { attack: 0, damage: 0, defense: 0, maxHp: 0, maxStamina: 0, skills: {}, stats: {} };
}

function addEffects(totals: GearTotals, effects: Partial<GearTotals>): void {
  totals.attack += effects.attack ?? 0;
  totals.damage += effects.damage ?? 0;
  totals.defense += effects.defense ?? 0;
  totals.maxHp += effects.maxHp ?? 0;
  totals.maxStamina += effects.maxStamina ?? 0;
  for (const [skill, n] of Object.entries(effects.skills ?? {}) as [SkillId, number][]) {
    totals.skills[skill] = (totals.skills[skill] ?? 0) + n;
  }
  for (const [stat, n] of Object.entries(effects.stats ?? {}) as [StatId, number][]) {
    totals.stats[stat] = (totals.stats[stat] ?? 0) + n;
  }
}

function sum(record: Partial<Record<string, number>>): number {
  return Object.values(record).reduce<number>((total, n) => total + (n ?? 0), 0);
}

/** Average of dice notation such as "2d6+1". */
export function averageRoll(dice: string): number {
  const match = /^(\d*)d(\d+)([+-]\d+)?$/.exec(dice.replace(/\s+/g, ''));
  if (!match) return Number(dice) || 0;
  const count = match[1] === '' ? 1 : Number(match[1]);
  return (count * (Number(match[2]) + 1)) / 2 + Number(match[3] ?? 0);
}

/**
 * Records that a character now holds a legendary item: its first finding, or
 * its rediscovery where a fallen owner dropped it.
 */
export function claimLegend(
  ctx: SimContext,
  character: Character,
  item: Item,
  locationId: LocationId,
): void {
  const world = ctx.world;
  let legend = world.legends.get(item.id);
  const previousOwner = legend?.owners.at(-1)?.characterId ?? null;
  if (!legend) {
    legend = { item, holder: null, lostAt: null, owners: [] };
    world.legends.set(item.id, legend);
  }
  legend.holder = character.id;
  legend.lostAt = null;
  legend.owners.push({ characterId: character.id, at: world.time });
  addDeed(character, { kind: 'legend', at: world.time, itemId: item.id, name: item.uniqueName! });
  remember(character, world.time, { kind: 'treasure', locationId, itemName: item.uniqueName! }, 1);
  satisfy(character, 'glory', 0.5);
  ctx.emit(
    {
      type: 'item.legend',
      data: { characterId: character.id, locationId, item, previousOwner },
    },
    [character.id],
    locationId,
  );
}
