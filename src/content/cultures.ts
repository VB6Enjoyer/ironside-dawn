import type { NameParts } from './biomes';
import type { CreatureId } from './creatures';
import type { DungeonTemplateId } from './dungeons';
import type { ArmorId, WeaponId } from './items';
import type { Role } from './skills';
import type { PeopleId } from './species';

/**
 * Cultures (WORLD.md §6). Each people has a culture of its own; culture
 * packs (Phase 10) are regional, drawn from real-world civilizations and
 * their myths: the peoples who live in such a region are raised in its ways,
 * with its names, arms, gods and stories.
 */

export interface CultureDef {
  readonly id: string;
  readonly name: string;
  readonly givenNames: readonly string[];
  /** Family names are built as prefix + suffix ("Ash" + "ford"). */
  readonly familyNamePrefixes: readonly string[];
  readonly familyNameSuffixes: readonly string[];
  /** Town names, built the same way ("Concord" + "dale"). */
  readonly townPrefixes?: readonly string[];
  readonly townSuffixes?: readonly string[];
  /** A regional culture pack, which the peoples living in its lands take up. */
  readonly pack?: CulturePack;
}

/** What a regional culture brings to the lands it covers (WORLD.md §6). */
export interface CulturePack {
  /** The peoples raised in it, and what they are called there (Norse dvergar for dwarves). */
  readonly peoples: Partial<
    Record<PeopleId, { readonly singular: string; readonly plural: string }>
  >;
  /** Arms and armor favored by those raised in it. */
  readonly weapons: Partial<Record<WeaponId, number>>;
  readonly armor: Partial<Record<ArmorId, number>>;
  /** What fighters, scouts and mystics are called there. */
  readonly roles: Readonly<Record<Role, string>>;
  /** Who is worshipped at its shrines: believed in, at least. */
  readonly deities: readonly { readonly name: string; readonly domain: string }[];
  readonly regionNames: NameParts;
  readonly wildNames: NameParts;
  /** The kinds of dungeon in its lands, by weight. */
  readonly dungeons: Partial<Record<DungeonTemplateId, number>>;
  /** A creature that haunts its wild places, regrowing there. */
  readonly haunt: { readonly creature: CreatureId; readonly max: number } | null;
  /** How many regions of a world it covers, at most. */
  readonly reach: number;
}

