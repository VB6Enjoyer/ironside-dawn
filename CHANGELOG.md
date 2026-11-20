# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The public notes players see under "What's new" are kept in `src/ui/releases.ts`.

## [Unreleased]

### Added

- A **Display settings** panel (⚙ in the header) with a choice of text size, kept in this browser (`src/ui/display.ts`, `src/ui/components/DisplaySettings.tsx`). The one animation in the app stops for those whose system asks for reduced motion.
- A full-width layout, now the default: the app uses the whole window, and wide screens get side columns, with headlines beside the live log and a life story's timeline beside the story (`src/ui/styles.css`, `src/ui/pages/LogPage.tsx`, `src/ui/pages/ProfilePage.tsx`). The narrow single column stays as the **Compact** layout under Display settings.
- Colour cues for what things are about, the same everywhere: red for deaths and kills, gold for wealth, purple for dungeons, pink for love, orange for crime, blue for magic. Life stories colour their figures (`src/text/biography.ts`), as do the character card and the Halls; **Colour cues** under Display settings turns them off.
- The live log tints the events that stand out, each with its colour and a symbol: deaths (✝), marriages and births (♥), crime and bounties (⚖), legendary finds and inheritances (◆), the dread rising (▼) and spells learned (✶) (`src/text/categories.ts`, `src/ui/components/EventLog.tsx`). Chips above the log name them and show only one kind when pressed.
- Ctrl+click (Cmd+click on a Mac) on a character's name opens their life story straight away, without the card. **Clicking a name** under Display settings swaps it, so a plain click opens the life story and Ctrl/Cmd+click the card (`src/ui/App.tsx`, `src/ui/display.ts`).
- Resting the pointer on a character's or place's name (or tabbing to it) shows a glance: who they are, what they're doing and their health, or what a place is and who is there (`src/ui/components/HoverPreview.tsx`). **Previews on hover** under Display settings turns them off.
- **Show on map** on a character's card and life story, and on a place's page: the map zooms to them and rings them, keeping a traveler in view as they go, and says where they are (`src/ui/map/stage.ts`, `src/ui/pages/MapPage.tsx`). Someone in a party is shown with their leader, the dead where they fell. The map has its own address for it (`#/map/character/…`, `#/map/place/…`), so Back works and it can be linked.

### Changed

- The log's timestamps take the same width whatever the day, so its text lines up.

### Fixed

- The character card on a life story page closes when its ✕ is pressed, instead of reopening at once (`src/ui/App.tsx`).
- Place names on the Trade page link to their pages: where each merchant is or is bound, the caravans on the road, and the roads in trouble (`src/ui/pages/TradePage.tsx`).

## [0.1.2] - 2026-11-20

### Added

- Saves and exported save files from 0.1.0 onward keep loading in newer versions, brought up to date as they open (`src/sim/save.ts`, `src/host/saved-game.ts`). Saves now record which version wrote them and which version began their world.
- Links to a world carry the version it was begun in (`v=` in the address, `src/ui/seed.ts`), and opening one from a version whose worlds play out differently says so. Each saved world under **Worlds…** has a **Copy link** button for its stamped link, and shows the version it was begun in.
- The version is shown at the top of the page, opening public release notes, "What's new" (`src/ui/releases.ts`, `src/ui/components/WhatsNew.tsx`). They also open once by themselves after each update.

### Changed

- The app is versioned from `package.json`, which the desktop app now reads its version from too (`src-tauri/tauri.conf.json`).

## [0.1.1] - 2026-11-20

### Added

- `CHANGELOG.md`, and a PR template (`.github/pull_request_template.md`) organized by the same categories.
- CI checks that every commit in a PR follows Conventional Commits (`.github/workflows/commitlint.yml`) and that a PR adds a changelog entry unless labeled `skip-changelog` (`.github/workflows/changelog.yml`).
- `npm run lint:commits`, to check this branch's commits locally.

### Changed

- The PR title check (`.github/workflows/pr-title.yml`) lists the allowed types, requires a lowercase subject without a trailing period, and re-runs when a PR is reopened.

## [0.1.0] - 2026-11-03

### Added

- The first release: procedural worlds with their people, markets, generations, cultures and myths; the observatory to watch them; world settings, content packs, saves and links; and the desktop app. How it was built is told phase by phase in `docs/ROADMAP.md`.

[Unreleased]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/VB6Enjoyer/ironside-dawn/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/VB6Enjoyer/ironside-dawn/releases/tag/v0.1.0
