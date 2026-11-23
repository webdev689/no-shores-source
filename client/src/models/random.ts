import { seeded } from '../seeded.ts';

/** Draws in [0, 1) from a 32-bit seed (Mulberry32): integer maths only, so every engine draws the same numbers. */
export function randomFromSeed(seed: number): { next(): number } {
  return { next: seeded(seed) };
}
