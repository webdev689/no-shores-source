// A painted picture made ready for its layer: resampled to the array's square texel for texel (nearest, so a
// picture keeps its hard edges up close), then halved down to one texel, each level the mean of the four below it.
import type { LayerLevels } from '../textures/levels.ts';
import { LAYER_SIZE } from './pictures.ts';

export { type LayerLevels, levelsOf } from '../textures/levels.ts';

/** Resamples an RGBA picture (top row first) to `size` square by nearest texel. */
export function resampled(rgba: Uint8Array, width: number, height: number, size = LAYER_SIZE): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = Math.min(height - 1, Math.floor((y * height) / size));
    for (let x = 0; x < size; x++) {
      const column = Math.min(width - 1, Math.floor((x * width) / size));
      out.set(rgba.subarray((row * width + column) * 4, (row * width + column) * 4 + 4), (y * size + x) * 4);
    }
  }
  return out;
}

/** Levels of one colour throughout, for a layer not painted yet. */
export function plainLevels(colour: readonly [number, number, number], size = LAYER_SIZE): LayerLevels {
  const levels: LayerLevels = [];
  for (let side = size; side >= 1; side /= 2) {
    const level = new Uint8Array(side * side * 4);
    level.set([Math.round(colour[0] * 255), Math.round(colour[1] * 255), Math.round(colour[2] * 255), 255]);
    // The first texel doubled over and over: a whole layer in a few copies, not a write a texel.
    for (let filled = 4; filled < level.length; filled *= 2) level.copyWithin(filled, 0, filled);
    levels.push(level);
  }
  return levels;
}

/** How many levels a layer of `size` has. */
export const levelCount = (size = LAYER_SIZE): number => Math.log2(size) + 1;
