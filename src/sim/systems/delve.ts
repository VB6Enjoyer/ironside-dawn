import { creatureDef, TRAPS, type CreatureId, type RoomOutcome } from '../../content';
import { schedule } from '../core/scheduler';
import { MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type { Character, DelveProgress, Dungeon, Location } from '../model';
import { startFight } from './combat';
import { isDizzy, modifier, retreatThreshold } from './condition';
import { die } from './death';
import { rollLootItem } from './loot';

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
const DEPTH_BIAS = 0.12;
const ITEM_IN_TREASURE_CHANCE = 0.3;
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
        const count = rng.int(
          def.group[0],
          Math.max(def.group[0], Math.min(def.group[1], available)),
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

  const success = rng.int(1, 20) + modifier(character, 'agility') >= STEALTH_DIFFICULTY + level;
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
  const def = location.dungeon!.def;
  let gold = 0;
  for (let i = 0; i < def.danger; i++) gold += rng.roll(def.treasureGold);
  const items = rng.chance(ITEM_IN_TREASURE_CHANCE)
    ? [rollLootItem(rng, rng.weighted(def.treasure.map((t) => [t.loot, t.weight] as const)))]
    : [];

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
        items,
      },
    },
    [character.id],
    location.id,
  );
  continueDelve(ctx, character, {
    ...progress,
    goldFound: progress.goldFound + gold,
    itemsFound: progress.itemsFound + items.length,
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
  const avoided = rng.int(1, 20) + modifier(character, 'agility') >= difficulty;
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
