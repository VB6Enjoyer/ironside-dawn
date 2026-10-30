import type { MapDef } from './locations';

/**
 * The hand-made Phase 1 world: three towns, two dungeons and a forest, joined
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
    { id: 'concordale', name: 'Concordale', kind: 'town', culture: 'generic' },
    { id: 'brindlemoor', name: 'Brindlemoor', kind: 'town', culture: 'generic' },
    { id: 'saltmere', name: 'Saltmere', kind: 'town', culture: 'generic' },
    {
      id: 'dungeon-of-misery',
      name: 'Dungeon of Misery',
      article: 'the',
      kind: 'dungeon',
      culture: 'generic',
    },
    { id: 'gorefang-caves', name: 'Gorefang Caves', kind: 'dungeon', culture: 'generic' },
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
