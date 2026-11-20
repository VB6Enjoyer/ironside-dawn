import { upgradeSave } from '../sim';
import type { SavedGame } from './protocol';
import { FIRST_RELEASE } from './version';

/**
 * Checks a saved game read from the browser's storage or a file, and brings
 * one made by an earlier version up to this one: the world through the
 * simulation's save migrations, and what's around it here. Throws, saying why,
 * for anything it can't load.
 */
export function upgradeSavedGame(data: unknown): SavedGame {
  const game = data as Partial<SavedGame> | null;
  if (
    !game ||
    typeof game !== 'object' ||
    typeof game.seed !== 'string' ||
    !Array.isArray(game.events)
  ) {
    throw new Error('Not an Ironside Dawn save');
  }
  return {
    ...(game as SavedGame),
    world: upgradeSave(game.world),
    madeWith: game.madeWith ?? FIRST_RELEASE,
  };
}

/** What an exported save file holds: `{ format, game }` as JSON, often gzipped. */
export const SAVE_FILE_FORMAT = 'ironside-dawn/save-file';

/**
 * The saved game in a save file's text, brought up to this version if an
 * earlier one exported it. Throws, saying why, if it can't be loaded.
 */
export function readSaveFile(text: string): SavedGame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a save file');
  }
  const wrapper = parsed as { format?: string; game?: unknown } | null;
  if (!wrapper || wrapper.format !== SAVE_FILE_FORMAT || !wrapper.game) {
    throw new Error('That file is not an Ironside Dawn save');
  }
  return upgradeSavedGame(wrapper.game);
}
