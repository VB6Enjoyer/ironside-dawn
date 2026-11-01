import {
  SKILLS,
  SPECIES,
  STATS,
  weaponBase,
  type ArmorId,
  type SkillId,
  type SpeciesId,
  type StatId,
  type Stats,
  type WeaponId,
} from '../../content';
import type { SimContext } from '../context';
import type { Calling, Character, CharacterId, Location, PriceNote, World } from '../model';
import { mint } from '../systems/ledger';
import { GOOD_IDS, houseQuote } from '../systems/market';
import { generateItem, starterWeapon } from '../systems/items';
import { learnSpells } from '../systems/magic';
import { initialDrives, rollTraits } from '../systems/mind';
import { refreshMaxima } from '../systems/progress';
import { wakeAt } from '../systems/wake';
import { generateName } from './names';
import { arrive } from '../systems/whereabouts';

const STAT_DICE = '2d6+3';
const STAT_MIN = 3;
const STAT_MAX = 18;
const STARTING_GOLD = '2d6+5';

/**
 * Creates an adventurer from the commoners of `home` (ARCHITECTURE.md §4.2:
 * statistical populations promote individuals), and schedules their first
 * decision within `firstWakeWithin` seconds.
 */
export function createCharacter(
  ctx: SimContext,
  home: Location,
  newcomer: boolean,
  firstWakeWithin: number,
  calling: Calling = 'adventurer',
): Character {
  const world = ctx.world;
  const rng = ctx.rng.people;

  const peoples = (Object.entries(home.population) as [SpeciesId, number][]).filter(
    ([, n]) => n > 0,
  );
  const species: SpeciesId = peoples.length > 0 ? rng.weighted(peoples) : 'human';
  if (home.population[species]) home.population[species] -= 1;
  const def = SPECIES[species];

  const stats = Object.fromEntries(
    STATS.map((stat) => {
      const modifier = (def.statModifiers as Partial<Record<StatId, number>>)[stat] ?? 0;
      return [stat, Math.min(STAT_MAX, Math.max(STAT_MIN, rng.roll(STAT_DICE) + modifier))];
    }),
  ) as Stats;

  const gifted = rng.chance(def.giftChance);
  const weaponId = rng.weighted(Object.entries(def.weapons) as [WeaponId, number][]);
  const armorId = rng.weighted(Object.entries(def.armor) as [ArmorId, number][]);
  const itemsRng = ctx.rng.items;
  const weapon = starterWeapon(ctx, itemsRng, weaponId);
  const armor = generateItem(ctx, itemsRng, {
    culture: def.culture,
    depth: 0,
    base: armorId,
    rarity: 'common',
    material: 'iron',
  });

  const skills = Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<SkillId, number>;
  skills[weaponBase(weaponId).skill] = rng.int(15, 30);
  for (const skill of ['blades', 'axes', 'blunt', 'polearms'] as const) {
    if (skills[skill] === 0) skills[skill] = rng.int(0, 8);
  }
  for (const skill of ['stealth', 'lockpicking', 'awareness'] as const) {
    skills[skill] = Math.max(0, rng.int(0, 12) + (stats.agility - 10));
  }
  skills.arcana = gifted ? rng.int(15, 30) : 0;

  const name = generateName(rng, def.culture, world.takenNames);
  const character: Character = {
    id: `c${world.nextCharacterNumber++}` as CharacterId,
    calling,
    ...name,
    species,
    culture: def.culture,
    homeId: home.id,
    arrivedAt: world.time,
    stats,
    traits: rollTraits(rng, species),
    gifted,
    level: 1,
    xp: 0,
    skills,
    equipment: { weapon, armor, trinket: null },
    spells: [],
    deeds: [],
    hp: 0,
    maxHp: 0,
    stamina: 0,
    maxStamina: 0,
    statuses: [],
    gold: calling === 'merchant' ? stake(rng.roll('2d6')) : rng.roll(STARTING_GOLD),
    pack: [],
    kills: {},
    goldEarned: 0,
    drives: initialDrives(rng),
    drivesAt: world.time,
    memories: [],
    expectations: {},
    visited: [home.id],
    goal: null,
    opinions: {},
    languages: { [def.language]: 100 },
    partyId: null,
    outlaw: null,
    reputation: {},
    locationId: home.id,
    activity: { kind: 'idle' },
    wakeToken: 0,
    death: null,
    history: [],
    potions: 0,
    cargo: {},
    cargoPaid: 0,
    // Merchants start out knowing what things cost in every town.
    priceBook: calling === 'merchant' ? priceBookOfAllTowns(world) : {},
  };
  mint(world, 'newcomers', character.gold);
  refreshMaxima(character);
  character.hp = character.maxHp;
  character.stamina = character.maxStamina;
  world.characters.set(character.id, character);
  arrive(world, character);

  ctx.emit(
    {
      type: 'character.introduced',
      data: { characterId: character.id, homeId: home.id, newcomer },
    },
    [character.id],
    home.id,
  );
  // The gifted arrive already knowing a spell or two.
  if (gifted) learnSpells(ctx, character, home.id);
  wakeAt(ctx, character, world.time + rng.int(0, firstWakeWithin));
  return character;
}

/** A merchant's stake: two hundred gold and then some. */
function stake(roll: number): number {
  return 200 + roll * 20;
}

/** What every town's trading house pays and asks right now. */
export function priceBookOfAllTowns(world: World): Partial<Record<string, PriceNote>> {
  const book: Partial<Record<string, PriceNote>> = {};
  for (const market of world.markets.values()) {
    const bid: PriceNote['bid'] = {};
    const ask: PriceNote['ask'] = {};
    for (const good of GOOD_IDS) {
      const quote = houseQuote(market, good);
      bid[good] = quote.bid;
      ask[good] = quote.ask;
    }
    book[market.townId] = { t: world.time, bid, ask };
  }
  return book;
}

export function towns(ctx: SimContext): Location[] {
  return [...ctx.world.locations.values()].filter((l) => l.kind === 'town');
}

/** Total commoners in a town. */
export function townPopulation(town: Location): number {
  return Object.values(town.population).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}
