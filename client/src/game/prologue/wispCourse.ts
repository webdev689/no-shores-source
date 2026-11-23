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
  const plannedAll = Array.from({ length: count }, (unused, index) => planned(index / SAMPLE_HZ));
  const points = closedIn(plannedAll, near, feet, Math.round((drift + wandering) * SAMPLE_HZ));
  // Lifted over every solid, then eased: it climbs to clear one before it, and sinks again only as fast as it climbs.
  const heights = points.map(([x, y, z]) => Math.max(z, clearOver(near, feet, x, y)));
  for (let index = 1; index < count; index++)
    heights[index] = Math.max(heights[index] ?? 0, (heights[index - 1] ?? 0) - CLIMB_M);
  for (let index = count - 2; index >= 0; index--)
    heights[index] = Math.max(heights[index] ?? 0, (heights[index + 1] ?? 0) - CLIMB_M);
  const samples = points.map(([x, y], index): Point => [x, y, heights[index] ?? 0]);
  return { samples, feet, facing, blocks: near };
}

/** How fast its rings may widen again once a solid has closed them in, metres a sixtieth of a second. */
const WIDEN_M = 0.08;

/** Its rings from sample `from` on, closed in toward the player where a solid stands within them at their height, so
 *  they keep low round the player's chest rather than rising over a rail or the wheel; eased, so they widen again no
 *  faster than `WIDEN_M`. */