export const CULTURES = {
  generic: {
    id: 'generic',
    name: 'Generic medieval',
    // prettier-ignore
    givenNames: [
      'Ada', 'Aldric', 'Alys', 'Ansel', 'Avice', 'Baldwin', 'Beatrix', 'Bertram',
      'Cecily', 'Clement', 'Cuthbert', 'Dunstan', 'Edith', 'Edric', 'Elspeth', 'Emma',
      'Everard', 'Gisela', 'Godwin', 'Gunnora', 'Hawise', 'Helewise', 'Hugh', 'Ida',
      'Isolde', 'Ivo', 'Joan', 'Jocelyn', 'Leofric', 'Lettice', 'Mabel', 'Mathilda',
      'Merek', 'Milo', 'Muriel', 'Nesta', 'Odo', 'Osric', 'Petronilla', 'Ralf',
      'Randolph', 'Reynard', 'Rohese', 'Rowena', 'Rufus', 'Sabine', 'Sybil', 'Tancred',
      'Theobald', 'Thurstan', 'Ulric', 'Wace', 'Walter', 'Wilmot', 'Wymond', 'Wynne',
    ],
    // prettier-ignore
    familyNamePrefixes: [
      'Ash', 'Black', 'Bright', 'Bram', 'Cold', 'Crow', 'Dun', 'Elm', 'Fair', 'Fen',
      'Grey', 'Hart', 'Iron', 'Long', 'Marsh', 'North', 'Oak', 'Red', 'Rook', 'Stone',
      'Thorn', 'West', 'White', 'Wolf',
    ],
    // prettier-ignore
    familyNameSuffixes: [
      'brook', 'by', 'croft', 'field', 'ford', 'gate', 'hill', 'holm', 'ley', 'more',
      'stead', 'ton', 'well', 'wick', 'wood',
    ],
    // prettier-ignore
    townPrefixes: [
      'Concord', 'Brindle', 'Salt', 'Ash', 'Elder', 'Wey', 'Mill', 'Kings', 'Raven', 'Thorn',
      'Hollow', 'Lark', 'Fern', 'Stour', 'Ox', 'Marl', 'Cran', 'Har', 'Pen', 'Ember',
      'Wren', 'Barrow', 'Holly', 'Copper', 'Sedge', 'Bell', 'Hay', 'Rush',
    ],
    // prettier-ignore
    townSuffixes: [
      'dale', 'moor', 'mere', 'ford', 'bury', 'wick', 'ton', 'ham', 'stead', 'bridge',
      'field', 'haven', 'wold', 'minster', 'cross',
    ],
  },
  sylvan: {
    id: 'sylvan',
    name: 'Sylvan (elven)',
    // prettier-ignore
    givenNames: [
      'Aelith', 'Aerendir', 'Caelion', 'Elandra', 'Elowen', 'Faelar', 'Ilmarë', 'Isilwen',
      'Lathiel', 'Liriel', 'Maerith', 'Nimloth', 'Orophin', 'Quenya', 'Saelis', 'Sylvaine',
      'Taeriel', 'Thalion', 'Vaelis', 'Yllanë', 'Aranel', 'Celeborn', 'Eirian', 'Naeril',
    ],
    // prettier-ignore
    familyNamePrefixes: [
      'Moon', 'Star', 'Silver', 'Dawn', 'Dusk', 'Mist', 'Leaf', 'Wind', 'Thorn', 'Willow',
    ],
    // prettier-ignore
    familyNameSuffixes: [
      'whisper', 'bough', 'song', 'shade', 'glade', 'bloom', 'brook', 'veil', 'wing',
    ],
    // prettier-ignore
    townPrefixes: [
      'Aelin', 'Cael', 'Ith', 'Lor', 'Sil', 'Thal', 'Ylen', 'Myr', 'Nae', 'Faer', 'Elen', 'Quel',
    ],
    // prettier-ignore
    townSuffixes: ['dor', 'wyn', 'thil', 'lond', 'mere', 'glade', 'iel', 'ost', 'ara', 'eth'],
  },
  deephold: {
    id: 'deephold',
    name: 'Deephold (dwarven)',
    // prettier-ignore
    givenNames: [
      'Bardin', 'Bofri', 'Brunhild', 'Dagna', 'Dvalin', 'Gerda', 'Gimra', 'Grimnir',
      'Hakon', 'Helga', 'Ingrid', 'Korgan', 'Mordrin', 'Nali', 'Orsik', 'Ragna',
      'Skaldi', 'Thora', 'Torgrim', 'Ulfa', 'Vistra', 'Yrsa',
    ],
    // prettier-ignore
    familyNamePrefixes: [
      'Iron', 'Stone', 'Deep', 'Gold', 'Flint', 'Copper', 'Ember', 'Granite', 'Anvil', 'Coal',
    ],
    // prettier-ignore
    familyNameSuffixes: [
      'beard', 'hammer', 'fist', 'delve', 'forge', 'helm', 'shield', 'brow', 'vein', 'mantle',
    ],
    // prettier-ignore
    townPrefixes: [
      'Kar', 'Khaz', 'Dur', 'Grim', 'Thrag', 'Bar', 'Iron', 'Stone', 'Ember', 'Deep',
      'Hammer', 'Anvil', 'Mor', 'Bal',
    ],
    // prettier-ignore
    townSuffixes: ['hold', 'deep', 'delve', 'mount', 'hall', 'gate', 'forge', 'dun', 'heim'],
  },
  steppe: {
    id: 'steppe',
    name: 'Steppe (centaur)',
    // prettier-ignore
    givenNames: [
      'Arkhan', 'Bayar', 'Chagra', 'Daran', 'Erdene', 'Gerel', 'Hulan', 'Khasar', 'Altan',
      'Mergen', 'Naran', 'Oyun', 'Saran', 'Temur', 'Tolui', 'Yesun', 'Borte', 'Jochi',
    ],
    // prettier-ignore
    familyNamePrefixes: [
      'Wind', 'Storm', 'Swift', 'Grass', 'Thunder', 'Sky', 'Dust', 'Far', 'Red', 'Sun',
    ],
    // prettier-ignore
    familyNameSuffixes: [
      'runner', 'mane', 'hoof', 'strider', 'caller', 'chaser', 'watcher', 'song', 'herd',
    ],
    // prettier-ignore
    townPrefixes: [
      'Wind', 'Grass', 'Thunder', 'Hoof', 'Sky', 'Dust', 'Long', 'Red', 'Wild', 'Horn', 'Sun',
    ],
    // prettier-ignore
    townSuffixes: ['moot', 'run', 'camp', 'meet', 'reach', 'ring', 'ford', 'stand'],
  },
  japonic: {
    id: 'japonic',
    name: 'Japonic',
    // prettier-ignore
    givenNames: [
      'Akira', 'Asuka', 'Daichi', 'Emi', 'Hana', 'Haruto', 'Hikari', 'Isamu', 'Jun', 'Kaede',
      'Kazuki', 'Kenji', 'Kiyoshi', 'Masaru', 'Mei', 'Michi', 'Naoki', 'Nori', 'Ren', 'Rin',
      'Sachiko', 'Shin', 'Sora', 'Takeshi', 'Taro', 'Tomoe', 'Yuki',
    ],
    // prettier-ignore
    familyNamePrefixes: [
      'Yama', 'Kawa', 'Mori', 'Ishi', 'Matsu', 'Taka', 'Naka', 'Kita', 'Fuji', 'Haya', 'Ono', 'Sugi',
    ],
    // prettier-ignore
    familyNameSuffixes: ['moto', 'mura', 'da', 'kawa', 'shita', 'zaki', 'hara', 'oka', 'ta'],
    // prettier-ignore
    townPrefixes: ['Kawa', 'Yama', 'Mizu', 'Taka', 'Hana', 'Matsu', 'Shira', 'Aka', 'Kuro', 'Asa'],
    // prettier-ignore
    townSuffixes: ['mura', 'machi', 'zaki', 'hama', 'saka', 'gawa', 'dera', 'shima'],
    pack: {
      peoples: { human: { singular: 'human', plural: 'humans' } },
      weapons: { katana: 4, naginata: 3, yumi: 2 },
      armor: { 'do-maru': 2, padded: 1 },
      roles: { fighter: 'ronin', scout: 'shinobi', mystic: 'onmyōji' },
      deities: [
        { name: 'Inari', domain: 'rice, foxes and fortune' },
        { name: 'Hachiman', domain: 'archery and war' },
        { name: 'Amaterasu', domain: 'the sun' },
        { name: 'Susanoo', domain: 'storms and the sea' },
        { name: 'Benzaiten', domain: 'water and music' },
      ],
      // prettier-ignore
      regionNames: { first: ['Cedar', 'Crane', 'Plum', 'Moon', 'Pine', 'Heron', 'Misty'], second: ['Provinces', 'Valley', 'Highlands', 'Coast'], join: ' ' },
      // prettier-ignore
      wildNames: { first: ['Yanagi', 'Kiri', 'Sagi', 'Tsuki', 'Hotaru', 'Kawazu'], second: [' Ford', ' Crossing', ' Bridge'], join: '' },
      dungeons: { shrine: 3, 'oni-hold': 2, cave: 1 },
      haunt: { creature: 'kappa', max: 6 },
      reach: 2,
    },
  },
  norse: {
    id: 'norse',
    name: 'Norse',
    // prettier-ignore
    givenNames: [
      'Astrid', 'Bjorn', 'Eirik', 'Freydis', 'Gudrun', 'Gunnar', 'Hakon', 'Halla', 'Hild', 'Ketil',
      'Leif', 'Orm', 'Ragnar', 'Runa', 'Sigrid', 'Solveig', 'Sten', 'Thyra', 'Ulf', 'Brokk', 'Eitri',
    ],
    // prettier-ignore
    familyNamePrefixes: ['Raven', 'Wolf', 'Frost', 'Storm', 'Sea', 'Elk', 'Bear', 'Ash', 'Iron', 'Fjall'],
    // prettier-ignore
    familyNameSuffixes: ['vik', 'dal', 'heim', 'fell', 'holm', 'strand', 'berg'],
    // prettier-ignore
    townPrefixes: ['Kaup', 'Hafn', 'Skog', 'Fjord', 'Sval', 'Ulf', 'Hrafn', 'Grim', 'Vind', 'Is'],
    // prettier-ignore
    townSuffixes: ['vik', 'stad', 'heim', 'by', 'fjord', 'holt', 'nes'],
    pack: {
      peoples: {
        human: { singular: 'human', plural: 'humans' },
        dwarf: { singular: 'dvergr', plural: 'dvergar' },
        elf: { singular: 'álfr', plural: 'álfar' },
      },
      weapons: { 'bearded-axe': 3, seax: 2, spear: 3, longsword: 1 },
      armor: { leather: 2, byrnie: 1, padded: 1 },
      roles: { fighter: 'huscarl', scout: 'tracker', mystic: 'rune-carver' },
      deities: [
        { name: 'Odin', domain: 'wisdom, war and the dead' },
        { name: 'Thor', domain: 'thunder' },
        { name: 'Freyja', domain: 'love and seiðr' },
        { name: 'Tyr', domain: 'law and oaths' },
        { name: 'Njord', domain: 'the sea' },
      ],
      // prettier-ignore
      regionNames: { first: ['Frost', 'Raven', 'Wolf', 'Grey', 'Iron', 'Wind'], second: ['Fjords', 'Holds', 'Marches', 'Fells'], join: ' ' },
      // prettier-ignore
      wildNames: { first: ['Grim', 'Hrafn', 'Ulf', 'Draug', 'Ice', 'Mist'], second: ['howe', 'fell', 'skerry', 'moor'], join: '' },
      dungeons: { barrow: 3, 'jotun-hall': 1, troll: 1 },
      haunt: null,
      reach: 3,
    },
  },
  // The dread: a name, and an epithet in place of a family name ("Morvath the Pale").
  grave: {
    id: 'grave',
    name: 'The grave (undead)',
    // prettier-ignore
    givenNames: [
      'Morvath', 'Vexmora', 'Szarith', 'Ulmorrow', 'Kethrax', 'Nhalgor', 'Velsith', 'Orduun',
      'Isparra', 'Thessaly', 'Malgrave', 'Corvane',
    ],
    familyNamePrefixes: ['the '],
    // prettier-ignore
    familyNameSuffixes: [
      'Pale', 'Hollow', 'Undying', 'Withered', 'Grey', 'Silent', 'Bone King', 'Hollow Queen',
      'Eyeless', 'Unburied', 'Lantern-eyed', 'Grave-born',
    ],
  },
  infernal: {
    id: 'infernal',
    name: 'Infernal (demon)',
    // prettier-ignore
    givenNames: [
      'Azhrael', 'Baalzeth', 'Gorrumoth', 'Ixtaroth', 'Kharneth', 'Molgarax', 'Sathrek',
      'Valgorath', 'Zerukai', 'Ulgrimm',
    ],
    familyNamePrefixes: ['the '],
    // prettier-ignore
    familyNameSuffixes: [
      'Burning', 'Flayer', 'Horned', 'Ash Lord', 'Devourer', 'Many-mouthed', 'Red', 'Smoldering',
      'Breaker', 'Chain-bearer',
    ],
  },
} as const satisfies Record<CultureId, CultureDef>;

/** Every culture, named here rather than derived, since the content tables refer to each other. */
export type CultureId =
  'generic' | 'sylvan' | 'deephold' | 'steppe' | 'japonic' | 'norse' | 'grave' | 'infernal';

/** The regional culture packs, in the order worlds place them. */
export const PACK_CULTURES = (Object.keys(CULTURES) as CultureId[]).filter(
  (id) => (CULTURES[id] as CultureDef).pack,
);

export function packOf(culture: CultureId): CulturePack | null {
  return (CULTURES[culture] as CultureDef).pack ?? null;
}
