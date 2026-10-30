import type { SimContext } from '../context';
import type { Character, DeathCause } from '../model';
import { carriedGear } from './items';

/** Permanent death. The character stays in the world's records. */
export function die(ctx: SimContext, character: Character, cause: DeathCause): void {
  const locationId = character.locationId;
  if (locationId === null)
    throw new Error(`${character.id} died on the road, which can't happen yet`);

  // Legendary items stay where their owner fell, to be found again.
  const dungeon = ctx.world.locations.get(locationId)?.dungeon;
  for (const item of carriedGear(character)) {
    const legend = ctx.world.legends.get(item.id);
    if (!legend) continue;
    legend.holder = null;
    legend.lostAt = dungeon ? locationId : null;
    dungeon?.lostItems.push(item);
  }

  character.hp = 0;
  character.activity = { kind: 'dead' };
  character.death = { at: ctx.world.time, locationId, cause };
  character.pack = [];

  const kills = Object.values(character.kills).reduce((sum, n) => sum + n, 0);
  ctx.emit(
    { type: 'character.death', data: { characterId: character.id, locationId, cause, kills } },
    [character.id],
    locationId,
  );
}
