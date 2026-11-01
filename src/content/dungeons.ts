import type { CreatureId } from './creatures';
import type { NameParts } from './biomes';
import type { DungeonDef } from './locations';
import type { SpeciesId } from './species';

/**
 * Kinds of dungeon a generated world places (ROADMAP.md Phase 9). Creature
 * counts are for a dungeon of danger 2 (the starter map's); deadlier ones
 * hold more, and go deeper.
 */
export interface DungeonTemplate {
  readonly id: string;
  /** "the " is added when `article` is set. */
  readonly names: NameParts;
  readonly article: boolean;
  readonly rooms: DungeonDef['rooms'];
  readonly inhabitants: readonly {
    readonly creature: CreatureId;
    readonly max: number;
    readonly regrowthPerDay: number;
  }[];
  readonly treasureGold: string;
  /** Which of the dread may make a lair here. */
  readonly masters: readonly SpeciesId[];
}

// prettier-ignore
export const DUNGEON_TEMPLATES = {
  cave: {
    id: 'cave', article: false,
    names: { first: ['Gorefang', 'Blackmaw', 'Wolfden', 'Echo', 'Dripstone', 'Grimtooth', 'Howling', 'Bonepile'], second: ['Caves', 'Caverns', 'Hollow', 'Grotto'], join: ' ' },
    rooms: { fight: 5, treasure: 1, trap: 1, quiet: 3 },
    inhabitants: [
      { creature: 'giant-rat', max: 60, regrowthPerDay: 4 },
      { creature: 'wolf', max: 20, regrowthPerDay: 1 },
      { creature: 'warg', max: 12, regrowthPerDay: 0.4 },
      { creature: 'giant-spider', max: 14, regrowthPerDay: 0.5 },
      { creature: 'cave-bear', max: 2, regrowthPerDay: 0.02 },
    ],
    treasureGold: '1d6',
    masters: [],
  },
  den: {
    id: 'den', article: true,
    names: { first: ['Boar', 'Thorn', 'Tusk', 'Red', 'Briar', 'Blood'], second: ['Warrens', 'Dens', 'Burrows', 'Tangle'], join: ' ' },
    rooms: { fight: 5, treasure: 1, trap: 1, quiet: 3 },
    inhabitants: [
      { creature: 'giant-rat', max: 40, regrowthPerDay: 3 },
      { creature: 'wolf', max: 20, regrowthPerDay: 1 },
      { creature: 'dire-boar', max: 12, regrowthPerDay: 0.5 },
      { creature: 'warg', max: 8, regrowthPerDay: 0.3 },
      { creature: 'giant-spider', max: 8, regrowthPerDay: 0.3 },
    ],
    treasureGold: '1d6',
    masters: [],
  },
  crypt: {
    id: 'crypt', article: true,
    names: { first: ['Sunken', 'Forgotten', 'Black', 'Kings’', 'Silent', 'Weeping', 'Nameless'], second: ['Barrow', 'Crypt', 'Tombs', 'Catacombs', 'Ossuary'], join: ' ' },
    rooms: { fight: 4, treasure: 2, trap: 2, quiet: 3 },
    inhabitants: [
      { creature: 'skeleton', max: 40, regrowthPerDay: 2 },
      { creature: 'zombie', max: 20, regrowthPerDay: 1 },
      { creature: 'ghoul', max: 10, regrowthPerDay: 0.4 },
      { creature: 'wraith', max: 3, regrowthPerDay: 0.05 },
    ],
    treasureGold: '2d6',
    masters: ['lich', 'revenant'],
  },
  ruin: {
    id: 'ruin', article: true,
    names: { first: ['Dungeon of', 'Ruins of', 'Halls of', 'Keep of', 'Vaults of'], second: ['Misery', 'Sorrow', 'Woe', 'the Fallen King', 'Ashes', 'Dread', 'Lost Hope'], join: ' ' },
    rooms: { fight: 4, treasure: 2, trap: 2, quiet: 3 },
    inhabitants: [
      { creature: 'giant-rat', max: 30, regrowthPerDay: 2 },
      { creature: 'skeleton', max: 30, regrowthPerDay: 1.5 },
      { creature: 'zombie', max: 15, regrowthPerDay: 1 },
      { creature: 'infernal-imp', max: 10, regrowthPerDay: 0.4 },
      { creature: 'ghoul', max: 6, regrowthPerDay: 0.2 },
      { creature: 'hellhound', max: 2, regrowthPerDay: 0.03 },
    ],
    treasureGold: '2d6',
    masters: ['lich', 'revenant', 'demon'],
  },
  rift: {
    id: 'rift', article: true,
    names: { first: ['Burning', 'Weeping', 'Screaming', 'Ember', 'Black', 'Hungering'], second: ['Rift', 'Pit', 'Chasm', 'Maw', 'Gate'], join: ' ' },
    rooms: { fight: 5, treasure: 2, trap: 1, quiet: 2 },
    inhabitants: [
      { creature: 'infernal-imp', max: 16, regrowthPerDay: 0.8 },
      { creature: 'skeleton', max: 20, regrowthPerDay: 1 },
      { creature: 'hellhound', max: 5, regrowthPerDay: 0.08 },
      { creature: 'ghoul', max: 6, regrowthPerDay: 0.2 },
    ],
    treasureGold: '3d6',
    masters: ['demon'],
  },
  troll: {
    id: 'troll', article: false,
    names: { first: ['Troll', 'Giant', 'Ogre', 'Frost', 'Stone'], second: ['gate', 'hole', 'delve', 'cleft', 'den'], join: '' },
    rooms: { fight: 5, treasure: 2, trap: 1, quiet: 2 },
    inhabitants: [
      { creature: 'giant-rat', max: 30, regrowthPerDay: 2 },
      { creature: 'wolf', max: 14, regrowthPerDay: 0.6 },
      { creature: 'warg', max: 10, regrowthPerDay: 0.3 },
      { creature: 'troll', max: 3, regrowthPerDay: 0.03 },
      { creature: 'cave-bear', max: 2, regrowthPerDay: 0.02 },
    ],
    treasureGold: '2d6',
    masters: [],
  },
} as const satisfies Record<string, DungeonTemplate>;

export type DungeonTemplateId = keyof typeof DUNGEON_TEMPLATES;
