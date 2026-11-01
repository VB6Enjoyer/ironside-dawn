/**
 * Cultures (WORLD.md §6). Each people has a generic culture of its own for
 * now; mythology-inspired culture packs arrive in Phase 10.
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
} as const satisfies Record<string, CultureDef>;

export type CultureId = keyof typeof CULTURES;
