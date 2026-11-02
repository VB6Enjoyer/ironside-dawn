import {
  packOf,
  SKILLS,
  SPECIES,
  STATS,
  TRAITS,
  weaponBase,
  type ArmorId,
  type CultureId,
  type PeopleId,
  type LanguageId,
  type Traits,
  type SkillId,
  type SpeciesId,
  type StatId,
  type Stats,
  type WeaponId,
} from '../../content';
import type { Rng } from '../core/rng';
import { YEAR } from '../core/time';
import type { SimContext } from '../context';
import type { Calling, Character, CharacterId, Location, PriceNote, World } from '../model';
import { mint } from '../systems/ledger';
import { GOOD_IDS, houseQuote } from '../systems/market';
import { generateItem, starterWeapon } from '../systems/items';
import { learnSpells } from '../systems/magic';
import { initialDrives, rollTraits } from '../systems/mind';
import { refreshMaxima } from '../systems/progress';
import { wakeAt } from '../systems/wake';
import { generateChildName, generateName } from './names';
import { arrive } from '../systems/whereabouts';

const STAT_DICE = '2d6+3';
const STAT_MIN = 3;
const STAT_MAX = 18;
const STARTING_GOLD = '2d6+5';
/** Chance of the gift for a child with a gifted parent. */
const GIFT_IN_FAMILY = 0.35;
/** How far a child's traits may stray from their parents' average. */
const TRAIT_MUTATION = 0.1;

/** How much likelier the gift is, by the world's magic setting. */
const MAGIC = { rare: 0.4, normal: 1, common: 2.5 } as const;

/** How a character comes into the world. */
export interface Arrival {
  /** Taken up adventuring after the world began, rather than with it. */
  readonly newcomer: boolean;
  /** Their first decision comes within this many seconds. */
  readonly firstWakeWithin: number;
  readonly calling?: Calling;
  /** Born in the world to these parents, rather than promoted from the commoners. */
  readonly parents?: readonly [Character, Character];
  /** Promoted from this people of the town's commoners, rather than any. */
  readonly species?: SpeciesId;
}

/**
 * Creates a character: an adventurer or merchant promoted from the commoners
 * of `home` (ARCHITECTURE.md §4.2: statistical populations promote
 * individuals), or a child born to two characters. Adults get their first
 * decision within `firstWakeWithin` seconds; children wait to come of age.
 */
