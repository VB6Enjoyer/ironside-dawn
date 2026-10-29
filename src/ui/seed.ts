/** The world seed lives in the URL (`?seed=42`) so a world can be shared or reloaded. */

export function seedFromUrl(): string | null {
  const seed = new URLSearchParams(window.location.search).get('seed')?.trim();
  return seed ? seed : null;
}

export function randomSeed(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String((n! % 999_999) + 1);
}

export function writeSeedToUrl(seed: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
}
