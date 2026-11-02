import { PEOPLES, type PeopleId } from '../content';
import type { WorldSettings } from '../sim';

/**
 * The world seed, size, settings and content packs live in the URL
 * (`?seed=42&n=100&danger=deadly&packs=slavic`) so a world can be shared or
 * reloaded.
 */

export interface WorldSpec {
  readonly seed: string;
  readonly characterCount: number;
  /** Choices made for the world; anything left out is the default. */
  readonly settings: Partial<WorldSettings>;
  /** Ids of the content packs the world is made with. */
  readonly packs: readonly string[];
}

export const DEFAULT_CHARACTER_COUNT = 20;
export const CHARACTER_COUNTS = [20, 50, 100, 200, 500, 1000] as const;

const SIZES = ['small', 'medium', 'large'] as const;
const DANGERS = ['gentle', 'normal', 'deadly'] as const;
const MAGICS = ['rare', 'normal', 'common'] as const;

/** Reads the settings from URL parameters, ignoring anything it doesn't recognize. */
export function settingsFrom(params: URLSearchParams): Partial<WorldSettings> {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : undefined;
  };
  const size = pick('size', SIZES);
  const danger = pick('danger', DANGERS);
  const magic = pick('magic', MAGICS);
  const peoples = params
    .get('peoples')
    ?.split(',')
    .filter((p): p is PeopleId => (PEOPLES as readonly string[]).includes(p));
  const cap = Number(params.get('cap'));
  return {
    ...(size ? { size } : {}),
    ...(danger ? { danger } : {}),
    ...(magic ? { magic } : {}),
    ...(peoples && peoples.length > 0 ? { peoples: withHumans(peoples) } : {}),
    ...(Number.isSafeInteger(cap) && cap > 0 ? { populationCap: cap } : {}),
  };
}

/** Humans live in every world. */
export function withHumans(peoples: readonly PeopleId[]): PeopleId[] {
  return PEOPLES.filter((p) => p === 'human' || peoples.includes(p));
}

function writeSettings(params: URLSearchParams, settings: Partial<WorldSettings>): void {
  for (const key of ['size', 'danger', 'magic', 'peoples', 'cap']) params.delete(key);
  if (settings.size) params.set('size', settings.size);
  if (settings.danger && settings.danger !== 'normal') params.set('danger', settings.danger);
  if (settings.magic && settings.magic !== 'normal') params.set('magic', settings.magic);
  if (settings.peoples && settings.peoples.length < PEOPLES.length) {
    params.set('peoples', settings.peoples.join(','));
  }
  if (settings.populationCap) params.set('cap', String(settings.populationCap));
}

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

function packsFrom(params: URLSearchParams): string[] {
  const ids = params.get('packs')?.split(',') ?? [];
  return [...new Set(ids.filter((id) => PACK_ID.test(id)))];
}

function writePacks(params: URLSearchParams, packs: readonly string[]): void {
  if (packs.length > 0) params.set('packs', packs.join(','));
  else params.delete('packs');
}

export function specFromUrl(): WorldSpec | null {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed')?.trim();
  if (!seed) return null;
  const n = Number(params.get('n'));
  return {
    seed,
    characterCount: Number.isSafeInteger(n) && n > 0 && n <= 2_000 ? n : DEFAULT_CHARACTER_COUNT,
    settings: settingsFrom(params),
    packs: packsFrom(params),
  };
}

export function randomSeed(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String((n! % 999_999) + 1);
}

export function writeSpecToUrl({ seed, characterCount, settings, packs }: WorldSpec): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  if (characterCount === DEFAULT_CHARACTER_COUNT) url.searchParams.delete('n');
  else url.searchParams.set('n', String(characterCount));
  writeSettings(url.searchParams, settings);
  writePacks(url.searchParams, packs);
  window.history.replaceState(null, '', url);
}

export function shareLink(spec: WorldSpec): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('seed', spec.seed);
  if (spec.characterCount !== DEFAULT_CHARACTER_COUNT) {
    url.searchParams.set('n', String(spec.characterCount));
  }
  writeSettings(url.searchParams, spec.settings);
  writePacks(url.searchParams, spec.packs);
  return url.toString();
}
