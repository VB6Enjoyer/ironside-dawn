import { creatureDef, SPECIES, type CreatureId, type SpeciesId } from '../../content';
import type { SimContext } from '../context';
import { createCharacter } from '../gen/people';
import type { Character, Location, LocationId, World } from '../model';
import { isAlive } from './condition';
import { generateItem } from './items';
import { learnSpells } from './magic';
import { nudgeTrait, satisfy } from './mind';
import { addDeed, gainXp, refreshMaxima, xpForLevel } from './progress';
import { dreadEnded, dreadInfamous } from './myths';
import { raidTown } from './raids';
import { nearbyPlaces } from './roads';

/**
 * The dread (ROADMAP.md Phase 9): liches, revenants and demon lords, each a
 * character lairing in the deepest chamber of a dungeon, commanding its
 * creatures. They grow stronger from every adventurer they kill, now and
 * then lead their hordes against a town, and grow infamous over the years,
 * until a party strong enough reaches the lair and brings them down. In
 * time, another rises somewhere else.
 */

/** One of the dread for every this many towns, and at least one. */
const TOWNS_PER_DREAD = 8;
/** Daily chance a new one rises while there are fewer than the world holds. */
const RISE_CHANCE = 1 / (360 * 2);
/** Share of its health a lair's master recovers a day. */
const MENDING = 0.03;
/** Daily chance a master leads its horde on a raid, when its horde is strong. */
const RAID_CHANCE = 1 / 240;
/** Road hours a horde will march to raid. */
const RAID_REACH = 40 * 3600;
/** The most creatures a master brings on a raid, and into its lair's last fight. */
const HORDE = 8;
/** Experience a master takes from each level of those it kills. */
const XP_PER_VICTIM_LEVEL = 40;

/** How many of the dread a world holds at once. */
function dreadFor(ctx: SimContext): number {
  const towns = [...ctx.world.locations.values()].filter((l) => l.kind === 'town').length;
  return Math.max(1, Math.round(towns / TOWNS_PER_DREAD));
}

/** At the world's beginning, the deadliest lairs have masters already. */
export function raiseInitialDread(ctx: SimContext): void {
  const lairs = eligibleLairs(ctx).sort((a, b) => b.dungeon!.def.danger - a.dungeon!.def.danger);
  for (const lair of lairs.slice(0, dreadFor(ctx))) rise(ctx, lair);
}

/** Lives claimed after which a master is infamous, and a call to arms goes out. */
export const INFAMOUS = 8;

/** Infamous masters, and the town nearest each lair where a band musters, worked out daily. */
const musters = new WeakMap<World, { day: number; list: Muster[] }>();

export interface Muster {
  readonly master: Character;
  readonly townId: LocationId;
}

/** Where bands are gathering against the infamous dread. */
export function mustersOf(world: World): readonly Muster[] {
  const day = Math.floor(world.time / 86_400);
  const cached = musters.get(world);
  if (cached && cached.day === day) return cached.list;
  const list: Muster[] = [];
  for (const lair of world.locations.values()) {
    const id = lair.dungeon?.masterId;
    const master = id ? world.characters.get(id) : undefined;
    if (!master || master.death || master.slain < INFAMOUS) continue;
    const town = nearbyPlaces(world, lair.id).find(
      (p) => world.locations.get(p.id)!.kind === 'town',
    );
    if (town) list.push({ master, townId: town.id });
  }
  musters.set(world, { day, list });
  return list;
}

/** A day of the dread: they mend, they march, and new ones rise. */
export function dreadDay(ctx: SimContext): void {
  const world = ctx.world;
  const rng = ctx.rng.ecology;
  let living = 0;
  for (const lair of world.locations.values()) {
    const masterId = lair.dungeon?.masterId;
    if (!masterId) continue;
    const master = world.characters.get(masterId)!;
    if (!isAlive(master)) continue;
    living++;
    dreadInfamous(ctx, master);
    if (master.activity.kind !== 'living') continue;
    master.hp = Math.min(master.maxHp, master.hp + Math.ceil(master.maxHp * MENDING));
    master.stamina = master.maxStamina;
    if (master.hp >= master.maxHp && strongHorde(lair) && rng.chance(RAID_CHANCE)) {
      march(ctx, master, lair);
    }
  }
  if (living < dreadFor(ctx) && rng.chance(RISE_CHANCE)) {
    const lairs = eligibleLairs(ctx);
    if (lairs.length > 0) rise(ctx, rng.pick(lairs));
  }
}

/** A horde at least half as big as its lair can hold. */
function strongHorde(lair: Location): boolean {
  const dungeon = lair.dungeon!;
  const room = dungeon.def.inhabitants.reduce((sum, i) => sum + i.max, 0);
  const have = dungeon.def.inhabitants.reduce(
    (sum, i) => sum + (dungeon.population[i.creature] ?? 0),
    0,
  );
  return have >= room / 2;
}

/** Dungeons that could house one of the dread and have none. */
function eligibleLairs(ctx: SimContext): Location[] {
  return [...ctx.world.locations.values()].filter(
    (l) => l.dungeon && !l.dungeon.masterId && (l.dungeon.def.masters?.length ?? 0) > 0,
  );
}

