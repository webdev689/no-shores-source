// A square picture's mip levels for the GPU: each level the mean of the four texels above it.

/** A picture's levels from its own size down to 1, each RGBA with its top row first. */
export type LayerLevels = Uint8Array[];

/** Every level of a square picture: itself, then each half the size, down to one texel. */
export function levelsOf(square: Uint8Array, size: number): LayerLevels {
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
