/**
 * Seeded pseudo-random number generation for the simulation.
 *
 * Every random decision in the world goes through an `Rng`, never
 * `Math.random()`, so a world can be replayed exactly from its seed
 * (ARCHITECTURE.md §4.1).
 *
 * Algorithm: sfc32 (128-bit state), seeded by hashing a string key with
 * cyrb128. Changing either one changes every existing world and breaks every
 * save, so treat them as frozen. The golden-value test in `rng.test.ts`
 * guards against accidental changes.
 */

/** Serializable snapshot of an `Rng`, stored in saves. */
export interface RngState {
  /** The seed key. Forks derive their keys from it. */
  readonly key: string;
  /** The four 32-bit words of sfc32 state, as unsigned integers. */
  readonly s: readonly [number, number, number, number];
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p` (0 to 1). Always consumes exactly one draw. */
  chance(p: number): boolean;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** A value chosen with probability proportional to its weight. */
  weighted<T>(entries: readonly (readonly [value: T, weight: number])[]): T;
  /** Normally distributed value (Box–Muller). Always consumes exactly two draws. */
  gaussian(mean: number, sd: number): number;
  /** Rolls dice notation such as `"d20"`, `"2d6+1"`, `"3d4-2"` or `"5"`. */
  roll(dice: string): number;
  /**
   * An independent child stream, keyed by `label`.
   *
   * Forking does not consume or depend on this stream's draws, so adding a
   * new random call in one subsystem never shifts the rolls of another. The
   * same label always yields the same stream, and `fork("a").fork("b")` is
   * the same stream as `fork("a/b")`.
   */
  fork(label: string): Rng;
  /** Snapshot of the current state; pass to `restoreRng` to continue later. */
  getState(): RngState;
}

/** Creates a generator from a seed. Equal seeds give equal streams. */
export function createRng(seed: string | number): Rng {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new RangeError(`Seed must be a finite number, got ${seed}`);
  }
  const key = String(seed);
  if (key.length === 0) {
    throw new RangeError('Seed must not be an empty string');
  }
  return SeededRng.fromKey(key);
}

/** Recreates a generator from a snapshot taken with `getState()`. */
export function restoreRng(state: RngState): Rng {
  return new SeededRng(state.key, [...state.s]);
}

/** Discarded outputs after seeding, to separate streams with similar keys. */
const WARM_UP_DRAWS = 12;

const MAX_DICE = 1000;
const TWO_POW_32 = 0x1_0000_0000;
const DICE_PATTERN = /^(\d*)d(\d+)([+-]\d+)?$/;
const CONSTANT_PATTERN = /^[+-]?\d+$/;

class SeededRng implements Rng {
  readonly #key: string;
  readonly #s: [number, number, number, number];

  constructor(key: string, s: [number, number, number, number]) {
    this.#key = key;
    this.#s = s;
  }

  static fromKey(key: string): SeededRng {
    const rng = new SeededRng(key, cyrb128(key));
    for (let i = 0; i < WARM_UP_DRAWS; i++) rng.#nextUint32();
    return rng;
  }

  next(): number {
    return this.#nextUint32() / TWO_POW_32;
  }

  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new RangeError(`int() bounds must be safe integers, got ${min} and ${max}`);
    }
    if (min > max) {
      throw new RangeError(`int() min must not exceed max, got ${min} > ${max}`);
    }
    const span = max - min + 1;
    // One draw has 32 bits; wider spans would leave values unreachable.
    if (span > TWO_POW_32) {
      throw new RangeError(`int() range is too wide (${span} values, max 2^32)`);
    }
    return min + Math.floor(this.next() * span);
  }

  chance(p: number): boolean {
    if (!(p >= 0 && p <= 1)) {
      throw new RangeError(`chance() probability must be between 0 and 1, got ${p}`);
    }
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick() needs at least one item');
    }
    return items[this.int(0, items.length - 1)] as T;
  }

  weighted<T>(entries: readonly (readonly [value: T, weight: number])[]): T {
    let total = 0;
    for (const [, weight] of entries) {
      if (!(weight >= 0 && Number.isFinite(weight))) {
        throw new RangeError(`weighted() weights must be finite and >= 0, got ${weight}`);
      }
      total += weight;
    }
    if (total <= 0) {
      throw new RangeError('weighted() needs at least one entry with a positive weight');
    }

    let remaining = this.next() * total;
    let last: T | undefined;
    for (const [value, weight] of entries) {
      if (weight === 0) continue;
      if (remaining < weight) return value;
      remaining -= weight;
      last = value;
    }
    // Only reachable through floating-point rounding at the very top of the range.
    return last as T;
  }

  gaussian(mean: number, sd: number): number {
    if (!(sd >= 0)) {
      throw new RangeError(`gaussian() standard deviation must be >= 0, got ${sd}`);
    }
    const u1 = 1 - this.next(); // (0, 1], so the log is finite
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  }

  roll(dice: string): number {
    const notation = dice.replace(/\s+/g, '').toLowerCase();

    if (CONSTANT_PATTERN.test(notation)) {
      return Number(notation);
    }

    const match = DICE_PATTERN.exec(notation);
    if (!match) {
      throw new SyntaxError(`Invalid dice notation: "${dice}"`);
    }
    const count = match[1] === '' ? 1 : Number(match[1]);
    const sides = Number(match[2]);
    const modifier = match[3] === undefined ? 0 : Number(match[3]);
    if (count < 1 || count > MAX_DICE) {
      throw new RangeError(`Dice count must be between 1 and ${MAX_DICE}: "${dice}"`);
    }
    if (sides < 1) {
      throw new RangeError(`Dice must have at least one side: "${dice}"`);
    }

    let total = modifier;
    for (let i = 0; i < count; i++) total += this.int(1, sides);
    return total;
  }

  fork(label: string): Rng {
    if (label.length === 0) {
      throw new RangeError('fork() label must not be empty');
    }
    return SeededRng.fromKey(`${this.#key}/${label}`);
  }

  getState(): RngState {
    return { key: this.#key, s: [...this.#s] };
  }

  /** sfc32 step. Keeps state as unsigned 32-bit integers so snapshots are stable. */
  #nextUint32(): number {
    const s = this.#s;
    let [a, b, c, d] = s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a >>> 0;
    s[1] = b >>> 0;
    s[2] = c >>> 0;
    s[3] = d >>> 0;
    return t >>> 0;
  }
}

/** cyrb128 string hash: turns a seed key into 128 bits of sfc32 state. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
