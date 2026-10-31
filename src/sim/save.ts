import type { RngState } from './core/rng';
import type { World } from './model';

/**
 * Saves (ARCHITECTURE.md §6): the whole world as plain data, plus where every
 * random stream has got to. Loading one and carrying on gives exactly the
 * history the world would have had without the interruption.
 */

export const SAVE_FORMAT = 'ironside-dawn/world';
/** Bump when the world's shape changes in a way old saves can't be read as. */
export const SAVE_VERSION = 1;

export interface WorldSave {
  readonly format: typeof SAVE_FORMAT;
  readonly version: number;
  /** The adventurer population the world keeps topping up to. */
  readonly characterCount: number;
  /** Each random stream's state, by stream name. */
  readonly rng: Readonly<Record<string, RngState>>;
  /** The world, with its maps and sets encoded as plain data (see `encode`). */
  readonly world: unknown;
}

/**
 * Turns a value into plain JSON-safe data: maps and sets become tagged
 * objects, everything else is copied as is. Objects shared between two places
 * come back as two copies, so world state must never rely on identity.
 */
export function encode(value: unknown): unknown {
  if (value instanceof Map) {
    return { $map: [...value].map(([k, v]) => [encode(k), encode(v)]) };
  }
  if (value instanceof Set) return { $set: [...value].map(encode) };
  if (Array.isArray(value)) return value.map(encode);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encode(v);
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`Cannot save the number ${value}`);
  }
  return value;
}

/** The reverse of `encode`. */
export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('$map' in record) {
      return new Map((record.$map as [unknown, unknown][]).map(([k, v]) => [decode(k), decode(v)]));
    }
    if ('$set' in record) return new Set((record.$set as unknown[]).map(decode));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) out[k] = decode(v);
    return out;
  }
  return value;
}

export function encodeWorld(world: World): unknown {
  return encode(world);
}

export function decodeWorld(data: unknown): World {
  return decode(data) as World;
}

/** Checks that something read from a file or the database is a save this version can load. */
export function checkSave(data: unknown): WorldSave {
  const save = data as Partial<WorldSave> | null;
  if (!save || typeof save !== 'object' || save.format !== SAVE_FORMAT) {
    throw new Error('Not an Ironside Dawn world save');
  }
  if (save.version !== SAVE_VERSION) {
    throw new Error(`Saves of version ${save.version} can't be loaded (this is ${SAVE_VERSION})`);
  }
  if (!save.world || !save.rng || typeof save.characterCount !== 'number') {
    throw new Error('The save is incomplete');
  }
  return save as WorldSave;
}
