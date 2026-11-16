// A painted picture made ready for its layer: resampled to the array's square texel for texel (nearest, so a
// picture keeps its hard edges up close), then halved down to one texel, each level the mean of the four below it.
import { LAYER_SIZE } from './pictures.ts';

/** A picture's levels from LAYER_SIZE square down to 1, each RGBA with its top row first. */
export type LayerLevels = Uint8Array[];

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

/** Every level of a square picture: itself, then each half the size, down to one texel. */
export function levelsOf(square: Uint8Array, size = LAYER_SIZE): LayerLevels {
  const levels: LayerLevels = [square];
  for (let side = size / 2; side >= 1; side /= 2) {
    const above = levels[levels.length - 1];
    const level = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++)
        for (let channel = 0; channel < 4; channel++) {
          const texel = (row: number, column: number): number => above[(row * side * 2 + column) * 4 + channel];
          const sum =
            texel(2 * y, 2 * x) + texel(2 * y, 2 * x + 1) + texel(2 * y + 1, 2 * x) + texel(2 * y + 1, 2 * x + 1);
          level[(y * side + x) * 4 + channel] = Math.round(sum / 4);
        }
    levels.push(level);
  }
  return levels;
}

/** Levels of one colour throughout, for a layer not painted yet. */
export function plainLevels(colour: readonly [number, number, number], size = LAYER_SIZE): LayerLevels {
  const levels: LayerLevels = [];
  for (let side = size; side >= 1; side /= 2) {
    const level = new Uint8Array(side * side * 4);
    for (let texel = 0; texel < side * side; texel++)
      level.set(
        [Math.round(colour[0] * 255), Math.round(colour[1] * 255), Math.round(colour[2] * 255), 255],
        texel * 4,
      );
    levels.push(level);
  }
  return levels;
}

/** How many levels a layer of `size` has. */
export const levelCount = (size = LAYER_SIZE): number => Math.log2(size) + 1;
