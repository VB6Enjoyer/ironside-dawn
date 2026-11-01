import type { DungeonDef, MapDef } from './locations';

const COMMON_TREASURE: DungeonDef['treasure'] = [
  { loot: 'silver-ring', weight: 5 },
  { loot: 'gilded-goblet', weight: 3 },
  { loot: 'jeweled-dagger', weight: 2 },
  { loot: 'ancient-amulet', weight: 1 },
];

/**
 * The hand-made starter world: three towns, two dungeons, a forest and a
 * mountain pass, joined by roads. Replaced by procedural generation in Phase 9.
 *
 *            Gorefang Caves
 *                  |
 *   Concordale --- Brindlemoor
 *        |    \          |
 *        |     \     Ironpass
 *        |      \        |
 *   Witherwood --------- Saltmere
 *        |
 *   Dungeon of Misery
 *
 * Concordale farms and forges; Brindlemoor, a dwarven town, mines iron and
 * makes the best steel; elven Saltmere grows herbs and brews, but has no
 * forge, so its iron comes over the Ironpass or through the Witherwood.
 */
export const STARTER_MAP: MapDef = {
  width: 50,
  height: 44,
  locations: [
    {
      id: 'concordale',
      x: 16,
      y: 14,
      name: 'Concordale',
      kind: 'town',
      culture: 'generic',
      population: { human: 1200 },
      academy: true,
      economy: {
        workforce: {
          farmers: 0.6,
          hunters: 0.08,
          herbalists: 0.06,
          smiths: 0.12,
          tailors: 0.08,
          alchemists: 0.06,
        },
      },
    },
    {
      id: 'brindlemoor',
      x: 34,
      y: 14,
      name: 'Brindlemoor',
      kind: 'town',
      culture: 'generic',
      population: { dwarf: 600, human: 250 },
      economy: {
        workforce: {
          miners: 0.35,
          farmers: 0.35,
          smiths: 0.15,
          hunters: 0.08,
          tailors: 0.04,
          alchemists: 0.03,
        },
        mine: true,
      },
    },
    {
      id: 'saltmere',
      x: 34,
      y: 34,
      name: 'Saltmere',
      kind: 'town',
      culture: 'generic',
      population: { elf: 600, human: 400 },
      academy: true,
      economy: {
        workforce: { farmers: 0.5, herbalists: 0.2, alchemists: 0.1, tailors: 0.1, hunters: 0.1 },
      },
    },
    {
      id: 'dungeon-of-misery',
      x: 12,
      y: 38,
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
      x: 34,
      y: 4,
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
      x: 16,
      y: 27,
      name: 'Witherwood',
      article: 'the',
      kind: 'wilderness',
      culture: 'generic',
    },
    {
      id: 'ironpass',
      x: 40,
      y: 24,
      name: 'Ironpass',
      article: 'the',
      kind: 'wilderness',
      culture: 'generic',
    },
  ],
  routes: [
    { between: ['concordale', 'brindlemoor'], hours: 9 },
    { between: ['concordale', 'witherwood'], hours: 5 },
    { between: ['concordale', 'saltmere'], hours: 16 },
    { between: ['brindlemoor', 'ironpass'], hours: 6 },
    { between: ['ironpass', 'saltmere'], hours: 7 },
    { between: ['brindlemoor', 'gorefang-caves'], hours: 7 },
    { between: ['witherwood', 'saltmere'], hours: 8 },
    { between: ['witherwood', 'dungeon-of-misery'], hours: 6 },
  ],
};
