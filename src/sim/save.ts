import type { RngState } from './core/rng';
import type { ContentPack } from '../content';
import type { World, WorldSettings } from './model';

/**
 * Saves (ARCHITECTURE.md §6): the whole world as plain data, plus where every
 * random stream has got to. Loading one and carrying on gives exactly the
 * history the world would have had without the interruption.
 */

export const SAVE_FORMAT = 'ironside-dawn/world';
/** Bump when the world's shape changes in a way old saves can't be read as. */
export const SAVE_VERSION = 7;

export interface WorldSave {
  readonly format: typeof SAVE_FORMAT;
  readonly version: number;
  /** The adventurer population the world keeps topping up to. */
  readonly characterCount: number;
  /** What was chosen when the world was created, so a link to it can say so. */
  readonly settings: WorldSettings;
  /** Content packs the world was made with, installed again before it is loaded. */
  readonly packs: readonly ContentPack[];
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

/** The oldest save version this one still loads: that of 0.1.0, the first release. */
export const OLDEST_SAVE_VERSION = 6;

type SaveData = Record<string, unknown> & { version: number };

/**
 * Steps that bring a save up one version, keyed by the version each starts
 * from. A release that changes the shape of saves bumps `SAVE_VERSION` and adds
 * the step from the version before, filling in anything new with a sensible
 * default, so that every save since 0.1.0 keeps loading. A saved world carries
 * on under the new version's rules from where it was. Saves kept from each
 * release (`src/sim/fixtures`) test this.
 */
const MIGRATIONS: Readonly<Record<number, (save: SaveData) => Record<string, unknown>>> = {
  6: toCrimesThatTravel,
};

type Encoded = Record<string, unknown>;

/**
 * 0.3.0: crimes are recorded, and towns know of them as word travels. Before,
 * a crime lowered someone's standing in every town at once; that is carried
 * over as what each town has heard, and standing keeps only good deeds.
 */
function toCrimesThatTravel(save: SaveData): Record<string, unknown> {
  const world = save.world as Encoded;
  const characters = (world.characters as { $map: [unknown, Encoded][] }).$map;
  for (const [, c] of characters) {
    const outlaw = c.outlaw as { crimes: number; murders: number } | null;
    const reputation = (c.reputation ?? {}) as Record<string, number>;
    const notoriety: Record<string, unknown> = {};
    const good: Record<string, number> = {};
    for (const [town, standing] of Object.entries(reputation)) {
      if (standing > 0) good[town] = standing;
      if (standing >= 0) continue;
      notoriety[town] = {
        heat: -standing * 6,
        crimes: outlaw?.crimes ?? 1,
        murders: outlaw?.murders ?? 0,
        value: 0,
        heardAt: world.time,
      };
    }
    c.reputation = good;
    c.notoriety = notoriety;
    c.crimes = [];
    c.stolenFrom = [];
    c.heads = [];
  }
  return { ...save, world: { ...world, news: [], unsolved: [] } };
}

/**
 * Checks that something read from a file or the database is a world save, and
 * brings one made by an earlier version up to this one. Throws, saying why, for
 * anything it can't load.
 */
export function upgradeSave(data: unknown): WorldSave {
  const read = data as SaveData | null;
  if (!read || typeof read !== 'object' || read.format !== SAVE_FORMAT) {
    throw new Error('Not an Ironside Dawn world save');
  }
  let save: SaveData = read;
  if (typeof save.version !== 'number' || save.version > SAVE_VERSION) {
    throw new Error(
      `This save was made by a newer version of Ironside Dawn (save version ${String(save.version)}); update to load it`,
    );
  }
  if (save.version < OLDEST_SAVE_VERSION) {
    throw new Error(
      `This save is from a test version before 0.1.0 (save version ${save.version}) and can't be loaded`,
    );
  }
  while (save.version < SAVE_VERSION) {
    const step: ((save: SaveData) => Record<string, unknown>) | undefined =
      MIGRATIONS[save.version];
    if (!step) throw new Error(`No way to bring a save of version ${save.version} up to date`);
    save = { ...step(save), version: save.version + 1 };
  }
  if (!save.world || !save.rng || typeof save.characterCount !== 'number') {
    throw new Error('The save is incomplete');
  }
  return save as unknown as WorldSave;
}
