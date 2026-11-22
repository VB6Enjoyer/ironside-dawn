# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The public notes players see under "What's new" are kept in `src/ui/releases.ts`.

## [Unreleased]

### Added

- Spell kills get their own line (`src/sim/systems/combat.ts`, `src/text/describe.ts`): the log says when a spell deals the killing blow, and felling a strong creature (a troll, a jotunn, an oni) with one is now _Notable_, so it shows at Day speed and up and reaches the chronicle. Someone killed by a spell is "struck down … with an Ember Bolt" in the log, and their life story names the spell (`src/text/biography.ts`).

### Changed

- A spell that backlashes is its own event (`magic.backlash` in `src/sim/model/events.ts`), shown with the Magic tint, so it can be filtered and counted apart from ordinary casts.
- Learning a spell is now _Notable_, so it reaches the chronicle.
- Worlds turn out differently from their seed than in 0.3.1 (`src/host/version.ts`), so links from 0.3.1 open with a note that history differs.

## [0.3.1] - 2026-11-22

### Added

- Love comes before marriage, and children after conception (`src/sim/systems/social.ts`, `src/sim/systems/lifecycle.ts`): two who love each other fall in love and become lovers, and lovers may later marry. A couple conceive only on days they are together, and the live feed says when they are expecting; the child is born a gestation later, by their people (nine months for humans, longer for dwarves, centaurs and elves). Unwed lovers can have children too, less often. Life stories tell whom someone fell in love with and whether they married, and the character card shows a beloved and a child on the way (`src/text/biography.ts`, `src/ui/components/CharacterCard.tsx`).

### Changed

- Worlds turn out differently from their seed than in 0.3.0 (`src/host/version.ts`), so links from 0.3.0 open with a note that history differs.

### Fixed

- A captive was handed over and sentenced within a minute of being caught in a town (`src/sim/systems/justice.ts`). The hand-over at the watch-house now takes a few hours, and the prisoner is locked up to await trial, which comes three to ten days later when the court sits mid-morning. The live feed tells of it, and Behind Bars, the character card and life stories show those awaiting trial.

## [0.3.0] - 2026-11-21

### Added

