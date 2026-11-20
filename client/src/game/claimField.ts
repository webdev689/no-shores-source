// How far each texel of a grid lies from a claim's edge, positive inside: a node's claim is a ring and the capsules
// (wings) that carry it out. The inside is filled by one scan per row and then measured by a distance transform, so
// the cost is the texels and the rows times the ring's edges, never the texels times its edges.

type Point = readonly [number, number];
/** A grid of `width` by `height` texels, `texelM` metres each, its north-west corner at (`west`, `north`). */
export interface Grid {
  readonly west: number;
  readonly north: number;
  readonly texelM: number;
  readonly width: number;
  readonly height: number;
}
/** A wing: a capsule from (fromX, fromY) to (toX, toY) of half-width `half`, metres. */
export type Wing = readonly [number, number, number, number, number];

const FAR = 1e20;

/** The squared distance, in texels, from each texel to the nearest one of `mask` equal to `target`. */
function squaredDistance(mask: Uint8Array, { width, height }: Grid, target: number): Float64Array {
  const out = new Float64Array(width * height);
  for (let k = 0; k < out.length; k++) out[k] = mask[k] === target ? 0 : FAR;
  const most = Math.max(width, height);
  const [source, hull, bound, dist] = [
    new Float64Array(most),
    new Int32Array(most),
    new Float64Array(most + 1),
    new Float64Array(most),
  ];
  // Felzenszwalb and Huttenlocher's lower envelope of parabolas, along a line of `count` texels from `start`.
  const along = (start: number, step: number, count: number) => {
    for (let k = 0; k < count; k++) source[k] = out[start + k * step];
    let top = 0;
    hull[0] = 0;
    bound[0] = -Infinity;
    bound[1] = Infinity;
    for (let index = 1; index < count; index++) {
      let cross = 0;
      for (;;) {
        const prior = hull[top];
        cross = (source[index] + index * index - (source[prior] + prior * prior)) / (2 * index - 2 * prior);
        if (cross > bound[top] || top === 0) break;
        top--;
      }
      top++;
      hull[top] = index;
      bound[top] = cross;
      bound[top + 1] = Infinity;
    }
    top = 0;
    for (let index = 0; index < count; index++) {
      while (bound[top + 1] < index) top++;
      dist[index] = (index - hull[top]) ** 2 + source[hull[top]];
    }
    for (let k = 0; k < count; k++) out[start + k * step] = dist[k];
  };
  for (let row = 0; row < height; row++) along(row * width, 1, width);
  for (let column = 0; column < width; column++) along(column, width, height);
  return out;
}

/** The texels of `rings` and `wings` marked 1: each ring by an even-odd scan of its rows, each wing by its box. */
function fill(rings: readonly (readonly Point[])[], wings: readonly Wing[], grid: Grid): Uint8Array {
  const { west, north, texelM, width, height } = grid;
  const mask = new Uint8Array(width * height);
  for (const ring of rings)
    for (let row = 0; row < height; row++) {
      const y = north + (row + 0.5) * texelM;
      const crossings: number[] = [];
      for (let k = 0; k < ring.length; k++) {
        const [from, to] = [ring[k], ring[(k + 1) % ring.length]];
        if (from[1] > y !== to[1] > y)
          crossings.push(from[0] + ((y - from[1]) * (to[0] - from[0])) / (to[1] - from[1]));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const first = Math.max(0, Math.ceil((crossings[k] - west) / texelM - 0.5));
        const last = Math.min(width - 1, Math.floor((crossings[k + 1] - west) / texelM - 0.5));
        for (let column = first; column <= last; column++) mask[row * width + column] = 1;
      }
    }
  for (const [fromX, fromY, toX, toY, half] of wings) {
    const [spanX, spanY] = [toX - fromX, toY - fromY];
    const length = spanX * spanX + spanY * spanY;
    const rows = [Math.min(fromY, toY) - half, Math.max(fromY, toY) + half].map((y) => (y - north) / texelM - 0.5);
    const columns = [Math.min(fromX, toX) - half, Math.max(fromX, toX) + half].map((x) => (x - west) / texelM - 0.5);
    for (let row = Math.max(0, Math.ceil(rows[0])); row <= Math.min(height - 1, Math.floor(rows[1])); row++)
      for (
        let column = Math.max(0, Math.ceil(columns[0]));
        column <= Math.min(width - 1, Math.floor(columns[1]));
        column++
      ) {
        const [x, y] = [west + (column + 0.5) * texelM, north + (row + 0.5) * texelM];
        const along = length > 0 ? Math.min(1, Math.max(0, ((x - fromX) * spanX + (y - fromY) * spanY) / length)) : 0;
        if (Math.hypot(x - fromX - spanX * along, y - fromY - spanY * along) <= half) mask[row * width + column] = 1;
      }
  }
  return mask;
}

/** Each texel's distance in metres from the edge of the union of `rings` and `wings`, positive inside. */
export function claimField(rings: readonly (readonly Point[])[], wings: readonly Wing[], grid: Grid): Float32Array {
  const mask = fill(rings, wings, grid);
  const [toInside, toOutside] = [squaredDistance(mask, grid, 1), squaredDistance(mask, grid, 0)];
  const field = new Float32Array(mask.length);
  for (let k = 0; k < field.length; k++)
    field[k] = (mask[k] ? Math.sqrt(toOutside[k]) - 0.5 : 0.5 - Math.sqrt(toInside[k])) * grid.texelM;
  return field;
}
