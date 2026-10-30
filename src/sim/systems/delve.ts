import { creatureDef, TRAPS, type CreatureId, type RoomOutcome } from '../../content';
import { schedule } from '../core/scheduler';
import { MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type { Character, DelveProgress, Dungeon, Item, Location, LootItem } from '../model';
import { startFight } from './combat';
import { isDizzy, modifier, retreatThreshold } from './condition';
import { die } from './death';
import { claimLegend, generateItem, takeGear } from './items';
import { rollLootItem } from './loot';
import { gainXp, practice, skillBonus } from './progress';

/**
 * Delves: a dungeon explored one chamber at a time. Each chamber may hold a
 * fight, treasure, a trap, or nothing; between chambers the character decides
 * whether to go deeper or leave (ROADMAP.md Phase 2).
 */

const CHAMBER_MINUTES: readonly [number, number] = [8, 25];
const STAMINA_PER_CHAMBER = 0.5;
/** Chance of calling it a day after any chamber, even when all is well. */
const BASE_LEAVE_CHANCE = 0.08;
/** Deeper chambers favor stronger creatures by this much per chamber per creature level above 1. */
const DEPTH_BIAS = 0.2;
/** Groups grow by one for every this many chambers deep. */
const GROUP_GROWTH_CHAMBERS = 4;
const ITEM_IN_TREASURE_CHANCE = 0.3;
const GEAR_IN_TREASURE_CHANCE = 0.3;
/** Chance that a treasure chamber holds a legendary item lost here by a fallen adventurer. */
const LOST_LEGEND_CHANCE = 0.3;
const LOCKED_CHANCE = 0.5;
const LOCK_DIFFICULTY = 8;
const LOCKPICK_PRACTICE = 1.5;
const AWARENESS_PRACTICE = 1;
/** Each chamber deeper adds this fraction to treasure gold. */
const GOLD_DEPTH_BONUS = 0.15;
/** Chambers a level-1 character goes before getting nervous; one more per level. */
const COMFORT_DEPTH = 3;
const XP_PER_TREASURE = 5;
const XP_PER_AVOIDED_TRAP = 3;
const XP_PER_CHAMBER = 2;
/** Encounters with this much total creature level are frightening enough to try avoiding. */
const AVOID_THREAT = 4;
/** Slipping away succeeds on d20 + agility >= this + the strongest creature's level. */
const STEALTH_DIFFICULTY = 8;

export function enterDelve(ctx: SimContext, character: Character, location: Location): void {
  if (!location.dungeon) throw new Error(`${location.id} is not a dungeon`);
  character.activity = {
    kind: 'delving',
    locationId: location.id,
    room: 0,
    goldFound: 0,
    itemsFound: 0,
  };
  ctx.emit(
    { type: 'delve.enter', data: { characterId: character.id, locationId: location.id } },
    [character.id],
    location.id,
  );
  nextChamber(ctx, character);
}

/** Back to exploring after a won fight. */
export function resumeDelve(ctx: SimContext, character: Character, progress: DelveProgress): void {
  character.activity = { kind: 'delving', ...progress };
  schedule(ctx.world.scheduler, ctx.world.time + ctx.rng.delve.int(1, 3) * MINUTE, {
    kind: 'character.wake',
    characterId: character.id,
  });
}

/** Called when a delving character wakes: leave, or explore the next chamber. */
export function delveStep(ctx: SimContext, character: Character): void {
  const activity = character.activity;
  if (activity.kind !== 'delving') throw new Error(`${character.id} is not delving`);
  const location = ctx.world.locations.get(activity.locationId)!;
  const dungeon = location.dungeon!;
  const rng = ctx.rng.delve;

  if (activity.room > 0 && shouldLeave(ctx, character, activity, dungeon)) {
    exitDelve(ctx, character, activity, false);
    return;
  }

  const room = activity.room + 1;
  const progress: DelveProgress = { ...activity, room };
  character.stamina = Math.max(0, character.stamina - STAMINA_PER_CHAMBER);

  const outcome = rng.weighted(
    (Object.entries(dungeon.def.rooms) as [RoomOutcome, number][]).filter(([, w]) => w > 0),
  );
  switch (outcome) {
    case 'fight': {
      const species = pickInhabitant(ctx, dungeon, room);
      if (species) {
        const def = creatureDef(species);
        const available = dungeon.population[species] ?? 0;
        const extra = Math.floor((room - 1) / GROUP_GROWTH_CHAMBERS);
        const count = rng.int(
          def.group[0],
          Math.max(def.group[0], Math.min(def.group[1] + extra, available)),
        );
        if (avoidFight(ctx, character, location, progress, species, count)) return;
        startFight(ctx, character, location, progress, species, count);
        return;
      }
      quietChamber(ctx, character, location, progress);
      return;
    }
    case 'treasure':
      treasureChamber(ctx, character, location, progress);
      return;
    case 'trap':
      trapChamber(ctx, character, location, progress);
      return;
    case 'quiet':
      quietChamber(ctx, character, location, progress);
      return;
  }
}

/** Leaves the dungeon and stands at its entrance, deciding what next shortly after. */
export function exitDelve(
  ctx: SimContext,
  character: Character,
  progress: DelveProgress,
  fled: boolean,
): void {
  character.activity = { kind: 'idle' };
  character.locationId = progress.locationId;
  if (progress.room > 0)
    gainXp(ctx, character, XP_PER_CHAMBER * progress.room, progress.locationId);
  ctx.emit(
    {
      type: 'delve.exit',
      data: {
        characterId: character.id,
        locationId: progress.locationId,
        rooms: progress.room,
        gold: progress.goldFound,
        items: progress.itemsFound,
        fled,
      },
    },
    [character.id],
    progress.locationId,
  );
  schedule(ctx.world.scheduler, ctx.world.time + MINUTE, {
    kind: 'character.wake',
    characterId: character.id,
  });
}

function shouldLeave(
  ctx: SimContext,
  character: Character,
  progress: DelveProgress,
  dungeon: Dungeon,
): boolean {
  if (progress.room >= dungeon.def.depth) return true;
  if (character.hp < character.maxHp * retreatThreshold(character)) return true;
  if (character.stamina < character.maxStamina * 0.25) return true;
  if (isDizzy(character, ctx.world.time)) return true;
  // Deeper than their experience allows, the inexperienced turn back sooner.
  if (progress.room >= COMFORT_DEPTH + character.level && ctx.rng.delve.chance(0.35)) return true;
  return ctx.rng.delve.chance(BASE_LEAVE_CHANCE);
}

/**
 * Faced with something frightening, a character may try to slip away before
 * being noticed. Braver characters try less often. Returns true if they got
 * away; on a failed attempt the fight starts anyway.
 */
function avoidFight(
  ctx: SimContext,
  character: Character,
  location: Location,
  progress: DelveProgress,
  species: CreatureId,
  count: number,
): boolean {
  const level = creatureDef(species).level;
  if (level * count < AVOID_THREAT) return false;
  const rng = ctx.rng.delve;
  if (!rng.chance(1 - 0.7 * character.bravery)) return false;

  const success =
    rng.int(1, 20) + modifier(character, 'agility') + skillBonus(character, 'stealth') >=
    STEALTH_DIFFICULTY + level;
  practice(ctx, character, 'stealth', success ? 1.5 : 0.8, location.id);
  const foes = Array.from({ length: count }, (_, i) => ({
    species,
    affix: null,
    ordinal: count > 1 ? i + 1 : 0,
  }));
  ctx.emit(
    {
      type: 'delve.avoid',
      data: { characterId: character.id, locationId: location.id, foes, success },
    },
    [character.id],
    location.id,
  );
  if (success) continueDelve(ctx, character, progress);
  return success;
}

function pickInhabitant(ctx: SimContext, dungeon: Dungeon, room: number): CreatureId | null {
  const options: [CreatureId, number][] = [];
  for (const { creature } of dungeon.def.inhabitants) {
    const count = dungeon.population[creature] ?? 0;
    if (count <= 0) continue;
    const bias = 1 + DEPTH_BIAS * (room - 1) * (creatureDef(creature).level - 1);
    options.push([creature, count * bias]);
  }
  return options.length > 0 ? ctx.rng.delve.weighted(options) : null;
}

function quietChamber(
  ctx: SimContext,
  character: Character,
  location: Location,
  progress: DelveProgress,
) {
  ctx.emit(
    {
      type: 'delve.quiet',
      data: { characterId: character.id, locationId: location.id, room: progress.room },
    },
    [character.id],
    location.id,
  );
  continueDelve(ctx, character, progress);
}

function treasureChamber(
  ctx: SimContext,
  character: Character,
  location: Location,
  progress: DelveProgress,
) {
  const rng = ctx.rng.loot;
  const dungeon = location.dungeon!;
  const def = dungeon.def;

  // Half of chests are locked: pick the lock, or force it and spoil some of what's inside.
  let lock: 'none' | 'picked' | 'forced' = 'none';
  if (rng.chance(LOCKED_CHANCE)) {
    const roll =
      rng.int(1, 20) + skillBonus(character, 'lockpicking') + modifier(character, 'agility');
    lock = roll >= LOCK_DIFFICULTY + def.danger ? 'picked' : 'forced';
    practice(ctx, character, 'lockpicking', LOCKPICK_PRACTICE, location.id);
  }

  let gold = 0;
  for (let i = 0; i < def.danger; i++) gold += rng.roll(def.treasureGold);
  gold = Math.round(gold * (1 + GOLD_DEPTH_BONUS * (progress.room - 1)));
  const items: LootItem[] = [];
  const gear: Item[] = [];
  if (lock === 'forced') {
    gold = Math.ceil(gold / 2);
  } else {
    if (rng.chance(ITEM_IN_TREASURE_CHANCE)) {
      items.push(
        rollLootItem(rng, rng.weighted(def.treasure.map((t) => [t.loot, t.weight] as const))),
      );
    }
    const lost = dungeon.lostItems[0];
    if (lost && rng.chance(LOST_LEGEND_CHANCE)) {
      gear.push(dungeon.lostItems.shift()!);
    } else if (rng.chance(GEAR_IN_TREASURE_CHANCE * (1 + 0.05 * progress.room))) {
      gear.push(
        generateItem(ctx, ctx.rng.items, { culture: location.culture, depth: progress.room }),
      );
    }
  }

  character.gold += gold;
  character.goldEarned += gold;
  character.pack.push(...items);
  ctx.emit(
    {
      type: 'delve.treasure',
      data: {
        characterId: character.id,
        locationId: location.id,
        room: progress.room,
        gold,
        items: [...items, ...gear.map((g) => ({ gear: g, value: g.value }))],
        lock,
      },
    },
    [character.id],
    location.id,
  );
  for (const item of gear) {
    if (item.rarity === 'legendary') claimLegend(ctx, character, item, location.id);
    takeGear(ctx, character, item, location.id);
  }
  gainXp(ctx, character, XP_PER_TREASURE + (lock === 'picked' ? 3 : 0), location.id);
  continueDelve(ctx, character, {
    ...progress,
    goldFound: progress.goldFound + gold,
    itemsFound: progress.itemsFound + items.length + gear.length,
  });
}

function trapChamber(
  ctx: SimContext,
  character: Character,
  location: Location,
  progress: DelveProgress,
) {
  const rng = ctx.rng.delve;
  const trap = rng.weighted(TRAPS.map((t) => [t, t.weight] as const));
  const difficulty = 10 + location.dungeon!.def.danger + trap.difficulty;
  const avoided =
    rng.int(1, 20) + modifier(character, 'agility') + skillBonus(character, 'awareness') >=
    difficulty;
  practice(ctx, character, 'awareness', AWARENESS_PRACTICE, location.id);
  if (avoided) gainXp(ctx, character, XP_PER_AVOIDED_TRAP, location.id);
  const damage = avoided ? 0 : rng.roll(trap.damage);
  const dizzy = !avoided && trap.dizzyMinutes > 0;

  character.hp = Math.max(0, character.hp - damage);
  if (dizzy) {
    character.statuses.push({ kind: 'dizzy', until: ctx.world.time + trap.dizzyMinutes * MINUTE });
  }
  ctx.emit(
    {
      type: 'delve.trap',
      data: {
        characterId: character.id,
        locationId: location.id,
        trap: trap.id,
        avoided,
        damage,
        dizzy,
      },
    },
    [character.id],
    location.id,
  );

  if (character.hp <= 0) die(ctx, character, { kind: 'trap', trap: trap.id });
  else continueDelve(ctx, character, progress);
}

function continueDelve(ctx: SimContext, character: Character, progress: DelveProgress): void {
  character.activity = { kind: 'delving', ...progress };
  schedule(ctx.world.scheduler, ctx.world.time + ctx.rng.delve.int(...CHAMBER_MINUTES) * MINUTE, {
    kind: 'character.wake',
    characterId: character.id,
  });
}

/** Next chamber right after entering, without the leave check. */
function nextChamber(ctx: SimContext, character: Character): void {
  schedule(ctx.world.scheduler, ctx.world.time + ctx.rng.delve.int(2, 6) * MINUTE, {
    kind: 'character.wake',
    characterId: character.id,
  });
}
