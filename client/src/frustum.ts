// What a view sees, for every drawer that leaves out what is out of view: the six planes of a view-projection's
// clip volume, and whether a box, a sphere or a set of points reaches inside them. Each test answers "seen" whenever
// it cannot be sure, so the worst a loose bound does is draw what no one sees, never hide what is in view. An object
// makes its bounds once and every pass that culls it asks the same ones, so no two passes disagree about it.

/** A view's planes, four numbers each, [a, b, c, d]: a x + b y + c z + d is a point's distance inside the plane
 *  (negative outside), in the matrix's own units. */
export type Planes = Float64Array;

/** Each plane as clip space's w taken or not, and plus or minus one of its rows: -w <= x <= w, -w <= y <= w and
 *  0 <= z <= w. */
const SIDES = [
  [1, 0, 1],
  [1, 0, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, 2, -1],
  [0, 2, 1],
] as const;

/**
 * The six planes bounding what a view-projection (column-major, 4 x 4) draws: left, right, bottom and top, then the
 * two depth planes (WebGPU's depth runs from 0 to w, whichever end is near). Each is a sum or a difference of the
 * matrix's rows, scaled to unit length, so its value at a point is a distance a radius can be held against: a plane
 * left unscaled counts a radius as little as half of itself and hides a sphere still on screen.
 */
export function viewPlanes(matrix: ArrayLike<number>, out: Planes = new Float64Array(SIDES.length * 4)): Planes {
  const term = (row: number, column: number): number => matrix[column * 4 + row] ?? 0;
  SIDES.forEach(([withW, row, sign], plane) => {
    for (let column = 0; column < 4; column++)
      out[plane * 4 + column] = withW * term(3, column) + sign * term(row, column);
    const length = Math.hypot(out[plane * 4] ?? 0, out[plane * 4 + 1] ?? 0, out[plane * 4 + 2] ?? 0) || 1;
    for (let column = 0; column < 4; column++) out[plane * 4 + column] = (out[plane * 4 + column] ?? 0) / length;
  });
  return out;
}

/** Whether a box, upright, from its `low` corner to its `high` (measured as the planes' matrix measures), reaches
 *  inside every plane: for each, the corner farthest along its normal is tested, and if even that is outside, so is
 *  the whole box. A box that straddles or surrounds the view is seen. */
export function boxSeen(planes: Planes, low: ArrayLike<number>, high: ArrayLike<number>): boolean {
  for (let plane = 0; plane < planes.length; plane += 4) {
    const [alongX, alongY, alongZ] = [planes[plane] ?? 0, planes[plane + 1] ?? 0, planes[plane + 2] ?? 0];
    const x = alongX >= 0 ? (high[0] ?? 0) : (low[0] ?? 0);
    const y = alongY >= 0 ? (high[1] ?? 0) : (low[1] ?? 0);
    const z = alongZ >= 0 ? (high[2] ?? 0) : (low[2] ?? 0);
    if (alongX * x + alongY * y + alongZ * z + (planes[plane + 3] ?? 0) < 0) return false;
  }
  return true;
}

/** Whether a sphere about (x, y, z) at least touches the view. One whose numbers are not numbers is seen. */
export function sphereSeen(planes: Planes, x: number, y: number, z: number, radius: number): boolean {
  for (let plane = 0; plane < planes.length; plane += 4) {
    const distance =
      (planes[plane] ?? 0) * x + (planes[plane + 1] ?? 0) * y + (planes[plane + 2] ?? 0) * z + (planes[plane + 3] ?? 0);
    if (distance < -radius) return false;
  }
  return true;
}

/** Whether the shape spanned by `points` (x, y, z after x, y, z), grown `pad` all round, reaches inside every plane:
 *  out of view only when every point lies more than `pad` outside one plane. For a shape no box fits closely, as a
 *  thin wedge turned across the axes. */
export function pointsSeen(planes: Planes, points: ArrayLike<number>, pad = 0): boolean {
  for (let plane = 0; plane < planes.length; plane += 4) {
    const distance = (point: number): number =>
      (planes[plane] ?? 0) * (points[point] ?? 0) +
      (planes[plane + 1] ?? 0) * (points[point + 1] ?? 0) +
      (planes[plane + 2] ?? 0) * (points[point + 2] ?? 0) +
      (planes[plane + 3] ?? 0);
    let inside = false;
    for (let point = 0; point + 2 < points.length && !inside; point += 3) inside = !(distance(point) < -pad);
    if (!inside) return false;
  }
  return true;
}

/** A sphere [x, y, z, radius] round points laid `stride` numbers apart, each's x, y and z first: its middle the
 *  middle of their box, its radius the farthest of them from it. None gives a sphere of nothing at the origin. */
export function sphereAround(points: ArrayLike<number>, stride = 3): [number, number, number, number] {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let point = 0; point + 2 < points.length; point += stride)
    for (let axis = 0; axis < 3; axis++) {
      const value = points[point + axis] ?? 0;
      low[axis] = Math.min(low[axis] ?? 0, value);
      high[axis] = Math.max(high[axis] ?? 0, value);
    }
  if (low[0] === Infinity) return [0, 0, 0, 0];
  const middle = [0, 1, 2].map((axis) => ((low[axis] ?? 0) + (high[axis] ?? 0)) / 2);
  let farthest = 0;
  for (let point = 0; point + 2 < points.length; point += stride) {
    const [x, y, z] = [points[point] ?? 0, points[point + 1] ?? 0, points[point + 2] ?? 0];
    farthest = Math.max(farthest, Math.hypot(x - (middle[0] ?? 0), y - (middle[1] ?? 0), z - (middle[2] ?? 0)));
  }
  return [middle[0] ?? 0, middle[1] ?? 0, middle[2] ?? 0, farthest];
}
