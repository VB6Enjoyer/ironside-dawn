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

Phase 6 (The Observatory) is done. The world runs in a Web Worker. Follow
anyone and watch their fights blow by blow, read their life story, look in on
any place, search the living and the dead, and browse the chronicle, the
statistics and the halls of heroes, the fallen and the wanted. Skip ahead
years at a time and read a digest of what happened. Worlds are saved as you
watch and can be exported, imported and shared by seed. Phases 1 to 5 built
the world itself: travel, dungeons, growth and magic, minds, bonds, languages
and outlaws. Phase 7 (Markets) is next. The plan is in:

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

## Project layout

```
src/sim/      Simulation core. No DOM, no React, no Math.random (lint-enforced).
src/content/  Data tables: species, creatures, items, names…
src/text/     Turns events into prose. No DOM; shared by the UI and the CLI.
src/host/     Runs the simulation in a Web Worker for the UI: speeds, skips, queries.
src/ui/       React app.
tools/        Headless tools, such as the sim CLI.
docs/         Roadmap, world design and architecture.
```
