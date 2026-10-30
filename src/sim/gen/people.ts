import { SPECIES, STATS, type SpeciesId, type StatId, type Stats } from '../../content';
import { schedule } from '../core/scheduler';
import type { SimContext } from '../context';
import type { Character, CharacterId, Location } from '../model';
import { generateName } from './names';

const STAT_DICE = '2d6+3';
const STAT_MIN = 3;
const STAT_MAX = 18;
const STARTING_GOLD = '2d6+5';
const BASE_HP = 18;
const BASE_STAMINA = 6;

/**
 * Creates an adventurer living in `home`, of one of the peoples who live
 * there, and schedules their first decision within `firstWakeWithin` seconds.
 */
export function createCharacter(
  ctx: SimContext,
  home: Location,
  newcomer: boolean,
  firstWakeWithin: number,
): Character {
  const world = ctx.world;
  const rng = ctx.rng.people;

  const peoples = Object.entries(home.peoples) as [SpeciesId, number][];
  const species: SpeciesId = peoples.length > 0 ? rng.weighted(peoples) : 'human';
  const def = SPECIES[species];

  const stats = Object.fromEntries(
    STATS.map((stat) => {
      const modifier = (def.statModifiers as Partial<Record<StatId, number>>)[stat] ?? 0;
      return [stat, Math.min(STAT_MAX, Math.max(STAT_MIN, rng.roll(STAT_DICE) + modifier))];
    }),
  ) as Stats;
  const maxHp = BASE_HP + stats.toughness;
  const maxStamina = BASE_STAMINA + Math.round((stats.toughness + stats.might) / 2);

  const name = generateName(rng, def.culture, world.takenNames);
  const character: Character = {
    id: `c${world.nextCharacterNumber++}` as CharacterId,
    ...name,
    species,
    culture: def.culture,
    homeId: home.id,
    arrivedAt: world.time,
    stats,
    weapon: rng.weighted(Object.entries(def.weapons) as [Character['weapon'], number][]),
    bravery: Math.min(1, Math.max(0.05, rng.gaussian(0.55, 0.2))),
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    statuses: [],
    gold: rng.roll(STARTING_GOLD),
    pack: [],
    kills: {},
    goldEarned: 0,
    homeUntil: 0,
    locationId: home.id,
    activity: { kind: 'idle' },
    death: null,
  };
  world.characters.set(character.id, character);

  ctx.emit(
    {
      type: 'character.introduced',
      data: { characterId: character.id, homeId: home.id, newcomer },
    },
    [character.id],
    home.id,
  );
  schedule(world.scheduler, world.time + rng.int(0, firstWakeWithin), {
    kind: 'character.wake',
    characterId: character.id,
  });
  return character;
}

export function towns(ctx: SimContext): Location[] {
  return [...ctx.world.locations.values()].filter((l) => l.kind === 'town');
}