function closedIn(points: readonly Point[], blocks: readonly CourseBlock[], feet: Point, from: number): Point[] {
  const radii = points.map(([x, y, z], index) => {
    const out = Math.hypot(x - feet[0], y - feet[1]);
    if (index < from) return out;
    let radius = out;
    const [east, south] = [(x - feet[0]) / (out || 1), (y - feet[1]) / (out || 1)];
    while (radius > RING_M[1] && clearOver(blocks, feet, feet[0] + east * radius, feet[1] + south * radius) > z)
      radius -= 0.1;
    return radius;
  });
  for (let index = from + 1; index < radii.length; index++)
    radii[index] = Math.min(radii[index] ?? 0, (radii[index - 1] ?? 0) + WIDEN_M);
  for (let index = radii.length - 2; index >= from; index--)
    radii[index] = Math.min(radii[index] ?? 0, (radii[index + 1] ?? 0) + WIDEN_M);
  const closed = points.map(([x, y, z], index): Point => {
    const out = Math.hypot(x - feet[0], y - feet[1]) || 1;
    const share = Math.min(1, (radii[index] ?? out) / out);
    return [feet[0] + (x - feet[0]) * share, feet[1] + (y - feet[1]) * share, z];
  });
  // Its wander's last second eased onto where the closed ring begins, so it comes in without a jump.
  const [first = feet, planned = feet] = [closed[from], points[from]];
  for (let index = Math.max(0, from - SAMPLE_HZ); index < from; index++) {
    const share = eased((index - (from - SAMPLE_HZ)) / SAMPLE_HZ);
    const [x, y, z] = closed[index] ?? feet;
    closed[index] = [x + (first[0] - planned[0]) * share, y + (first[1] - planned[1]) * share, z];
  }
  return closed;
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

/** How far behind it the following camera stands along its level way (metres) and over it; and how far its look leans
 *  from the wisp toward the player's chest, a share of the camera's distance from it, so the wreck before it stands
 *  in the frame with the wisp near its middle. */
const CHASE_BACK_M = 3.2;
const CHASE_UP_M = 1.1;
const CHASE_LEAN = 0.25;

/** The following camera `seconds` in: behind the wisp along the level way it has come over the last second (or
 *  will go, as it sets out), a little over it, clear of the wreck, looking on past it to the player. */
export function chaseShot(course: WispCourse, seconds: number): { readonly eye: Point; readonly look: Point } {
  const now = wispAt(course, seconds).at;
  const [x, y, z] = course.feet;
  const index = Math.min(course.samples.length - 1, Math.floor(seconds * SAMPLE_HZ));
  const level = (from: Point | undefined, to: Point | undefined): readonly [number, number] =>
    from && to ? [to[0] - from[0], to[1] - from[1]] : [0, 0];
  // Its way over the last second, or the next as it sets out; still, as it rises or sinks, from the player to it.
  const ways = [
    level(course.samples[Math.max(0, index - SAMPLE_HZ)], now),
    level(now, course.samples[Math.min(course.samples.length - 1, index + SAMPLE_HZ)]),
    level([x, y, z], now),
  ];
  const [wayX, wayY] = ways.find(([east, south]) => Math.hypot(east, south) > 0.5) ?? [0, 1];
  const length = Math.hypot(wayX, wayY) || 1;
  // The nearest of a few places back along it and up that sees it clear; else where it was a second ago.
  const places = [CHASE_BACK_M, 2.6, 2].flatMap((back) =>
    [CHASE_UP_M, 1.8, 2.6].map((up): Point => {
      const [east, south] = [now[0] - (wayX / length) * back, now[1] - (wayY / length) * back];
      return [east, south, Math.max(now[2] + up, clearOver(course.blocks, course.feet, east, south) + 0.3)];
    }),
  );
  const earlier = course.samples[Math.max(0, index - SAMPLE_HZ)] ?? now;
  const eye =
    places.find((place) => !solidAt(course.blocks, place) && clearBetween(course.blocks, place, now)) ??
    ([earlier[0], earlier[1], earlier[2] + 0.3] as Point);
  const lean = CHASE_LEAN * Math.hypot(now[0] - eye[0], now[1] - eye[1], now[2] - eye[2]);
  const apart = Math.hypot(x - now[0], y - now[1], z + CHEST_M - now[2]);
  return { eye, look: mix(now, [x, y, z + CHEST_M], Math.min(1, lean / Math.max(apart, 0.001))) };
}

/** The camera that watches the rings, a cutscene's shot and not a map's: of the places round the player 2.6 to 5.4 m
 *  out and 1 to 2.9 m over their deck (nearest first to 4.2 m out to their right and 1.8 m up), the first from which
 *  the player's chest and the wisp at every moment of its rings and engulfing are seen in one frame, looking a little
 *  down, with nothing of the wreck between the chest and it (the wisp at `SEEN_SHARE` of its moments). Near so, the
 *  player stands a third of the frame's height or more. */
/** The share of the wisp's moments in its rings the ring camera must see it clear. */
export const SEEN_SHARE = 0.95;

export function ringEye(course: WispCourse): Point {
  const [x, y, z] = course.feet;
  const chest: Point = [x, y, z + CHEST_M];
  const seen: Point[] = [];
  const from = Math.round((WISP_S.drift + WISP_S.wander) * SAMPLE_HZ);
  for (let index = from; index < course.samples.length; index += 3) seen.push(course.samples[index] ?? chest);
  const candidates: { eye: Point; cost: number }[] = [];
  for (const out of [4.2, 3.6, 4.8, 3.2, 5.4, 2.6]) {
    for (const up of [1.8, 2.4, 1.4, 2.9, 1]) {
      for (let step = 0; step < 36; step++) {
        const bearing = (step / 36) * 2 * Math.PI;
        const eye: Point = [x + Math.sin(bearing) * out, y - Math.cos(bearing) * out, z + up];
        const off = bearing - course.facing - Math.PI / 2;
        const side = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
        candidates.push({ eye, cost: Math.abs(out - 4.2) + Math.abs(up - 1.8) + side });
      }
    }
  }
  candidates.sort((first, second) => first.cost - second.cost);
  const unit = (eye: Point, point: Point): Point => {
    const along: Point = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
    const length = Math.hypot(...along) || 1;
    return [along[0] / length, along[1] / length, along[2] / length];
  };
  // Both in one frame (never more than 0.75 rad apart as it sees them), and the look between them a little down.
  const framed = (eye: Point, point: Point) => {
    const [one, two] = [unit(eye, chest), unit(eye, point)];
    const apart = Math.acos(Math.min(1, one[0] * two[0] + one[1] * two[1] + one[2] * two[2]));
    const look = [one[0] + two[0], one[1] + two[1], one[2] + two[2]] as const;
    const down = Math.atan2(-look[2], Math.hypot(look[0], look[1]));
    return apart < 0.75 && down > -0.15 && down < 0.5;
  };
  // The chest always seen clear, and the wisp at all but a twentieth of its moments: the course stands a rail or the
  // wheel as a wall 3.2 m over the deck, higher than either is, so a low camera loses it behind one a moment.
  const clear = (eye: Point) =>
    !solidAt(course.blocks, eye) &&
    clearBetween(course.blocks, eye, chest) &&
    seen.filter((point) => clearBetween(course.blocks, eye, point)).length >= seen.length * SEEN_SHARE;
  // Where no place frames them so, the nearest from which both are at least seen clear.
  const found =
    candidates.find(({ eye }) => seen.every((point) => framed(eye, point)) && clear(eye)) ??
    candidates.find(({ eye }) => clear(eye));
  return (found ?? candidates[0] ?? { eye: [x + 4.2, y, z + 1.8] }).eye;
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

/** How high a camera going from one shot to the next may rise at the middle of its way (metres), to pass over what
 *  stands between, and the steepest it may look down on the way. */
const RISES_M = [0, 1.5] as const;
const STEEPEST = Math.PI / 3;

type Seen = { readonly eye: Point; readonly look: Point };

/** The camera `share` of its way from the shot `from` to the shot `to` among `blocks`: its eye straight along, or
 *  rising a little over the wreck between, and its look eased between theirs, never through the wreck nor looking
 *  more than 60 degrees down; where neither way is so, a cut at the middle of its time. */
export function moveTo(blocks: readonly CourseBlock[], from: Seen, to: Seen, share: number): Seen {
  const along = (rise: number, part: number): Seen => {
    const [x, y, z] = mix(from.eye, to.eye, part);
    return { eye: [x, y, z + rise * Math.sin(Math.PI * part)], look: mix(from.look, to.look, part) };
  };
  const fits = (rise: number) =>
    Array.from({ length: 41 }, (unused, step) => along(rise, step / 40)).every(
      ({ eye, look }) =>
        !solidAt(blocks, eye) &&
        Math.atan2(eye[2] - look[2], Math.hypot(look[0] - eye[0], look[1] - eye[1])) <= STEEPEST,
    );
  const rise = RISES_M.find(fits);
  if (rise === undefined) return share < 0.5 ? from : to;
  return along(rise, share);
}