export function createCharacter(ctx: SimContext, home: Location, arrival: Arrival): Character {
  const world = ctx.world;
  const rng = ctx.rng.people;
  const parents = arrival.parents;
  const calling: Calling = parents ? 'child' : (arrival.calling ?? 'adventurer');
  // Children, lords and the dread live in the daily round, not deciding moment to moment.
  const settled = calling === 'child' || calling === 'lord' || calling === 'dread';

  let species: SpeciesId;
  if (parents) {
    species = parents[0].species;
  } else if (arrival.species) {
    species = arrival.species;
    const commoners = home.population[species] ?? 0;
    if (commoners > 0) home.population[species] = commoners - 1;
  } else {
    const peoples = (Object.entries(home.population) as [SpeciesId, number][]).filter(
      ([, n]) => n > 0,
    );
    species = peoples.length > 0 ? rng.weighted(peoples) : 'human';
    const commoners = home.population[species] ?? 0;
    if (commoners > 0) home.population[species] = commoners - 1;
  }
  const def = SPECIES[species];
  // Raised in the ways of their family, or of the land where they grew up, if
  // its culture takes in their people; otherwise in their people's own.
  const culture: CultureId = parents
    ? rng.pick(parents).culture
    : packOf(home.culture)?.peoples[species as PeopleId]
      ? home.culture
      : def.culture;
  const pack = packOf(culture);

  const stats = Object.fromEntries(
    STATS.map((stat) => {
      const modifier = (def.statModifiers as Partial<Record<StatId, number>>)[stat] ?? 0;
      // Children take after their parents, with a roll of their own.
      const rolled = parents
        ? Math.round((parents[0].stats[stat] + parents[1].stats[stat]) / 2 + rng.int(-2, 2))
        : rng.roll(STAT_DICE) + modifier;
      return [stat, Math.min(STAT_MAX, Math.max(STAT_MIN, rolled))];
    }),
  ) as Stats;

  // The gift runs in families.
  // The gift runs in families, and is rarer or commoner as the world was made.
  const magic = MAGIC[world.settings.magic];
  const gifted = parents
    ? rng.chance(
        Math.min(1, (parents.some((p) => p.gifted) ? GIFT_IN_FAMILY : def.giftChance) * magic),
      )
    : rng.chance(Math.min(1, def.giftChance * magic));
  const weaponId = parents
    ? (rng.pick(parents).equipment.weapon.base as WeaponId)
    : rng.weighted(Object.entries(pack?.weapons ?? def.weapons) as [WeaponId, number][]);
  const armorId = rng.weighted(Object.entries(pack?.armor ?? def.armor) as [ArmorId, number][]);
  const itemsRng = ctx.rng.items;
  const weapon = starterWeapon(ctx, itemsRng, weaponId);
  const armor = generateItem(ctx, itemsRng, {
    culture,
    depth: 0,
    base: armorId,
    rarity: 'common',
    material: 'iron',
  });

  const skills = Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<SkillId, number>;
  skills[weaponBase(weaponId).skill] = rng.int(15, 30);
  for (const skill of ['blades', 'axes', 'blunt', 'polearms', 'bows'] as const) {
    if (skills[skill] === 0) skills[skill] = rng.int(0, 8);
  }
  for (const skill of ['stealth', 'lockpicking', 'awareness'] as const) {
    skills[skill] = Math.max(0, rng.int(0, 12) + (stats.agility - 10));
  }
  skills.arcana = gifted ? rng.int(15, 30) : 0;

  const name = parents
    ? generateChildName(rng, culture, rng.pick(parents).familyName, world.takenNames)
    : generateName(rng, culture, world.takenNames);
  const [youngest, oldest] = def.startingAge;
  const age = parents ? 0 : rng.int(youngest, oldest) + rng.next();
  // A child grows up speaking whatever their parents speak, a little.
  const languages: Character['languages'] = { [def.language]: 100 };
  for (const parent of parents ?? []) {
    for (const [language, level] of Object.entries(parent.languages) as [LanguageId, number][]) {
      languages[language] = Math.max(languages[language] ?? 0, Math.round(level * 0.4));
    }
  }

  const character: Character = {
    id: `c${world.nextCharacterNumber++}` as CharacterId,
    calling,
    ...name,
    species,
    culture,
    homeId: home.id,
    born: world.time - Math.round(age * YEAR),
    occupation: null,
    spouseId: null,
    parents: parents ? [parents[0].id, parents[1].id] : [],
    children: [],
    arrivedAt: world.time,
    stats,
    traits: parents ? inheritTraits(rng, parents) : rollTraits(rng, species),
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
    gold:
      calling === 'merchant'
        ? stake(rng.roll('2d6'))
        : calling === 'child'
          ? 0
          : calling === 'lord' || calling === 'dread'
            ? rng.int(200, 600)
            : rng.roll(STARTING_GOLD),
    pack: [],
    kills: {},
    slain: 0,
    goldEarned: 0,
    drives: initialDrives(rng),
    drivesAt: world.time,
    memories: [],
    expectations: {},
    visited: [home.id],
    goal: null,
    opinions: {},
    languages,
    partyId: null,
    outlaw: null,
    reputation: {},
    locationId: home.id,
    activity: settled ? { kind: 'living' } : { kind: 'idle' },
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
  for (const parent of parents ?? []) parent.children.push(character.id);

  if (parents) {
    ctx.emit(
      {
        type: 'family.birth',
        data: {
          characterId: character.id,
          locationId: home.id,
          parentIds: parents.map((p) => p.id),
        },
      },
      [character.id, ...parents.map((p) => p.id)],
      home.id,
    );
    return character;
  }
  // Lords and the dread are announced as they take their seats and lairs.
  if (settled) return character;
  ctx.emit(
    {
      type: 'character.introduced',
      data: { characterId: character.id, homeId: home.id, newcomer: arrival.newcomer },
    },
    [character.id],
    home.id,
  );
  // The gifted arrive already knowing a spell or two.
  if (gifted) learnSpells(ctx, character, home.id);
  wakeAt(ctx, character, world.time + rng.int(0, arrival.firstWakeWithin));
  return character;
}

/** A child's personality: halfway between their parents', and then some of their own. */
function inheritTraits(rng: Rng, parents: readonly [Character, Character]): Traits {
  return Object.fromEntries(
    TRAITS.map((trait) => {
      const blend = (parents[0].traits[trait] + parents[1].traits[trait]) / 2;
      return [trait, Math.min(0.99, Math.max(0.01, blend + rng.gaussian(0, TRAIT_MUTATION)))];
    }),
  ) as Traits;
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