/** One of the dread comes to a dungeon: ancient, strong, and well armed. */
function rise(ctx: SimContext, lair: Location): Character {
  const rng = ctx.rng.people;
  const dungeon = lair.dungeon!;
  const species: SpeciesId = rng.pick(dungeon.def.masters!);
  const master = createCharacter(ctx, lair, {
    newcomer: false,
    firstWakeWithin: 0,
    calling: 'dread',
    species,
  });
  // As strong as the lair is deep, and a match for the strongest adventurers of the day.
  const strongest = Math.max(
    0,
    ...[...ctx.world.characters.values()]
      .filter((c) => c.calling === 'adventurer' && !c.death)
      .map((c) => c.level),
  );
  const level = Math.max(10 + dungeon.def.danger * 2, strongest - 5) + rng.int(0, 4);
  master.level = level;
  master.xp = xpForLevel(level);
  const def = SPECIES[species];
  const weaponSkill = Object.entries(master.skills)
    .filter(([s]) => ['blades', 'axes', 'blunt', 'polearms'].includes(s))
    .sort((a, b) => b[1] - a[1])[0]![0] as keyof typeof master.skills;
  master.skills[weaponSkill] = rng.int(55, 75);
  master.skills.awareness = rng.int(40, 60);
  if (master.gifted) {
    master.skills.arcana = rng.int(60, 85);
    learnSpells(ctx, master, lair.id);
  }
  master.equipment.weapon = generateItem(ctx, ctx.rng.items, {
    culture: def.culture,
    depth: 8,
    base: master.equipment.weapon.base,
    rarity: 'rare',
  });
  refreshMaxima(master);
  master.hp = master.maxHp;
  master.stamina = master.maxStamina;
  dungeon.masterId = master.id;
  ctx.emit(
    { type: 'dread.rise', data: { characterId: master.id, locationId: lair.id } },
    [master.id],
    lair.id,
  );
  return master;
}

/** A master leads its horde against the nearest town it can reach. */
function march(ctx: SimContext, master: Character, lair: Location): void {
  const world = ctx.world;
  const target = nearbyPlaces(world, lair.id).find(
    (p) => p.duration <= RAID_REACH && world.locations.get(p.id)!.kind === 'town',
  );
  if (!target) return;
  const horde = hordeOf(lair, HORDE);
  if (horde.length === 0) return;
  raidTown(
    ctx,
    world.locations.get(target.id)!,
    horde,
    { locationId: lair.id, pool: 'dungeon' },
    master,
  );
}

/** The strongest of a lair's creatures, up to `most` of them. */
export function hordeOf(
  lair: Location,
  most: number,
): { readonly species: CreatureId; readonly count: number }[] {
  const pool = lair.dungeon!.population;
  const kinds = (Object.entries(pool) as [CreatureId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => creatureDef(b[0]).level - creatureDef(a[0]).level);
  const horde: { species: CreatureId; count: number }[] = [];
  let room = most;
  for (const [species, n] of kinds) {
    if (room <= 0) break;
    const count = Math.min(room, n, Math.max(1, Math.ceil(most / 2)));
    horde.push({ species, count });
    room -= count;
  }
  return horde;
}

/** A master's escort in its lair: two or three of its strongest creatures. */
export function escortOf(
  lair: Location,
): { readonly species: CreatureId; readonly count: number } | null {
  const [first] = hordeOf(lair, 3);
  return first ?? null;
}

/** The master of a lair, if it lives and is at home to visitors. */
export function masterAt(ctx: SimContext, lair: Location): Character | null {
  const id = lair.dungeon?.masterId;
  const master = id ? ctx.world.characters.get(id) : undefined;
  if (!master || !isAlive(master) || master.activity.kind !== 'living') return null;
  return master.locationId === lair.id ? master : null;
}

/** One of the dread kills someone, and grows stronger for it. */
export function dreadKilled(
  ctx: SimContext,
  master: Character,
  victim: Character,
  at: LocationId,
): void {
  gainXp(ctx, master, XP_PER_VICTIM_LEVEL * victim.level, at);
}

/** One of the dread is destroyed: its lair is free, and its slayers are heroes. */
export function dreadFell(
  ctx: SimContext,
  master: Character,
  slayers: readonly Character[],
  at: LocationId,
): void {
  const world = ctx.world;
  const lair = world.locations.get(master.homeId);
  if (lair?.dungeon?.masterId === master.id) lair.dungeon.masterId = null;
  world.tally.dreadSlain++;
  dreadEnded(ctx, master, at);
  const name = `${master.givenName} ${master.familyName}`;
  for (const hero of slayers) {
    addDeed(hero, { kind: 'vanquish', at: world.time, characterId: master.id, name });
    satisfy(hero, 'glory', 1);
    nudgeTrait(hero, 'bravery', 0.05);
    gainXp(ctx, hero, 25 * master.level, at);
  }
  ctx.emit(
    {
      type: 'dread.fall',
      data: {
        characterId: master.id,
        locationId: at,
        slayerIds: slayers.map((c) => c.id),
        slain: master.slain,
        since: master.arrivedAt,
      },
    },
    [master.id, ...slayers.map((c) => c.id)],
    at,
  );
}
