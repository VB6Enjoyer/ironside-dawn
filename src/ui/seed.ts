/**
 * The world seed and size live in the URL (`?seed=42&n=100`) so a world can
 * be shared or reloaded.
 */

export interface WorldSpec {
  readonly seed: string;
  readonly characterCount: number;
}

export const DEFAULT_CHARACTER_COUNT = 20;
export const CHARACTER_COUNTS = [20, 50, 100, 200, 500] as const;

export function specFromUrl(): WorldSpec | null {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed')?.trim();
  if (!seed) return null;
  const n = Number(params.get('n'));
  return {
    seed,
    characterCount: Number.isSafeInteger(n) && n > 0 && n <= 2_000 ? n : DEFAULT_CHARACTER_COUNT,
  };
}

export function randomSeed(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String((n! % 999_999) + 1);
}

export function writeSpecToUrl({ seed, characterCount }: WorldSpec): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  if (characterCount === DEFAULT_CHARACTER_COUNT) url.searchParams.delete('n');
  else url.searchParams.set('n', String(characterCount));
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
  return url.toString();
}
