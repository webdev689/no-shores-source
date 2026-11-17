// A rock: an icosahedron once divided, each point pushed out or in by its own seed, flattened on the ground and
// flat-shaded. Over a relief (the classic's top) its middle stands under the classic's peak and every point keeps
// under the classic's top, so the ways past it the classic left open stay open; its highest point is lifted to the
// box's top.
import type { Face } from './parts.ts';
import type { Relief } from './tables.ts';
import { reliefAt } from './frame.ts';
import { randomFromSeed } from './random.ts';
import { cross, minus, unit, type Vector } from './vector.ts';

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const CORNERS: readonly (readonly number[])[] = [
  [-1, GOLDEN, 0],
  [1, GOLDEN, 0],
  [-1, -GOLDEN, 0],
  [1, -GOLDEN, 0],
  [0, -1, GOLDEN],
  [0, 1, GOLDEN],
  [0, -1, -GOLDEN],
  [0, 1, -GOLDEN],
  [GOLDEN, 0, -1],
  [GOLDEN, 0, 1],
  [-GOLDEN, 0, -1],
  [-GOLDEN, 0, 1],
];
const FACES: readonly (readonly number[])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/** The rock solid, laid by `tri`: a rock filling the three ranges, its shape its seed's. */
export function rockOf(tri: Face) {
  return function rock(
    picture: readonly number[],
    spanX: readonly number[],
    spanY: readonly number[],
    spanZ: readonly number[],
    seed: number,
    relief: Relief | null = null,
  ): void {
    const [fromX, toX] = spanX,
      [fromY, toY] = spanY,
      [fromZ, toZ] = spanZ;
    const random = randomFromSeed(seed >>> 0);
    let points: Vector[] = CORNERS.map((corner) => unit(corner));
    const middle = new Map<string, number>();
    const half = (a: number, b: number): number => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let found = middle.get(key);
      if (found === undefined) {
        found = points.length;
        middle.set(key, found);
        points.push(
          unit([
            (points[a][0] + points[b][0]) / 2,
            (points[a][1] + points[b][1]) / 2,
            (points[a][2] + points[b][2]) / 2,
          ]),
        );
      }
      return found;
    };
    const faces = FACES.flatMap(([a, b, third]) => {
      const halfAB = half(a, b),
        halfBC = half(b, third),
        halfCA = half(third, a);
      return [
        [a, halfAB, halfCA],
        [b, halfBC, halfAB],
        [third, halfCA, halfBC],
        [halfAB, halfBC, halfCA],
      ];
    });
    points = points.map((point) => {
      const push = 0.78 + random.next() * 0.3;
      return [point[0] * push, point[1] * push, point[2] * push];
    });
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    for (const point of points)
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], point[axis]);
        high[axis] = Math.max(high[axis], point[axis]);
      }
    const ground = low[1] + (high[1] - low[1]) * 0.18;
    // Across the box, the blob's middle at `centre` where a relief names its peak.
    const across = (value: number, axis: number, from: number, to: number, centre: number | undefined): number => {
      const share = (value - low[axis]) / (high[axis] - low[axis]);
      if (centre === undefined) return from + share * (to - from);
      return share < 0.5 ? from + (share / 0.5) * (centre - from) : centre + ((share - 0.5) / 0.5) * (to - centre);
    };
    const placed = points.map((point): Vector => {
      const x = across(point[0], 0, fromX, toX, relief?.peak[0]),
        z = across(point[2], 2, fromZ, toZ, relief?.peak[1]);
      const y = fromY + ((Math.max(point[1], ground) - ground) / (high[1] - ground)) * (toY - fromY);
      return [x, relief ? Math.min(y, fromY + reliefAt(relief, spanX, spanZ, x, z)) : y, z];
    });
    if (relief) placed.reduce((best, point) => (point[1] > best[1] ? point : best))[1] = toY;
    for (const [a, b, third] of faces) {
      const corners = [placed[a], placed[b], placed[third]];
      const n = cross(minus(corners[1], corners[0]), minus(corners[2], corners[0]));
      if (Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
      tri(picture, corners, unit(n));
    }
  };
}
