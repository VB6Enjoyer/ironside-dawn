import { checkPack, type ContentPack } from '../content';
import slavic from '../../packs/slavic.json';

/**
 * Content packs the app knows (Phase 11): those that come with it, and any
 * added from a file, kept in this browser. Worlds name the packs they use by
 * id, so a link to a world made with a bundled pack works anywhere.
 */

export const BUNDLED_PACKS: readonly ContentPack[] = [slavic as unknown as ContentPack];

const KEY = 'ironside-dawn/content-packs';

export function storedPacks(): ContentPack[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ContentPack[]) : [];
  } catch {
    return [];
  }
}

export function availablePacks(): ContentPack[] {
  const bundled = new Set(BUNDLED_PACKS.map((p) => p.id));
  return [...BUNDLED_PACKS, ...storedPacks().filter((p) => !bundled.has(p.id))];
}

/** Checks a pack read from a file and keeps it. Throws with the reason if it isn't one. */
export function addPack(text: string): ContentPack {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  const pack = checkPack(raw);
  if (BUNDLED_PACKS.some((p) => p.id === pack.id)) {
    throw new Error(`A pack with the id "${pack.id}" comes with the app already.`);
  }
  const others = storedPacks().filter((p) => p.id !== pack.id);
  localStorage.setItem(KEY, JSON.stringify([...others, pack]));
  return pack;
}

export function removePack(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(storedPacks().filter((p) => p.id !== id)));
}

/** The packs named, in order; those this browser doesn't have are left out. */
export function packsByIds(ids: readonly string[]): ContentPack[] {
  const known = availablePacks();
  return ids.flatMap((id) => known.find((p) => p.id === id) ?? []);
}
