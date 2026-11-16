import type { Group, Packed } from './field.ts';
import { TILE_M } from './scatter.ts';

/**
 * Which packed tiles the camera may see: each tile's bounding sphere against the view's four sides and its near
 * plane, read from the view-projection of points measured from the eye. `anchorFromEye` is the packing's anchor
 * from the eye (metres east, south, and the eye's drawn height negated); heights are drawn times `exaggeration`.
 */
export function tilesInView(
  packed: Packed,
  fromEye: Float32Array,
  anchorFromEye: readonly [number, number, number],
  exaggeration: number,
  out: Uint8Array = new Uint8Array(packed.tiles.length / 4),
): Uint8Array {
  const row = (index: number) => [0, 4, 8, 12].map((column) => fromEye[column + index] ?? 0);
  const [first, second, , last] = [row(0), row(1), row(2), row(3)];
  const depth = row(2);
  const planes = [
    last.map((value, index) => value + (first[index] ?? 0)),
    last.map((value, index) => value - (first[index] ?? 0)),
    last.map((value, index) => value + (second[index] ?? 0)),
    last.map((value, index) => value - (second[index] ?? 0)),
    last.map((value, index) => value - (depth[index] ?? 0)),
  ].map(([a = 0, b = 0, third = 0, fourth = 0]) => {
    const length = Math.hypot(a, b, third) || 1;
    return [a / length, b / length, third / length, fourth / length] as const;
  });
  const { tiles } = packed;
  for (let tile = 0; tile < tiles.length / 4; tile++) {
    const [east, south, lowest, highest] = [
      tiles[tile * 4] ?? 0,
      tiles[tile * 4 + 1] ?? 0,
      tiles[tile * 4 + 2] ?? 0,
      tiles[tile * 4 + 3] ?? 0,
    ];
    const centre = [
      east + anchorFromEye[0],
      south + anchorFromEye[1],
      ((lowest + highest) / 2) * exaggeration + anchorFromEye[2],
    ] as const;
    const radius = Math.hypot(TILE_M * Math.SQRT1_2 + packed.spread, ((highest - lowest) / 2) * exaggeration);
    out[tile] = planes.every(
      ([a, b, third, fourth]) => a * centre[0] + b * centre[1] + third * centre[2] + fourth >= -radius,
    )
      ? 1
      : 0;
  }
  return out;
}

/** Marks the tiles whose plants may cast into the sun's shadow square, as `reaches` judges a box measured from the eye
 *  (west, north, low, then east, south, high): those behind the camera too, whose shadows fall forward into view. */
export function tilesCasting(
  packed: Packed,
  anchorFromEye: readonly [number, number, number],
  exaggeration: number,
  reaches: (low: readonly [number, number, number], high: readonly [number, number, number]) => boolean,
  out: Uint8Array = new Uint8Array(packed.tiles.length / 4),
): Uint8Array {
  const { tiles } = packed;
  const half = TILE_M / 2 + packed.spread;
  for (let tile = 0; tile < tiles.length / 4; tile++) {
    const [east, south] = [(tiles[tile * 4] ?? 0) + anchorFromEye[0], (tiles[tile * 4 + 1] ?? 0) + anchorFromEye[1]];
    const [lowest, highest] = [tiles[tile * 4 + 2] ?? 0, tiles[tile * 4 + 3] ?? 0];
    const low = [east - half, south - half, lowest * exaggeration + anchorFromEye[2]] as const;
    // A tile records its plants' feet; the tallest tree stands some 40 m over its foot.
    const high = [east + half, south + half, highest * exaggeration + anchorFromEye[2] + 40] as const;
    out[tile] = reaches(low, high) ? 1 : 0;
  }
  return out;
}

/** A group's instances in view, as (first, count) pairs: neighbouring tiles in view join into one draw. */
export function runsInView(group: Group, visible: Uint8Array): number[] {
  const runs: number[] = [];
  let next = group.first;
  for (const [index, tile] of group.tiles.entries()) {
    const count = group.counts[index] ?? 0;
    if (visible[tile]) {
      const last = runs.length - 2;
      if (last >= 0 && (runs[last] ?? 0) + (runs[last + 1] ?? 0) === next)
        runs[last + 1] = (runs[last + 1] ?? 0) + count;
      else runs.push(next, count);
    }
    next += count;
  }
  return runs;
}
