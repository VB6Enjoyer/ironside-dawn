## Overview

Ironside Dawn: an observer-only fantasy world simulation. TypeScript, React and Vite;
the simulation runs in a Web Worker (`src/sim` has no DOM), with a Tauri desktop build in
`src-tauri/`. Design and plan: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.

## Commands

- Install: `npm install`
- Everything CI checks (typecheck, lint, format, tests): `npm run check`
- Build: `npm run build`
- Headless run: `npm run sim -- --seed 42 --days 7`
- Lint commits: `npm run lint:commits`

## Git commits and PRs

- Use Conventional Commits: `type(scope): short description`, imperative mood, lowercase, no trailing period.
- Types: feat, fix, docs, refactor, perf, test, build, ci, chore, revert. Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.
- Never add Co-Authored-By, "Generated with Claude Code", session links, or any other AI attribution to commits or PR descriptions.
- PR titles follow the same Conventional Commits format.
- Keep PRs small and single-purpose; one logical change per commit. Don't touch unrelated files.
- Run tests and lint before pushing.

## Changelog (Keep a Changelog 1.1.0)

- Every user-visible change adds an entry to `CHANGELOG.md` under `## [Unreleased]`, in the same PR.
- Group entries under `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`. Omit empty groups.
- Write entries for humans: short, present tense, saying what changed for the user and naming the file/module/endpoint affected so it's easy to locate. Not a copy of the commit message.
- Mark breaking changes in the entry (`**BREAKING:**`) and with `!` in the PR title.
- Pure internal changes (CI, formatting, refactors with no behavior change) may skip the entry; apply the `skip-changelog` label.
- Never edit released version sections. Releases move `[Unreleased]` entries under a new `## [x.y.z] - YYYY-MM-DD` heading and update the compare links at the bottom.

## PR descriptions

- Follow `.github/pull_request_template.md`: Summary, Changes (same Keep a Changelog categories, each entry naming where it happened), Testing, Breaking changes.
- Describe what changed and why, and how it was verified. No filler.

## Boundaries

- Never commit secrets or `.env` files.
- Ask before adding dependencies or changing CI workflows.
