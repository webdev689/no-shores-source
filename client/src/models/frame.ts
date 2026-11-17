// A piece's box as its family reads it, its doors' own axes, and the turns that let a family build along its long
// side or toward its door whichever way the piece stands.
import type { Relief } from './tables.ts';
import type { PartBuilder } from './parts.ts';
import { cross, dot, minus, swap, unit, type Vector } from './vector.ts';

/** A box's extents and sizes: x along it, z across (its front +z), y up from its floor. */
export type Frame = {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly z0: number;
  readonly z1: number;
  readonly length: number;
  readonly height: number;
  readonly depth: number;
  readonly middleX: number;
  readonly middleZ: number;
};

/** A door's three measured corners and its normal. */
export type DoorCorners = {
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly c: readonly number[];
  readonly n: readonly number[];
};

export const boxFrame = (box: { readonly min: readonly number[]; readonly max: readonly number[] }): Frame => {
  const { min, max } = box;
  return {
    x0: min[0],
    x1: max[0],
    y0: min[1],
    y1: max[1],
    z0: min[2],
    z1: max[2],
    length: max[0] - min[0],
    height: max[1] - min[1],
    depth: max[2] - min[2],
    middleX: (min[0] + max[0]) / 2,
    middleZ: (min[2] + max[2]) / 2,
  };
};

export const clampTo = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Whether a point stands in the frame's box, give or take a centimetre. */
export const inFrame = (point: readonly number[], fit: Frame): boolean =>
  point[0] >= fit.x0 - 0.011 &&
  point[0] <= fit.x1 + 0.011 &&
  point[1] >= fit.y0 - 0.011 &&
  point[1] <= fit.y1 + 0.011 &&
  point[2] >= fit.z0 - 0.011 &&
  point[2] <= fit.z1 + 0.011;

/** How far `point` may run along `direction` and stay in the frame's box. */
export function room(point: readonly number[], direction: readonly number[], fit: Frame): number {
  const low = [fit.x0, fit.y0, fit.z0],
    high = [fit.x1, fit.y1, fit.z1];
  let reach = Infinity;
  for (let axis = 0; axis < 3; axis++)
    if (Math.abs(direction[axis]) > 1e-9)
      reach = Math.min(reach, ((direction[axis] > 0 ? high[axis] : low[axis]) - point[axis]) / direction[axis]);
  return reach;
}

/** A door's frame of reference: the square its three measured corners span in its own plane (a door is measured as
 *  one triangle of its face, or two), that square's corners round its edge, its centre, its normal, the way across
 *  it as one faces it (left to right) and up it, its width and its height. */
export function doorAxes(door: DoorCorners): {
  corners: Vector[];
  centre: Vector;
  n: Vector;
  across: Vector;
  up: Vector;
  width: number;
  height: number;
} {
  const n = unit(door.n);
  const across = Math.abs(n[1]) < 0.99 ? unit(cross([0, 1, 0], n)) : unit(minus(door.b, door.a));
  const up = cross(n, across);
  const points = [door.a, door.b, door.c];
  const wide = points.map((point) => dot(point, across)),
    tall = points.map((point) => dot(point, up));
  const [left, right, low, high] = [Math.min(...wide), Math.max(...wide), Math.min(...tall), Math.max(...tall)];
  const plane = points.reduce((sum, point) => sum + dot(point, n), 0) / 3;
  const pointAt = (side: number, rise: number): Vector =>
    [0, 1, 2].map((axis) => across[axis] * side + up[axis] * rise + n[axis] * plane);
  return {
    corners: [pointAt(left, high), pointAt(right, high), pointAt(right, low), pointAt(left, low)],
    centre: pointAt((left + right) / 2, (low + high) / 2),
    n,
    across,
    up,
    width: right - left,
    height: high - low,
  };
}

/** A relief's height (m over its box's floor) at x, z: its nodes spread evenly over the box, read between the four
 *  round the point. */
export function reliefAt(
  relief: Relief,
  spanX: readonly number[],
  spanZ: readonly number[],
  x: number,
  z: number,
): number {
  const [columns, rows] = relief.grid;
  const place = (value: number, from: number, to: number, count: number): number =>
    Math.min(count - 1, Math.max(0, ((value - from) / (to - from)) * (count - 1)));
  const across = place(x, spanX[0], spanX[1], columns),
    along = place(z, spanZ[0], spanZ[1], rows);
  const column = Math.min(columns - 2, Math.floor(across)),
    row = Math.min(rows - 2, Math.floor(along));
  const node = (east: number, north: number): number => relief.tops[(row + north) * columns + column + east] / 100;
  const east = across - column,
    north = along - row;
  return (
    (node(0, 0) * (1 - east) + node(1, 0) * east) * (1 - north) + (node(0, 1) * (1 - east) + node(1, 1) * east) * north
  );
}

