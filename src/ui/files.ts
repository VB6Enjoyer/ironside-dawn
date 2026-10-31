import { checkSave } from '../sim';
import type { SavedGame } from '../host';

/** Save files: a world as JSON, gzipped where the browser can. */

const FILE_FORMAT = 'ironside-dawn/save-file';

export async function exportSave(game: SavedGame, fileName: string): Promise<void> {
  const json = JSON.stringify({ format: FILE_FORMAT, game });
  let blob = new Blob([json], { type: 'application/json' });
  let name = `${fileName}.json`;
  if (typeof CompressionStream !== 'undefined') {
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    blob = await new Response(stream).blob();
    name += '.gz';
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function importSave(file: File): Promise<SavedGame> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzipped = head[0] === 0x1f && head[1] === 0x8b;
  let text: string;
  if (gzipped) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot open compressed save files');
    }
    text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    text = await file.text();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a save file');
  }
  const wrapper = parsed as { format?: string; game?: SavedGame } | null;
  if (!wrapper || wrapper.format !== FILE_FORMAT || !wrapper.game) {
    throw new Error('That file is not an Ironside Dawn save');
  }
  checkSave(wrapper.game.world);
  return wrapper.game;
}
