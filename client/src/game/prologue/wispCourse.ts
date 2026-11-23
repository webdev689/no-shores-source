// Where the wisp flies over the wreck, laid on its layout: in from over the sea, clear of the wreck, wandering the
// quiet deck round its mast, then circling the player and closing on their chest. Its course is worked out once for
// where the player stands, frame by frame of the room's ticks, every point lifted clear of the wreck's solids (the
// course's blocks, rails and wheel among them) and eased, so it goes over them and never through them. Its cameras
// too: one following close behind it as it comes, looking on to the wreck before it, and one standing off to watch it
// close on the player with nothing of the wreck between.
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { ENGULF_AT_S, FLASH_IN_S, WISP_S, type WispNow } from './wisp.ts';
import { topAt, type WreckLayout } from './wreckLayout.ts';

type Point = readonly [number, number, number];

/** Its course, a point a sixtieth of a second; the player's feet; where it was drawn from to circle them. */
export interface WispCourse {
  readonly samples: readonly Point[];
  readonly feet: Point;
  readonly facing: number;
  readonly blocks: readonly CourseBlock[];
}

const SAMPLE_HZ = 60;
/** How far out over the sea it comes from (metres from the quiet deck's middle) and how high over the player; how
 *  clear of the wreck the place must be; the heights over its deck it wanders round the mast at. */
const FROM_M = 32;
const FROM_UP_M = 8;
const SEA_CLEAR_M = 3;
const ROUND_MAST = { out: 2.4, ups: [3.6, 4.6, 3.2, 4.2] } as const;
/** The height of a chest over the feet; its rings round the player, widest and narrowest (metres), and their turn
 *  (radians a second). */
const CHEST_M = 1.15;
const RING_M = [2.6, 0.45] as const;
const TURN = [1.6, 9] as const;
/** How clear of a solid it keeps (metres, beside and over it), how far round the player's own feet no solid counts
 *  (the player stands there), and how fast it rises or sinks to keep clear (metres a sixtieth of a second, 7 m/s). */
const CLEAR_M = 0.35;
const OWN_M = 0.4;
const CLIMB_M = 0.12;

const eased = (share: number): number => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};
const mix = (from: Point, to: Point, share: number): Point => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
  from[2] + (to[2] - from[2]) * share,
];

/** Whether `point` stands inside one of `blocks` (each from its underside to its top). */
export function solidAt(blocks: readonly CourseBlock[], [x, y, z]: Point): boolean {
  return blocks.some(
    (block) =>
      x > block.minX && x < block.maxX && y > block.minY && y < block.maxY && z < block.top && z > block.bottom,
  );
}

/** Whether the straight line from `from` to `to` passes through none of `blocks`, looked at every 0.15 m. */
export function clearBetween(blocks: readonly CourseBlock[], from: Point, to: Point): boolean {
  const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / 0.15);
  const [lowX, highX] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
  const [lowY, highY] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
  const near = blocks.filter(
    (block) => block.maxX > lowX && block.minX < highX && block.maxY > lowY && block.minY < highY,
  );
  for (let step = 1; step < steps; step++) if (solidAt(near, mix(from, to, step / steps))) return false;
  return true;
}

/** The lowest a point at (x, y) may fly to keep clear of every solid beside or under it: none round `feet`. */
function clearOver(blocks: readonly CourseBlock[], feet: Point, x: number, y: number): number {
  if (Math.hypot(x - feet[0], y - feet[1]) < OWN_M) return feet[2];
  let top = -Infinity;
  for (const block of blocks)
    if (x > block.minX - CLEAR_M && x < block.maxX + CLEAR_M && y > block.minY - CLEAR_M && y < block.maxY + CLEAR_M)
      top = Math.max(top, block.top + CLEAR_M);
  return top;
}

/** The place over the sea it comes from: of the bearings round the quiet deck's middle, those with nothing of the
 *  wreck near, the one most nearly ahead of the player and to their left, where the camera sees it come. */
