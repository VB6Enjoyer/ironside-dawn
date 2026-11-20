# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The public notes players see under "What's new" are kept in `src/ui/releases.ts`.

## [Unreleased]

### Fixed

- The character card on a life story page closes when its ✕ is pressed, instead of reopening at once (`src/ui/App.tsx`).

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
