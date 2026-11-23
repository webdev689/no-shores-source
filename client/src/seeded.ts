// A seeded stream of numbers in [0, 1) (Mulberry32): integer maths only, so the same seed draws the same numbers in
// every engine. Groundwork, which any layer may draw from.

/** The stream a 32-bit seed starts. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
