/** The cells of a window, row by row: each one's height, distance from the painted coast and height carried over it. */
export interface WideCells {
  readonly width: number;
  readonly heights: Float32Array;
  readonly coast: Float32Array;
  readonly across: Float32Array;
}

/** The texels of the 1 km land's texture (rgba32float, read by WGSL wide_ground) for a rectangle of cells, row by
 *  row: height, distance from the coast, height carried over the coast, 0. */
export function wideTexels(
  cells: WideCells,
  rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): Float32Array {
  const { left, top, right, bottom } = rect;
  const width = right - left;
  const out = new Float32Array(width * (bottom - top) * 4);
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const [from, to] = [row * cells.width + column, ((row - top) * width + column - left) * 4];
      out[to] = cells.heights[from] ?? 0;
      out[to + 1] = cells.coast[from] ?? 0;
      out[to + 2] = cells.across[from] ?? 0;
    }
  }
  return out;
}