function fromSea(
  blocks: readonly CourseBlock[],
  middle: readonly [number, number],
  feet: Point,
  facing: number,
): Point {
  let best: Point | null = null;
  let bestScore = -Infinity;
  for (let step = 0; step < 36; step++) {
    const bearing = (step / 36) * 2 * Math.PI;
    const [x, y] = [middle[0] + Math.sin(bearing) * FROM_M, middle[1] - Math.cos(bearing) * FROM_M];
    const near = blocks.some(
      (block) =>
        x > block.minX - SEA_CLEAR_M &&
        x < block.maxX + SEA_CLEAR_M &&
        y > block.minY - SEA_CLEAR_M &&
        y < block.maxY + SEA_CLEAR_M,
    );
    const score = Math.cos(bearing - (facing - 0.7));
    if (!near && score > bestScore) [best, bestScore] = [[x, y, feet[2] + FROM_UP_M], score];
  }
  return best ?? [middle[0], middle[1] - FROM_M, feet[2] + FROM_UP_M];
}

/** A point along a smooth way through `points` (Catmull-Rom), `share` of the way from the first to the last. */
function along(points: readonly Point[], share: number): Point {
  const legs = points.length - 1;
  const place = Math.min(legs, Math.max(0, share * legs));
  const leg = Math.min(legs - 1, Math.floor(place));
  const local = place - leg;
  const point = (index: number): Point => points[Math.min(legs, Math.max(0, index))] ?? [0, 0, 0];
  const [before, start, end, after] = [point(leg - 1), point(leg), point(leg + 1), point(leg + 2)];
  const [square, cube] = [local * local, local * local * local];
  const axis = (index: 0 | 1 | 2) =>
    0.5 *
    (2 * start[index] +
      (end[index] - before[index]) * local +
      (2 * before[index] - 5 * start[index] + 4 * end[index] - after[index]) * square +
      (3 * start[index] - before[index] - 3 * end[index] + after[index]) * cube);
  return [axis(0), axis(1), axis(2)];
}

/** The course for a player standing at `feet` facing `facing` on `layout`'s wreck. */
export function wispCourse(feet: Point, facing: number, layout: WreckLayout): WispCourse {
  const blocks = layout.course;
  const quiet = layout.zones[0]?.area ?? [feet[0] - 1, feet[1] - 1, feet[0] + 1, feet[1] + 1];
  const middle = [(quiet[0] + quiet[2]) / 2, (quiet[1] + quiet[3]) / 2] as const;
  const [mastX, mastY] = layout.masts.reduce(
    (nearest, mast) =>
      Math.hypot(mast[0] - feet[0], mast[1] - feet[1]) < Math.hypot(nearest[0] - feet[0], nearest[1] - feet[1])
        ? mast
        : nearest,
    layout.masts[0] ?? middle,
  );
  const deck = topAt(blocks, mastX, mastY) || feet[2];
  const from = fromSea(blocks, middle, feet, facing);
  // Round the mast, from the side it comes in from, then toward the player.
  const comeIn = Math.atan2(from[0] - mastX, -(from[1] - mastY));
  const round = ROUND_MAST.ups.map((up, index): Point => {
    const bearing = comeIn + (index * Math.PI) / 2;
    return [mastX + Math.sin(bearing) * ROUND_MAST.out, mastY - Math.cos(bearing) * ROUND_MAST.out, deck + up];
  });
  const toward: Point = [(mastX + feet[0]) / 2, (mastY + feet[1]) / 2, feet[2] + 3];
  const wander = [...round, toward];
  const chest: Point = [feet[0], feet[1], feet[2] + CHEST_M];
  const last = toward;
  const start = Math.atan2(last[1] - chest[1], last[0] - chest[0]);
  const { drift, wander: wandering, circle } = WISP_S;
  const ringAt = (into: number): Point => {
    const share = Math.min(1, into / circle);
    const turned = TURN[0] * into + ((TURN[1] - TURN[0]) * Math.min(into, circle) ** 2) / (2 * circle);
    const radius = RING_M[0] + (RING_M[1] - RING_M[0]) * eased(share);
    const rise = (1 - share) * (last[2] - chest[2]);
    return [
      chest[0] + Math.cos(start + turned) * radius,
      chest[1] + Math.sin(start + turned) * radius,
      chest[2] + rise,
    ];
  };
  const planned = (seconds: number): Point => {
    const bob: Point = [Math.sin(seconds * 1.3) * 0.1, Math.cos(seconds * 0.9) * 0.1, Math.sin(seconds * 2.1) * 0.25];
    const plus = (point: Point, share = 1): Point => [
      point[0] + bob[0] * share,
      point[1] + bob[1] * share,
      point[2] + bob[2] * share,
    ];
    if (seconds < drift) return plus(mix(from, wander[0] ?? toward, eased(seconds / drift)));
    if (seconds < drift + wandering) return plus(along(wander, (seconds - drift) / wandering));
    const into = seconds - drift - wandering;
    if (into < circle) return mix(last, ringAt(into), eased(into / 0.6));
    return mix(ringAt(circle), chest, eased((into - circle) / FLASH_IN_S));
  };
  const count = Math.ceil((ENGULF_AT_S + WISP_S.engulf) * SAMPLE_HZ) + 1;
  const near = blocks.filter(
    (block) =>
      block.maxX > quiet[0] - FROM_M - 5 &&
      block.minX < quiet[2] + FROM_M + 5 &&
      block.maxY > quiet[1] - FROM_M - 5 &&
      block.minY < quiet[3] + FROM_M + 5,
  );
  const points = Array.from({ length: count }, (unused, index) => planned(index / SAMPLE_HZ));
  // Lifted over every solid, then eased: it climbs to clear one before it, and sinks again only as fast as it climbs.
  const heights = points.map(([x, y, z]) => Math.max(z, clearOver(near, feet, x, y)));
  for (let index = 1; index < count; index++)
    heights[index] = Math.max(heights[index] ?? 0, (heights[index - 1] ?? 0) - CLIMB_M);
  for (let index = count - 2; index >= 0; index--)
    heights[index] = Math.max(heights[index] ?? 0, (heights[index + 1] ?? 0) - CLIMB_M);
  const samples = points.map(([x, y], index): Point => [x, y, heights[index] ?? 0]);
  return { samples, feet, facing, blocks: near };
}

