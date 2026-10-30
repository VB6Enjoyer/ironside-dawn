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
  },
} as const satisfies Record<string, CultureDef>;

export type CultureId = keyof typeof CULTURES;
