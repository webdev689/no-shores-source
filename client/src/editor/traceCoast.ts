import { CELL_M, type LandMask } from './landMask.ts';

/** A point in whole metres, as the layout file stores it. */
export type Point = readonly [number, number];

/** East, south, west, north, as steps in cell corners. */
const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * The cells ahead-left and ahead-right of a corner when heading in `direction`, as offsets from the corner to the
 * cell's top-left corner.
 */
const AHEAD: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
  [
    [0, -1],
    [0, 0],
  ],
  [
    [0, 0],
    [-1, 0],
  ],
  [
    [-1, 0],
    [-1, -1],
  ],
  [
    [-1, -1],
    [0, -1],
  ],
];

/**
 * The outer coast of a continent's land: a ring of cell corners, in metres, walked with the land on the right. Cells
 * that only meet at a corner are not joined, so a neck one cell wide at a diagonal shows as a coast touching itself,
 * which the rules refuse. Gives nothing when the label holds no land.
 */
export function traceCoast(mask: LandMask, label: number): Point[] {
  const first = mask.cells.indexOf(label);
  if (label === 0 || first < 0) return [];
  const start: [number, number] = [first % mask.width, Math.floor(first / mask.width)];
  const isLand = (cellX: number, cellY: number) => mask.labelAt(cellX, cellY) === label;
  const ring: Point[] = [[start[0] * CELL_M, start[1] * CELL_M]];
  let [x, y] = start;
  let direction = 0;
  for (;;) {
    const [stepX, stepY] = STEPS[direction] ?? [1, 0];
    x += stepX;
    y += stepY;
    const [[leftX, leftY], [rightX, rightY]] = AHEAD[direction] ?? AHEAD[0]!;
    let next = direction;
    if (!isLand(x + rightX, y + rightY)) next = (direction + 1) % 4;
    else if (isLand(x + leftX, y + leftY)) next = (direction + 3) % 4;
    if (x === start[0] && y === start[1] && next === 0) break;
    if (next !== direction) ring.push([x * CELL_M, y * CELL_M]);
    direction = next;
  }
  return ring;
}

function distanceSquaredToLine(point: Point, from: Point, to: Point): number {
  const [pointX, pointY] = point;
  const [fromX, fromY] = from;
  const [toX, toY] = to;
  const lengthSquared = (toX - fromX) ** 2 + (toY - fromY) ** 2;
  if (lengthSquared === 0) return (pointX - fromX) ** 2 + (pointY - fromY) ** 2;
  const across = (toX - fromX) * (pointY - fromY) - (toY - fromY) * (pointX - fromX);
  return (across * across) / lengthSquared;
}

/** Douglas-Peucker on an open run of points, keeping its two ends. */
function simplifyRun(points: readonly Point[], toleranceSquared: number): Point[] {
  const last = points.length - 1;
  if (last < 2) return [...points];
  const from = points[0]!;
  const to = points[last]!;
  let farthest = 0;
  let farthestAt = 0;
  for (let index = 1; index < last; index++) {
    const distance = distanceSquaredToLine(points[index]!, from, to);
    if (distance > farthest) [farthest, farthestAt] = [distance, index];
  }
  if (farthest <= toleranceSquared) return [from, to];
  const head = simplifyRun(points.slice(0, farthestAt + 1), toleranceSquared);
  return [...head.slice(0, -1), ...simplifyRun(points.slice(farthestAt), toleranceSquared)];
}

/**
 * A closed ring with every point within `toleranceM` of the original coast dropped where it adds nothing. The ring is
 * split at its first point and the point farthest from it, and each half simplified alone. The points kept are the
 * ring's own, so they stay whole metres.
 */
export function simplifyRing(ring: readonly Point[], toleranceM: number): Point[] {
  if (ring.length <= 3 || toleranceM <= 0) return [...ring];
  const origin = ring[0]!;
  let split = 1;
  ring.forEach(([pointX, pointY], index) => {
    const [splitX, splitY] = ring[split]!;
    const reach = (pointX - origin[0]) ** 2 + (pointY - origin[1]) ** 2;
    if (reach > (splitX - origin[0]) ** 2 + (splitY - origin[1]) ** 2) split = index;
  });
  const toleranceSquared = toleranceM * toleranceM;
  const out = simplifyRun(ring.slice(0, split + 1), toleranceSquared);
  const back = simplifyRun([...ring.slice(split), origin], toleranceSquared);
  const simplified = [...out.slice(0, -1), ...back.slice(0, -1)];
  return simplified.length >= 3 ? simplified : [...ring];
}