- `npm run audit:crime`, a headless crime audit over several worlds (`tools/crime-audit.ts`): who turns outlaw and when, crimes by kind and how they spread across outlaws, how careers end, how often adventurers are broke, against the targets of the Outlaws Update.
- More ways into crime than being broke (`src/sim/systems/outlaws.ts`): rarely, an adventurer who isn't broke is tempted, but only with a good reason, such as cold ambition, a thief's skills, outlaw friends or a vivid grudge, and never the honorable and kind. The log and life stories say why each outlaw turned (`src/text/describe.ts`, `src/text/biography.ts`).
- Cruel outlaws sometimes fall on their victims without a word instead of demanding their purse.
- Crimes against the nameless (`src/sim/systems/crime.ts`): outlaws hold up caravans on the roads, steal from shops and rob trading houses at blade point, break into houses by night, make farmers pay and spoil stores for spite. What they take comes out of the town's trading house and trades, and stolen goods are sold to fences in other towns. The live feed tells of each crime, and life stories say what kinds of crime someone committed.
- Now and then someone who is no outlaw steals, when they have a reason to be tempted and it looks safe and worth it. A thief caught at it pays a fine on the spot, or is outlawed if they can't.
- Word of a crime travels (`src/sim/systems/notoriety.ts`): it is known first where it happened and reaches other towns along the roads days later; the farthest never hear of petty crimes. What a town has heard sets how it treats someone: _suspected_ (worse prices, kept at arm's length), _unwelcome_ (no inn, no trade) or _barred_ (turned away at the gate, always so for a known murderer). Petty crimes are forgotten over the years.
- The character card lists the towns where word of someone's crimes has got about, and how each treats them (`src/ui/components/CharacterCard.tsx`).
- Restitution (`src/sim/systems/justice.ts`): an outlaw with no blood on their hands who has tired of the life can pay back what they took in every town that knows of it, with interest and a fine, to clear their name and lift the bounty. The towns still eye them warily until time earns their trust back.
- Bounties are paid in town: whoever kills an outlaw takes the head and must carry it to a town that has heard of them, where the reward is split with their party. A head carried too long is lost, and the bounty with it.
- Outlaws can be taken alive: a hunter with the craft may lay a trap where the outlaw lurks, or try a takedown once the outlaw is badly hurt in a fight. Either can fail, and a failed takedown can wound or kill the hunter. A live capture pays two and a half times the bounty. The captive is stripped of gold and gear and led to the nearest town that would pay, and may escape on the road, leaving what was taken from them with the captors. Delivered, they stand trial.
- Trials (`src/sim/systems/justice.ts`): an outlaw brought in alive is tried on what any town knows of them. A known murderer is sentenced to death, and put to death a few days later before a crowd. Anyone else goes to prison for a year or more, longer for more crimes and more taken (fifteen years at most). A prisoner a murder is later pinned on is tried again, for their life. Prisoners can die behind bars; freed, they are no longer outlaws, the towns still eye them for a while, and they go back to adventuring or settle down in town.
- Crimes can go unheard of (`src/sim/systems/notoriety.ts`, `src/sim/systems/outlaws.ts`). Whether anyone can name the culprit of a robbery or murder depends on how many saw it, how well they knew the culprit, and where it happened (a town, the wilds, a dungeon); stealthy outlaws slip by more often, though most crimes are still pinned on someone. A murder with no witnesses is pinned on its killer only months or years later, if ever, and the killer may hide the body, so that as far as anyone knows the victim simply vanished. The live feed shows every crime as it happens, and says when nobody could tell who did it.
- Life stories tell the whole of someone's dealings with justice, kept on the character so they never fade from the record (`src/text/biography.ts`, `src/sim/model/crime.ts`): when they turned outlaw (each time), whom they murdered and whose bodies they hid, going straight at a town's court and what it cost, who took them alive and where, escapes, who handed them over and for how much, where they were tried, on what charges, and the sentence (with the years left for someone still inside), release, and who took their head and who claimed the bounty on it (or that it was lost). A murder victim's story says who murdered them and with what, and whether the body was found or hidden (folk taking them for vanished, or gone to distant lands), and when word got out of who did it. The character card and Behind Bars show the charges.
- Towns put murderers to death by their own custom (`src/sim/systems/justice.ts`): hanging by default, beheading by sword in the Japonic lands, the axe in the Norse north, arrows among the elves, the chasm under the dwarven halls, stoning on the steppe. The live feed, life stories and the Gallows say which.
- The Halls of the world gain **Behind Bars** (prisoners and the condemned, with their sentences) and **The Gallows** (those put to death); the Graveyard notes bodies never found; the character card shows a prisoner's sentence (`src/ui/pages/HallsPage.tsx`, `src/host/views.ts`, `src/ui/components/CharacterCard.tsx`).
- The live feed tells of heads taken and claimed, traps and takedowns, escapes, sentences, executions, deaths in prison, releases, hidden bodies and old crimes coming to light; life stories tell of being taken alive, tried, jailed, put to death or escaping, of restitution paid, and of bodies never found; the character card shows a head carried or a captive led (`src/text/describe.ts`, `src/text/biography.ts`, `src/ui/components/CharacterCard.tsx`).
- The crime audit counts crimes against the nameless by kind, crimes by people who are no outlaws, what the towns lost and fences paid, how word spread, bounties paid, heads lost, capture tries, escapes, sentences, executions and deaths in prison, crimes that went unnamed, hidden or pinned later, and how long outlaw careers last, how they end and what becomes of murderers, against the targets of the Outlaws Update.

### Changed

- Adventurers start with 40–67 gold instead of 7–17 (`src/sim/gen/people.ts`), so new worlds no longer open with a burst of outlaws.
- Being broke turns someone outlaw only after ten days of hardship with nothing left to sell, and sooner after a run of near deaths and flights.
- An outlaw who goes straight isn't tempted again for three years.
- Saves move to save version 7 (`src/sim/save.ts`). Older saves still load, and the old standing in every town becomes what each town has heard of someone's crimes.
- A crime no longer lowers someone's standing in every town at once; towns hear of it as word travels. Standing (`reputation`) now records only good deeds.
- Known outlaws are shunned only where their crimes are known: an outlaw nobody has heard of can make friends like anyone else. Honest folk won't team up with, or answer the call of, someone their town has heard of, and bounty hunters only chase outlaws their own town has posters up for (`src/sim/systems/social.ts`, `src/sim/systems/decide.ts`).
- Outlaws favour towns that haven't heard of them yet, and lie low for a few days after each crime (`src/sim/systems/decide.ts`).
- Crime is balanced so careers end within a few years and no outlaw runs for decades (`src/sim/systems/justice.ts`, `src/sim/systems/outlaws.ts`, `src/sim/systems/decide.ts`):
  - A bounty of 200 gold or more raises a posse: hunters setting out call the able in town to ride along, and weigh the hunt with them.
  - Hunters who find their quarry gone may pick up a fresh trail to somewhere near, and a hunted outlaw finds it harder to slip away from a fight (`src/sim/systems/combat-core.ts`).
  - An outlaw long on the road, whom the towns have shut out (or a murderer, who can buy no pardon), may flee for distant lands with a price on their head; one nobody knows of may simply give it up.
  - Rich outlaws lurk by the road less: each haul matters less to a full purse.
  - Going straight takes at least a year on the road and half a year without a crime.
  - Temptation comes a little more often, and more easily still when no outlaw is at large, so every era has its outlaws.
- Killing an outlaw no longer pays the bounty on the spot (`src/sim/systems/outlaws.ts`). Bounties stop growing at 300 gold, and 150 more for each murder.
- Going straight now takes paying restitution, and is no longer open to murderers; it used to cost half one's purse, paid to one's home town.
- A murder's death now records the killer's weapon and that it was murder, and the live feed says "murdered by" (`src/sim/systems/combat.ts`).
- Worlds now turn out differently from their seed than in 0.2.0, so links from 0.2.0 open with a note that history differs. Worlds begun now are stamped with the coming version, 0.3.0 (`src/host/version.ts`).

## [0.2.0] - 2026-11-20

### Added

- **Skip ahead** offers 50 and 100 years (`src/ui/components/Controls.tsx`). Like any skip, it can be stopped partway.
- A light mode under Display settings (**Theme**), in dark ink on parchment; dark stays the default (`src/ui/styles.css`, `src/ui/display.ts`). Every colour has a light counterpart that keeps its meaning and stays readable.
- The status bar under the log counts the living in green and the gone in red (`src/ui/components/StatusBar.tsx`).
- A main menu, which the bare address opens to: begin a new world (with a random seed ready), **Continue** with the world last saved, or load, export, delete and import saved worlds (`src/ui/pages/MainMenu.tsx`). **Worlds…** keeps the same parts, and a **Main menu** button that saves the world and leaves it (`src/ui/components/worlds.tsx`).
- A **Display settings** panel (⚙ in the header) with a choice of text size, kept in this browser (`src/ui/display.ts`, `src/ui/components/DisplaySettings.tsx`). The one animation in the app stops for those whose system asks for reduced motion.
- A full-width layout, now the default: the app uses the whole window, and wide screens get side columns, with headlines beside the live log and a life story's timeline beside the story (`src/ui/styles.css`, `src/ui/pages/LogPage.tsx`, `src/ui/pages/ProfilePage.tsx`). The narrow single column stays as the **Compact** layout under Display settings.
- Colour cues for what things are about, the same everywhere: red for deaths and kills, gold for wealth, purple for dungeons, pink for love, orange for crime, blue for magic. Life stories colour their figures (`src/text/biography.ts`), as do the character card and the Halls; **Colour cues** under Display settings turns them off.
- The live log tints the events that stand out, each with its colour and a symbol: deaths (✝), marriages and births (♥), crime and bounties (⚖), legendary finds and inheritances (◆), the dread rising (▼) and spells learned (✶) (`src/text/categories.ts`, `src/ui/components/EventLog.tsx`). Chips above the log name them and show only one kind when pressed.
- Ctrl+click (Cmd+click on a Mac) on a character's name opens their life story straight away, without the card. **Clicking a name** under Display settings swaps it, so a plain click opens the life story and Ctrl/Cmd+click the card (`src/ui/App.tsx`, `src/ui/display.ts`).
- Resting the pointer on a character's or place's name (or tabbing to it) shows a glance: who they are, what they're doing and their health, or what a place is and who is there (`src/ui/components/HoverPreview.tsx`). **Previews on hover** under Display settings turns them off.
- Places open in a card too, in the side column like a character's: clicking a place in the log, on the map or anywhere else shows what it is, who holds or haunts it, who is there and what happened lately, with buttons for its page and the map (`src/ui/components/PlaceCard.tsx`). Ctrl/Cmd+click opens its page straight away, and **Clicking a name** under Display settings covers places as well as characters.
- **Show on map** on a character's card and life story, and on a place's page: the map zooms to them and rings them, keeping a traveler in view as they go, and says where they are (`src/ui/map/stage.ts`, `src/ui/pages/MapPage.tsx`). Someone in a party is shown with their leader, the dead where they fell. The map has its own address for it (`#/map/character/…`, `#/map/place/…`), so Back works and it can be linked.

### Changed

- The release that went out as 0.1.2 is numbered 0.1.1, since no 0.1.1 was ever released. Saves and links stamped 0.1.2 are read as 0.1.1 (`src/host/version.ts`).
- Desktop installers are built for Windows and Linux only (`.github/workflows/desktop.yml`): macOS won't open an app that isn't signed with a paid Apple developer certificate.
- The log's timestamps take the same width whatever the day, so its text lines up.
- Opening the app with no world named shows the main menu, instead of carrying on the last world watched (`src/ui/App.tsx`).

### Fixed

- The world map's lands and their names show on every computer: they are drawn as shapes rather than a painted image, which some browsers and graphics drivers failed to show, and if drawing them ever fails the map tries again (`src/ui/map/stage.ts`, `src/ui/map/voronoi.ts`).
- The character card on a life story page closes when its ✕ is pressed, instead of reopening at once (`src/ui/App.tsx`).
- Place names on the Trade page link to their pages: where each merchant is or is bound, the caravans on the road, and the roads in trouble (`src/ui/pages/TradePage.tsx`).

## [0.1.1] - 2026-11-20

### Added

- Saves and exported save files from 0.1.0 onward keep loading in newer versions, brought up to date as they open (`src/sim/save.ts`, `src/host/saved-game.ts`). Saves now record which version wrote them and which version began their world.
- Links to a world carry the version it was begun in (`v=` in the address, `src/ui/seed.ts`), and opening one from a version whose worlds play out differently says so. Each saved world under **Worlds…** has a **Copy link** button for its stamped link, and shows the version it was begun in.
- The version is shown at the top of the page, opening public release notes, "What's new" (`src/ui/releases.ts`, `src/ui/components/WhatsNew.tsx`). They also open once by themselves after each update.
- `CHANGELOG.md`, and a PR template (`.github/pull_request_template.md`) organized by the same categories.
- CI checks that every commit in a PR follows Conventional Commits (`.github/workflows/commitlint.yml`) and that a PR adds a changelog entry unless labeled `skip-changelog` (`.github/workflows/changelog.yml`).
- `npm run lint:commits`, to check this branch's commits locally.

### Changed

- The app is versioned from `package.json`, which the desktop app now reads its version from too (`src-tauri/tauri.conf.json`).
- The PR title check (`.github/workflows/pr-title.yml`) lists the allowed types, requires a lowercase subject without a trailing period, and re-runs when a PR is reopened.

## [0.1.0] - 2026-11-03

### Added

- The first release: procedural worlds with their people, markets, generations, cultures and myths; the observatory to watch them; world settings, content packs, saves and links; and the desktop app. How it was built is told phase by phase in `docs/ROADMAP.md`.

[Unreleased]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/VB6Enjoyer/ironside-dawn/releases/tag/v0.1.0
