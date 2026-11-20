import { readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { readSaveFile } from '../host/saved-game';
import { savedGame } from '../host/views';
import { DAY } from './core/time';
import { SAVE_VERSION } from './save';
import { createSimulation } from './simulation';

/**
 * Save files exported by each release, kept so every later version is tested
 * against them: drop a new one in when a release changes the shape of saves.
 */
const FIXTURES = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(FIXTURES).filter((f: string) => /^save-.+\.json\.gz$/.test(f));

const open = (name: string) =>
  readSaveFile(gunzipSync(readFileSync(new URL(name, FIXTURES))).toString('utf8'));

describe('save files from earlier releases', () => {
  it('include one from the first release', () => {
    expect(fixtures).toContain('save-0.1.0.json.gz');
  });

  it.each(fixtures)('%s opens, carries on, and saves again', (name: string) => {
    const game = open(name);
    expect(game.world.version).toBe(SAVE_VERSION);
    expect(game.madeWith).toBeDefined();

    const sim = createSimulation({ seed: game.seed, restore: game.world, watch: 'none' });
    expect(sim.world.time).toBe(game.time);
    expect(sim.world.settings).toEqual(game.world.settings);
    const living = [...sim.world.characters.values()].filter((c) => !c.death).length;
    expect(living).toBe(game.living);

    sim.advance(sim.world.time + 10 * DAY);
    const again = savedGame(sim, game.madeWith!);
    // Carried on in this version, the world still remembers where it began.
    expect(again.madeWith).toBe(game.madeWith);
    expect(
      readSaveFile(JSON.stringify({ format: 'ironside-dawn/save-file', game: again })).time,
    ).toBe(sim.world.time);
  });

  it('say which version began a world from the first release', () => {
    expect(open('save-0.1.0.json.gz').madeWith).toBe('0.1.0');
  });

  it('read the version once called 0.1.2 as 0.1.1, as it was renumbered', () => {
    const game = open('save-0.1.0.json.gz');
    const file = JSON.stringify({
      format: 'ironside-dawn/save-file',
      game: { ...game, madeWith: '0.1.2', appVersion: '0.1.2' },
    });
    const read = readSaveFile(file);
    expect(read.madeWith).toBe('0.1.1');
    expect(read.appVersion).toBe('0.1.1');
  });

  it('refuse, saying why, what this version cannot load', () => {
    const game = open('save-0.1.0.json.gz');
    const file = (world: object) =>
      JSON.stringify({ format: 'ironside-dawn/save-file', game: { ...game, world } });
    expect(() => readSaveFile(file({ ...game.world, version: SAVE_VERSION + 1 }))).toThrow(
      /newer version/,
    );
    expect(() => readSaveFile(file({ ...game.world, version: 5 }))).toThrow(/before 0\.1\.0/);
    expect(() => readSaveFile('{"format":"something else"}')).toThrow(/not an Ironside Dawn save/);
  });
});
