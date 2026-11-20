# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Changes before this file was started are described phase by phase in `docs/ROADMAP.md`.

## [Unreleased]

### Added

- `CHANGELOG.md`, and a PR template (`.github/pull_request_template.md`) organized by the same categories.
- CI checks that every commit in a PR follows Conventional Commits (`.github/workflows/commitlint.yml`) and that a PR adds a changelog entry unless labeled `skip-changelog` (`.github/workflows/changelog.yml`).
- `npm run lint:commits`, to check this branch's commits locally.

- Saves and exported save files from 0.1.0 onward keep loading in newer versions, brought up to date as they open (`src/sim/save.ts`, `src/host/saved-game.ts`). Saves now record which version wrote them and which version began their world.

### Changed

- The PR title check (`.github/workflows/pr-title.yml`) lists the allowed types, requires a lowercase subject without a trailing period, and re-runs when a PR is reopened.

[Unreleased]: https://github.com/VB6Enjoyer/ironside-dawn/compare/d724dfc...HEAD
