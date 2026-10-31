import type { SavedGame } from '../host';

/**
 * Saved worlds in the browser's IndexedDB (ARCHITECTURE.md §6). The list of
 * saves and the saves themselves are kept apart, so listing them doesn't load
 * megabytes of world.
 */

export interface SaveInfo {
  readonly id: string;
  readonly name: string;
  /** Autosaves are made as you go, one per seed; the rest are made on purpose. */
  readonly auto: boolean;
  /** Wall-clock time of the save, in milliseconds. */
  readonly savedAt: number;
  readonly seed: string;
  /** World time when saved. */
  readonly time: number;
  readonly living: number;
}

const DB_NAME = 'ironside-dawn';
const DB_VERSION = 1;
const INFO = 'save-info';
const DATA = 'save-data';
/** Older autosaves beyond this many are deleted. */
const MAX_AUTOSAVES = 5;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INFO)) db.createObjectStore(INFO, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Could not open the save database'));
    };
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Saving failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving was aborted'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Reading saves failed'));
  });
}

export const autosaveId = (seed: string) => `auto:${seed}`;

export async function listSaves(): Promise<SaveInfo[]> {
  const db = await open();
  const all = await result(
    db.transaction(INFO).objectStore(INFO).getAll() as IDBRequest<SaveInfo[]>,
  );
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function writeSave(
  game: SavedGame,
  { auto, name }: { auto: boolean; name: string },
): Promise<SaveInfo> {
  const info: SaveInfo = {
    id: auto ? autosaveId(game.seed) : `save:${Date.now()}:${game.seed}`,
    name,
    auto,
    savedAt: Date.now(),
    seed: game.seed,
    time: game.time,
    living: game.living,
  };
  const db = await open();
  const tx = db.transaction([INFO, DATA], 'readwrite');
  tx.objectStore(INFO).put(info);
  tx.objectStore(DATA).put(game, info.id);
  await done(tx);
  if (auto) await pruneAutosaves();
  return info;
}

export async function readSave(id: string): Promise<SavedGame | null> {
  const db = await open();
  const game = await result(
    db.transaction(DATA).objectStore(DATA).get(id) as IDBRequest<SavedGame | undefined>,
  );
  return game ?? null;
}

export async function deleteSave(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([INFO, DATA], 'readwrite');
  tx.objectStore(INFO).delete(id);
  tx.objectStore(DATA).delete(id);
  await done(tx);
}

async function pruneAutosaves(): Promise<void> {
  const autos = (await listSaves()).filter((s) => s.auto);
  for (const old of autos.slice(MAX_AUTOSAVES)) await deleteSave(old.id);
}
