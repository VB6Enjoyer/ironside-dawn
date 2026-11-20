/**
 * The public notes for each release, newest first, shown under "What's new".
 * Add one with every release that changes something players see (alongside
 * CHANGELOG.md, which is for developers): a title, a line or two to introduce
 * it, and what changed, in plain words.
 */

export interface Release {
  readonly version: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly title: string;
  readonly intro: string;
  readonly changes: readonly string[];
}

export const RELEASES: readonly Release[] = [
  {
    version: '0.1.2',
    date: '2026-11-20',
    title: 'Worlds that keep',
    intro:
      'Your worlds now outlast updates. Saves made from now on, and since the first release, carry on in every newer version.',
    changes: [
      'Saved worlds and exported save files from 0.1.0 onward open in newer versions, carrying on under the new rules from where you left them.',
      'Links to a world now say which version began it. If a link comes from a version where worlds played out differently, you are told so.',
      'Each saved world under Worlds… shows the version it was begun in, and has a Copy link button for its link.',
      'The version is shown at the top of the page, with these notes behind it. They open once after each update.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-03',
    title: 'First light',
    intro:
      'The first release: a whole fantasy world, made from a seed, that lives its own history while you watch.',
    changes: [
      'Worlds of regions, towns, dungeons, fortresses and roads, drawn on a map you can pan and zoom.',
      'Adventurers who delve, fight, trade, make friends and rivals, marry, raise children, grow old and die.',
      'Town markets where nobody sets the prices, and merchants hauling goods between them.',
      'Seasons and weather, wandering creatures and raids, lords in their fortresses, and the dread lairing in the deepest dungeons.',
      'Japonic and Norse lands, with their own arms, creatures and gods, local legends born of real deaths, and Slavic lands as a content pack.',
      'Follow anyone, read their life story, and browse the chronicle, statistics, halls and places; skip ahead years at a time.',
      'Choose a new world’s size, danger, magic, peoples and population, and add content packs.',
      'Save, load, export and share worlds, here or in the desktop app for Windows, macOS and Linux.',
    ],
  },
];

const SEEN = 'ironside-dawn/seen-version';

/** Whether this version's notes are still to be shown here: once, after each update. */
export function notesUnseen(version: string): boolean {
  try {
    return localStorage.getItem(SEEN) !== version;
  } catch {
    // Without storage there's no remembering; better not to show them every time.
    return false;
  }
}

export function markNotesSeen(version: string): void {
  try {
    localStorage.setItem(SEEN, version);
  } catch {
    // Nothing to remember it in.
  }
}
