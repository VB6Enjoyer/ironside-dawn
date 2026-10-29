/**
 * Incremental 53-bit hash (cyrb53) over a stream of strings. Used to compare
 * whole simulation histories cheaply in determinism tests and the CLI.
 */
export class StreamHash {
  #h1 = 0xdeadbeef;
  #h2 = 0x41c6ce57;

  update(text: string): this {
    let h1 = this.#h1;
    let h2 = this.#h2;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    // Separator, so ["ab", "c"] and ["a", "bc"] hash differently.
    h1 = Math.imul(h1 ^ 0x1f, 2654435761);
    h2 = Math.imul(h2 ^ 0x1f, 1597334677);
    this.#h1 = h1;
    this.#h2 = h2;
    return this;
  }

  /** Hex digest of everything hashed so far. Does not reset the hash. */
  digest(): string {
    let h1 = this.#h1;
    let h2 = this.#h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return value.toString(16).padStart(14, '0');
  }
}
