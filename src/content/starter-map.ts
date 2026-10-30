import type { DungeonDef, MapDef } from './locations';

const COMMON_TREASURE: DungeonDef['treasure'] = [
  { loot: 'silver-ring', weight: 5 },
  { loot: 'gilded-goblet', weight: 3 },
  { loot: 'jeweled-dagger', weight: 2 },
  { loot: 'ancient-amulet', weight: 1 },
];

/**
 * The hand-made starter world: three towns, two dungeons and a forest, joined
 * by roads. Replaced by procedural generation in Phase 9.
 *
 *            Gorefang Caves
 *                  |
 *   Concordale --- Brindlemoor
 *        |    \          |
 *        |     \         |
 *   Witherwood --------- Saltmere
 *        |
 *   Dungeon of Misery
 */
export const STARTER_MAP: MapDef = {
  locations: [
    {
      id: 'concordale',
      name: 'Concordale',
      kind: 'town',
      culture: 'generic',
      population: { human: 1200 },
      academy: true,
    },
    {
      id: 'brindlemoor',
      name: 'Brindlemoor',
      kind: 'town',
      culture: 'generic',
      population: { human: 500, dwarf: 350 },
    },
    {
      id: 'saltmere',
      name: 'Saltmere',
      kind: 'town',
      culture: 'generic',
      population: { human: 600, elf: 400 },
      academy: true,
    },
    {
      id: 'dungeon-of-misery',
      name: 'Dungeon of Misery',
      article: 'the',
      kind: 'dungeon',
      culture: 'generic',
      dungeon: {
        danger: 2,
        depth: 10,
        rooms: { fight: 4, treasure: 2, trap: 2, quiet: 3 },
        inhabitants: [
          { creature: 'skeleton', initial: 30, max: 40, regrowthPerDay: 2 },
          { creature: 'zombie', initial: 15, max: 20, regrowthPerDay: 1 },
          { creature: 'infernal-imp', initial: 8, max: 10, regrowthPerDay: 0.4 },
          { creature: 'hellhound', initial: 2, max: 3, regrowthPerDay: 0.03 },
        ],
        treasureGold: '2d6',
        treasure: COMMON_TREASURE,
      },
    },
    {
      id: 'gorefang-caves',
      name: 'Gorefang Caves',
      kind: 'dungeon',
      culture: 'generic',
      dungeon: {
        danger: 2,
        depth: 8,
        rooms: { fight: 5, treasure: 1, trap: 1, quiet: 3 },
        inhabitants: [
          { creature: 'giant-rat', initial: 40, max: 60, regrowthPerDay: 4 },
          { creature: 'wolf', initial: 15, max: 20, regrowthPerDay: 1 },
          { creature: 'warg', initial: 8, max: 12, regrowthPerDay: 0.4 },
          { creature: 'giant-spider', initial: 10, max: 14, regrowthPerDay: 0.5 },
          { creature: 'cave-bear', initial: 2, max: 2, regrowthPerDay: 0.02 },
        ],
        treasureGold: '1d6',
        treasure: COMMON_TREASURE,
      },
    },
    {
      id: 'witherwood',
      name: 'Witherwood',
      article: 'the',
      kind: 'wilderness',
      culture: 'generic',
    },
  ],
  routes: [
    { between: ['concordale', 'brindlemoor'], hours: 9 },
    { between: ['concordale', 'witherwood'], hours: 5 },
    { between: ['concordale', 'saltmere'], hours: 16 },
    { between: ['brindlemoor', 'saltmere'], hours: 12 },
    { between: ['brindlemoor', 'gorefang-caves'], hours: 7 },
    { between: ['witherwood', 'saltmere'], hours: 8 },
    { between: ['witherwood', 'dungeon-of-misery'], hours: 6 },
  ],
};
