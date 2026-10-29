/**
 * Cultures (WORLD.md §6). Phase 1 ships a single generic medieval culture so
 * the culture plumbing exists from the start; mythology-inspired culture
 * packs arrive in Phase 10.
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
} as const satisfies Record<string, CultureDef>;

export type CultureId = keyof typeof CULTURES;
