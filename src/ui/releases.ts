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
    version: '0.3.0',
    date: '2026-11-21',
    title: 'The Outlaws Update',
    intro:
      'Crime is now a living part of every world, large or small: more reasons to turn to it, more to steal, word that travels, and every way an outlaw’s story can end.',
    changes: [
      'People turn outlaw for more than want: cold ambition, a thief’s skills, outlaw friends, an old grudge. Nobody is broke from the start any more, so worlds no longer open with a rush of bandits, and every era has its outlaws.',
      'Outlaws hold up caravans, steal from shops, rob trading houses at blade point, break into houses by night, make farmers pay and spoil stores for spite. Towns feel it in their stores, and stolen goods turn up with fences far away. Now and then even someone who is no outlaw steals, when it looks safe.',
      'Word of a crime starts where it happened and travels the roads to other towns. A town that has heard of someone eyes them warily, shuts its doors, or bars them outright, as it always does a known murderer. Outlaws go where nobody has heard of them yet.',
      'Some crimes are never pinned on anyone: a robbery nobody could see clearly, a murder far from any witness. A killer may hide the body, and folk think the victim simply vanished. Old crimes can come to light years later.',
      'Every way out: pay back what you took, with interest and a fine; be killed, your head carried to a town that knows the bounty; or be taken alive by trap or takedown, escorted to town (with a chance to escape on the road), and jailed to await trial.',
      'Trials send thieves to prison for years, where some die; the rest come out to adventure again or settle down. Murderers are put to death on a set day, by their town’s custom: the noose, the sword, the axe, arrows, the chasm or stones.',
      'Life stories tell all of it: why someone turned, what they did, whom they murdered, who caught them and where they were tried, the charges and how long is left to serve, who claimed the bounty on their head, and for victims, who killed them, with what, and whether the body was ever found.',
      'Love before marriage, and children after: people fall in love and become lovers, may marry later, and are expecting for nine months or so (longer for dwarves, centaurs and elves) before a child is born.',
      'The Halls of the world add Behind Bars and The Gallows; the character card shows where word of someone’s crimes has spread and any sentence; the live log tells of every crime and how justice caught up.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-20',
    title: 'The Interface Update',
    intro:
      'A new look for watching your worlds: more room, more colour where it matters, quicker ways to get around, and a main menu to start from.',
    changes: [
      'A main menu greets you: begin a new world with a seed ready to go, continue the one you left, or load, export and import your saved worlds.',
      'The app now fills the whole window, with headlines beside the live log and a life story’s timeline beside the story. Prefer the old narrow column? Choose Compact under Display settings (⚙).',
      'Display settings also offer a light mode, three text sizes, and switches for everything below.',
      'Colour where it means something: deaths and kills in red, gold in gold, dungeons in purple, love in pink, crime in orange, magic in blue, in life stories, the Halls and the live log.',
      'The live log marks deaths, marriages and births, crime, legendary finds and more with a colour and a symbol, and the chips above it show only one kind at a time.',
      'Places open in a card beside the page, as characters do: click a place in the log or on the map to see who is there and what happened lately.',
      'Rest the pointer on a name for a quick look at who or where it is. Ctrl+click (Cmd+click on a Mac) skips the card and opens the page straight away.',
      'Show on map, on characters and places, zooms the map to them and follows travelers along the road.',
      'Skip ahead 50 or 100 years at a time, and see the living in green and the gone in red below the log.',
      'Fixed: the card beside a life story now closes, and the Trade page’s town names are links.',
    ],
  },
  {
    version: '0.1.1',
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