const swapped = (fit: Frame): Frame => ({
  ...fit,
  x0: fit.z0,
  x1: fit.z1,
  z0: fit.x0,
  z1: fit.x1,
  length: fit.depth,
  depth: fit.length,
  middleX: fit.middleZ,
  middleZ: fit.middleX,
});
/** Doors seen through `point` (a corner's map) and `normal` (a normal's). */
const doorsSeen = (
  doors: readonly DoorCorners[],
  point: (corner: readonly number[]) => Vector,
  normal: (direction: readonly number[]) => Vector,
): DoorCorners[] =>
  doors.map((door) => ({ ...door, a: point(door.a), b: point(door.b), c: point(door.c), n: normal(door.n) }));

export type View = { add: PartBuilder; fit: Frame; doors: readonly DoorCorners[] };

/** A family's builder, frame and doors, turned so the piece's long side runs along x. */
export function lengthwise(add: PartBuilder, fit: Frame, doors: readonly DoorCorners[] = []): View {
  if (fit.length >= fit.depth) return { add, fit, doors };
  return { add: add.crosswise(), fit: swapped(fit), doors: doorsSeen(doors, swap, swap) };
}

/** A family's builder, frame and doors, turned so its first door faces +z, the side a family builds its front on. */
export function towardDoor(add: PartBuilder, fit: Frame, doors: readonly DoorCorners[]): View {
  const n = doors[0].n;
  if (Math.abs(n[0]) > Math.abs(n[2])) {
    const sum = fit.x0 + fit.x1;
    if (n[0] > 0) return { add: add.crosswise(), fit: swapped(fit), doors: doorsSeen(doors, swap, swap) };
    return {
      add: add.crosswise().mirror(sum),
      fit: swapped(fit),
      doors: doorsSeen(
        doors,
        (point) => [point[2], point[1], sum - point[0]],
        (normal) => [normal[2], normal[1], -normal[0]],
      ),
    };
  }
  if (n[2] >= 0) return { add, fit, doors };
  const sum = fit.z0 + fit.z1;
  return {
    add: add.mirror(sum),
    fit,
    doors: doorsSeen(
      doors,
      (point) => [point[0], point[1], sum - point[2]],
      (normal) => [normal[0], normal[1], -normal[2]],
    ),
  };
}

/** A block behind a door, square to it: `margin` past each jamb, `above` over its head, `deep` back from its face,
 *  each given up, the margins first, where the block would leave the frame's box. */
export function behindDoor(
  add: PartBuilder,
  picture: readonly number[],
  door: DoorCorners,
  fit: Frame,
  { margin, above, deep }: { margin: number; above: number; deep: number },
): void {
  const { centre, n, across, up, width, height } = doorAxes(door);
  const step = (point: readonly number[], direction: readonly number[], distance: number): Vector => [
    point[0] + direction[0] * distance,
    point[1] + direction[1] * distance,
    point[2] + direction[2] * distance,
  ];
  // Back level with the ground, so a door that leans back at the floor has its block behind it, not under it.
  const flat = Math.hypot(n[0], n[2]);
  const level = flat > 0.3 ? [-n[0] / flat, 0, -n[2] / flat] : [-n[0], -n[1], -n[2]];
  for (const [side, over] of [
    [margin, above],
    [0, above],
    [0, 0],
  ]) {
    const back = Math.min(deep, room(centre, level, fit) - 0.01);
    if (back <= 0.02) return;
    const origin = step(step(centre, across, -width / 2 - side), up, -height / 2);
    const wide = across.map((value) => value * (width + side * 2)),
      tall = up.map((x) => x * (height + over)),
      w = level.map((x) => x * back);
    const corners = [0, 1].flatMap((i) =>
      [0, 1].flatMap((j) => [0, 1].map((k) => step(step(step(origin, wide, i), tall, j), w, k))),
    );
    if (corners.every((corner) => inFrame(corner, fit))) {
      add.block(picture, origin, wide, tall, w);
      return;
    }
  }
}

/** Four posts at a frame's corners, `inset` in, `side` square, from `from` up `high`. */
export function posts(
  add: PartBuilder,
  picture: readonly number[],
  fit: Frame,
  inset: number,
  side: number,
  from: number,
  high: number,
): void {
  for (const x of [fit.x0 + inset, fit.x1 - inset - side])
    for (const z of [fit.z0 + inset, fit.z1 - inset - side])
      add.box(picture, [x, x + side], [from, from + high], [z, z + side]);
}
