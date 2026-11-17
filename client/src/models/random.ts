/** Draws in [0, 1) from a 32-bit seed (Mulberry32): integer maths only, so every engine draws the same numbers. */
export function randomFromSeed(seed: number): { next(): number } {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
  };
}