/** The wisp `seconds` into its coming on `course`: where it is, which part of it, and how bright (0 to 1). */
export function wispAt(course: WispCourse, seconds: number): WispNow {
  const { drift, wander, circle, engulf } = WISP_S;
  const place = Math.max(0, seconds * SAMPLE_HZ);
  const index = Math.min(course.samples.length - 1, Math.floor(place));
  const here = mix(
    course.samples[index] ?? course.feet,
    course.samples[index + 1] ?? course.samples[index] ?? course.feet,
    Math.min(1, place - index),
  );
  if (seconds < drift) return { at: here, part: 'drift', glow: 0.55 };
  if (seconds < drift + wander) return { at: here, part: 'wander', glow: 0.6 + (0.1 * (seconds - drift)) / wander };
  if (seconds < ENGULF_AT_S)
    return { at: here, part: 'circle', glow: 0.7 + (0.3 * (seconds - drift - wander)) / circle };
  if (seconds < ENGULF_AT_S + engulf) return { at: here, part: 'engulf', glow: 1 };
  const [x, y, z] = course.feet;
  return { at: [x, y, z + CHEST_M], part: 'gone', glow: 0 };
}

/** How far behind it the following camera stands along its way (metres) and over it; and how far its look leans
 *  from the wisp toward the player's chest, a share of the camera's distance from it, so the wreck before it stands
 *  in the frame with the wisp near its middle. */
const CHASE_BACK_M = 3.2;
const CHASE_UP_M = 1.1;
const CHASE_LEAN = 0.25;

/** The following camera `seconds` in: behind the wisp along the way it came, a little over it, clear of the wreck,
 *  looking on past it to the player. */
export function chaseShot(course: WispCourse, seconds: number): { readonly eye: Point; readonly look: Point } {
  const now = wispAt(course, seconds).at;
  let behind = now;
  let walked = 0;
  for (let back = Math.floor(seconds * SAMPLE_HZ); back > 0 && walked < CHASE_BACK_M; back--) {
    const earlier = course.samples[back - 1] ?? behind;
    walked += Math.hypot(earlier[0] - behind[0], earlier[1] - behind[1], earlier[2] - behind[2]);
    behind = earlier;
  }
  const lifted = (z: number) => Math.max(z, clearOver(course.blocks, course.feet, behind[0], behind[1]) + 0.3);
  let eye: Point = [behind[0], behind[1], lifted(behind[2] + CHASE_UP_M)];
  // Brought nearer where the wreck stands between, as the camera on foot keeps clear of what is drawn.
  while (!clearBetween(course.blocks, eye, now) && Math.hypot(eye[0] - now[0], eye[1] - now[1]) > 1.6)
    eye = mix(eye, [now[0], now[1], eye[2]], 0.2);
  const [x, y, z] = course.feet;
  const lean = CHASE_LEAN * Math.hypot(now[0] - eye[0], now[1] - eye[1], now[2] - eye[2]);
  const apart = Math.hypot(x - now[0], y - now[1], z + CHEST_M - now[2]);
  return { eye, look: mix(now, [x, y, z + CHEST_M], Math.min(1, lean / Math.max(apart, 0.001))) };
}

