# Ironside Dawn

> _Working title — subject to change._

**Ironside Dawn is a fantasy world simulation you watch rather than play.**

The setting is medieval low fantasy. Many peoples (humans, elves, dwarves,
centaurs, demons, undead) mostly keep to their own lands, and magic is rare
and always costs the caster something.

You open it and a world is already running: adventurers set out from towns,
delve into dungeons, fight monsters, loot, trade, level up, make friends and
enemies, fall in love, retire, have children, and die. Nothing is scripted.
Everything comes from simple probabilistic rules applied to many independent
characters, and you get to see what grows out of them.

```
[Y1 · Day 12 · 09:00]  Rufus Ironclaw leaves Concordale, heading for the Dungeon of Misery.
[Y1 · Day 12 · 15:00]  Rufus Ironclaw enters the Dungeon of Misery.
[Y1 · Day 12 · 15:20]  Rufus Ironclaw engages an Infernal Imp in battle.
[Y1 · Day 12 · 15:22]  Rufus Ironclaw slays the Infernal Imp and loots 14 gold and a Cracked Ember.
[Y1 · Day 12 · 16:05]  Rufus Ironclaw is ambushed by a Gorefang Warg pack (3) and flees, badly wounded.
```

The goal is a god's-eye observatory. You get a live chronicle of the world, and
you can follow a single character, open their profile and history, inspect a
town's market, or watch a dungeon's population change over time.

## Status

Phase 11 (Scale & Ship), the last of the plan, is built; the final name is
still to be chosen. A new world can be made small, medium or large, gentle or
deadly, with magic rare or common, with only some peoples, and with a cap on
how many may live at once. Content
packs, JSON files of creatures, arms, spells, dungeons and whole cultures, can
be added from a file (`packs/slavic.json` brings Slavic lands, with leshies,
rusalki and the volkhvy of Perun). A thousand people run smoothly in the
browser, and the same build is a desktop app for Windows, macOS and Linux.

Phase 10 (Cultures & Myths) is done. Regions can belong to a culture drawn
from real-world mythology, so far Japonic and Norse: ronin with naginata
fight kappa at the river crossings, dvergr huscarls face draugar in the
barrows, folk pray to Inari or Thor, and anything that keeps killing at a
place becomes a legend the locals tell and fear. Each region has its own page.

Phase 9 (A Living World) is done. Every seed makes its own world: regions
of forest, mountain, steppe and waste, each people's towns in its homeland,
dungeons, fortresses and the roads between them, drawn on a map you can pan
and zoom. Weather turns with the seasons; creatures spill out of crowded
dungeons and raid towns; lords hold the lands around their fortresses; and
liches, revenants and demon lords lair in the deepest dungeons, growing
infamous until someone brings them down.

Before that, Phase 8 (Generations) made lives run from birth to old age, with
marriages, children, heirs and legends; Phase 7 (Markets) gave each town a
daily market where nobody sets the prices, and merchants to haul goods
between them; and Phase 6 made it an observatory: follow anyone, read life
stories, browse the chronicle, statistics and halls, skip years at a time,
and save, load and share worlds. The plan is in:

- [`docs/ROADMAP.md`](docs/ROADMAP.md): the phased development plan, with exit
  criteria for each milestone.
- [`docs/WORLD.md`](docs/WORLD.md): the setting bible (peoples, morality,
  magic, languages, and mythology-inspired cultures).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): tech stack, simulation design,
  and the reasoning behind each choice.

## Running it

Requires Node.js 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

| Command                             | What it does                                                  |
| ----------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                       | Start the dev server                                          |
| `npm run sim -- --seed 42 --days 7` | Run a world headless: its log, then a world report (`--help`) |
| `npm test`                          | Run the tests                                                 |
| `npm run check`                     | Typecheck, lint, format check and tests, as CI does           |
| `npm run build`                     | Production build into `dist/`                                 |
| `npm run format`                    | Format everything with Prettier                               |
| `npm run tauri dev`                 | Run the desktop app (needs Rust; see below)                   |
| `npm run tauri build`               | Build desktop installers into `src-tauri/target/release/`     |

### The desktop app

The desktop app is a [Tauri](https://tauri.app) window around the same web
build, so it behaves as the browser does, saves included. Building it needs
[Rust](https://rustup.rs) and, on Linux, the WebKitGTK libraries (on Debian or
Ubuntu: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`).
The **Desktop** workflow in GitHub Actions builds installers for all three
systems: run it by hand from the Actions tab, or push a tag like `v0.1.0` to
attach them to a draft release. Set the repository variable `SHARE_URL` to the
hosted site's address so the app's links to a world point there.

### Content packs

A content pack is a JSON file that adds creatures, loot, arms, spells, dungeon
kinds and cultures; see `packs/slavic.json` and `ARCHITECTURE.md` §4.13. Add
one under **Worlds… → Settings → Content packs**, or headless with
`npm run sim -- --pack packs/slavic.json`. A pack is checked whole before
anything goes in, and refused with the reason if anything in it is wrong.

## Project layout

```
src/sim/      Simulation core. No DOM, no React, no Math.random (lint-enforced).
src/content/  Data tables: species, creatures, items, names…
src/text/     Turns events into prose. No DOM; shared by the UI and the CLI.
src/host/     Runs the simulation in a Web Worker for the UI: speeds, skips, queries.
src/ui/       React app.
src-tauri/    The desktop app (Tauri).
packs/        Example content packs.
tools/        Headless tools, such as the sim CLI.
docs/         Roadmap, world design and architecture.
```
