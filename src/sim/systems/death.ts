import type { SimContext } from '../context';
import type { Character, DeathCause, Item, LocationId } from '../model';
import { carriedGear, takeGear } from './items';
import { burn } from './ledger';
import { mournDeath } from './social';

/** Renown below which nobody is a legend, however few have died. */
export const LEGENDARY_RENOWN = 60;
/** A legend outshines this share of those who died before them. */
const LEGEND_PERCENTILE = 0.9;

/** Permanent death. The character stays in the world's records. */
export function die(ctx: SimContext, character: Character, cause: DeathCause): void {
  const world = ctx.world;
  const locationId = character.locationId;
  if (locationId === null)
    throw new Error(`${character.id} died on the road, which can't happen yet`);

  const heirs = heirsOf(ctx, character);
  const place = world.locations.get(locationId);
  // Those who die at home leave their things to their heirs. Elsewhere, legendary
  // items stay where their owner fell, to be found again; the rest is lost.
  const atHome = place?.kind === 'town' && heirs.length > 0;
  const bequest: Item[] = [];
  for (const item of carriedGear(character)) {
    const legend = world.legends.get(item.id);
    if (atHome) {
      bequest.push(item);
      if (legend) {
        legend.holder = heirs[0]!.id;
        legend.owners.push({ characterId: heirs[0]!.id, at: world.time });
      }
      continue;
    }
    if (!legend) continue;
    legend.holder = null;
    legend.lostAt = place?.dungeon ? locationId : null;
    place?.dungeon?.lostItems.push(item);
  }

  // Their purse goes to their heirs (a killer has already taken it); with none, it is lost.
  const purse = character.gold;
  character.gold = 0;
  if (heirs.length === 0) burn(world, cause.kind === 'departed' ? 'departed' : 'dead', purse);

  character.hp = 0;
  character.activity = { kind: 'dead' };
  character.death = { at: world.time, locationId, cause };
  character.pack = [];
  character.cargo = {};
  character.cargoPaid = 0;
  // A dead outlaw's bounty lapses; one killed by someone is settled in onCharacterKilled.
  if (cause.kind !== 'character') world.bounties.delete(character.id);

  const kills = Object.values(character.kills).reduce((sum, n) => sum + n, 0);
  ctx.emit(
    { type: 'character.death', data: { characterId: character.id, locationId, cause, kills } },
    [character.id],
    locationId,
  );
  // Those who move on are missed, but not mourned.
  if (cause.kind !== 'departed') {
    mournDeath(ctx, character, cause.kind === 'character' ? cause.characterId : null);
  }
  bequeath(ctx, character, heirs, purse, bequest, locationId);
  if (isLegendary(ctx, character)) {
    world.heroes.push(character.id);
    ctx.emit(
      {
        type: 'legend.hero',
        data: { characterId: character.id, locationId, renown: renownOf(character) },
      },
      [],
      locationId,
    );
  }
}

/** A spouse, or failing that the children, living. */
function heirsOf(ctx: SimContext, character: Character): Character[] {
  const living = (id: Character['id']) => {
    const c = ctx.world.characters.get(id);
    return c && !c.death ? c : undefined;
  };
  const spouse = character.spouseId ? living(character.spouseId) : undefined;
  if (spouse) return [spouse];
  return character.children.flatMap((id) => living(id) ?? []);
}

/** Gold shared among the heirs; the gear to the first of them. */
function bequeath(
  ctx: SimContext,
  deceased: Character,
  heirs: readonly Character[],
  purse: number,
  items: readonly Item[],
  locationId: LocationId,
): void {
  if (heirs.length === 0 || (purse === 0 && items.length === 0)) return;
  const share = Math.floor(purse / heirs.length);
  heirs.forEach((heir, i) => {
    const gold = share + (i === 0 ? purse - share * heirs.length : 0);
    heir.gold += gold;
    const gifts = i === 0 ? items : [];
    for (const item of gifts) {
      // An adventurer wears what beats their own; others keep it.
      if (heir.calling === 'adventurer') takeGear(ctx, heir, item, locationId);
      else heir.pack.push({ gear: item, value: item.value });
    }
    if (gold === 0 && gifts.length === 0) return;
    ctx.emit(
      {
        type: 'family.inherit',
        data: { characterId: heir.id, locationId, fromId: deceased.id, gold, items: gifts },
      },
      [heir.id],
      locationId,
    );
  });
}

/**
 * Whether the dead pass into legend: renown above the floor, and above nearly
 * everyone who died before them, so legends stay rare however strong
 * veterans grow.
 */
function isLegendary(ctx: SimContext, character: Character): boolean {
  if (character.calling === 'merchant' || character.calling === 'child') return false;
  const renown = renownOf(character);
  if (renown < LEGENDARY_RENOWN) return false;
  let outshone = 0;
  let others = 0;
  for (const c of ctx.world.characters.values()) {
    if (c === character || !c.death || c.death.cause.kind === 'departed') continue;
    if (c.calling === 'merchant' || c.calling === 'child') continue;
    others++;
    if (renownOf(c) < renown) outshone++;
  }
  return others === 0 || outshone / others >= LEGEND_PERCENTILE;
}

/** How famous a character is: level, legendary finds, and the most fearsome kills. */
export function renownOf(c: Character): number {
  const kills = Object.values(c.kills).reduce((sum, n) => sum + n, 0);
  const legends = c.deeds.filter((d) => d.kind === 'legend').length;
  const slain = c.deeds.filter((d) => d.kind === 'slay').length;
  return Math.round(c.level + legends * 6 + slain * 2 + kills / 200);
}