/** The camera that watches the rings: of the places round the player, nearest first to 5.6 m out to their right and
 *  2.5 m up, the first from which the player's chest and the wisp at every moment of its rings and engulfing are seen
 *  in one frame with nothing of the wreck between. */
export function ringEye(course: WispCourse): Point {
  const [x, y, z] = course.feet;
  const chest: Point = [x, y, z + CHEST_M];
  const seen: Point[] = [];
  const from = Math.round((WISP_S.drift + WISP_S.wander) * SAMPLE_HZ);
  for (let index = from; index < course.samples.length; index += 3) seen.push(course.samples[index] ?? chest);
  const candidates: { eye: Point; cost: number }[] = [];
  for (const out of [5.6, 4.8, 6.6, 4, 3.2, 8]) {
    for (const up of [2.5, 3.2, 1.9, 4, 5.5, 7]) {
      for (let step = 0; step < 24; step++) {
        const bearing = (step / 24) * 2 * Math.PI;
        const eye: Point = [x + Math.sin(bearing) * out, y - Math.cos(bearing) * out, z + up];
        const off = bearing - course.facing - Math.PI / 2;
        const side = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
        candidates.push({ eye, cost: Math.abs(out - 5.6) + Math.abs(up - 2.5) + side });
      }
    }
  }
  candidates.sort((first, second) => first.cost - second.cost);
  // Both in one frame: the wisp never more than 0.75 rad from the chest as the camera sees them.
  const apartSeen = (eye: Point, point: Point) => {
    const [first, second] = [chest, point].map((each) => [each[0] - eye[0], each[1] - eye[1], each[2] - eye[2]]);
    const [one = [0, 0, 1], two = [0, 0, 1]] = [first, second];
    const dot = (one[0] ?? 0) * (two[0] ?? 0) + (one[1] ?? 0) * (two[1] ?? 0) + (one[2] ?? 0) * (two[2] ?? 0);
    return Math.acos(Math.min(1, dot / (Math.hypot(...one) * Math.hypot(...two))));
  };
  const clear = (eye: Point) =>
    !solidAt(course.blocks, eye) &&
    seen.every((point) => apartSeen(eye, point) < 0.75) &&
    [chest, ...seen].every((point) => clearBetween(course.blocks, eye, point));
  return (candidates.find(({ eye }) => clear(eye)) ?? candidates[0] ?? { eye: [x + 5.6, y, z + 2.5] }).eye;
}

/** Where the ring camera at `eye` looks `seconds` in: between the player's chest and the wisp as it sees them, the
 *  two an even turn either side, so both stand in the frame however its rings are lifted over the wreck. */
export function ringLook(course: WispCourse, seconds: number, eye: Point): Point {
  const [x, y, z] = course.feet;
  const toward = (point: Point): Point => {
    const along: Point = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const length = Math.hypot(...along) || 1;
    return [along[0] / length, along[1] / length, along[2] / length];
  };
  const [chest, wisp] = [toward([x, y, z + CHEST_M]), toward(wispAt(course, seconds).at)];
  return [eye[0] + chest[0] + wisp[0], eye[1] + chest[1] + wisp[1], eye[2] + chest[2] + wisp[2]];
}

/** How high a camera going from one place to another rises at the middle of its way (metres), over what stands
 *  between. */
const SWING_UP_M = 4;

/** A camera `share` of its way from `from` to `to` among `blocks`: along an arc rising over the wreck between; should
 *  even the arc pass through it, a cut at the middle of its time instead. */
export function swingTo(blocks: readonly CourseBlock[], from: Point, to: Point, share: number): Point {
  const along = (part: number): Point => {
    const [x, y, z] = mix(from, to, part);
    return [x, y, z + SWING_UP_M * Math.sin(Math.PI * part)];
  };
  const blocked = Array.from({ length: 41 }, (unused, step) => along(step / 40)).some((point) =>
    solidAt(blocks, point),
  );
  if (blocked) return share < 0.5 ? from : to;
  return along(share);
}
