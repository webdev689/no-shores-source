// A walker's path along the ways: kept `KEEP_RIGHT_M` right of each way's middle, so two walking a way toward each
// other pass side by side, never head on, and its corners rounded, so a walker turns as a person does. A path's ends
// stay where they are: the posts a walker leaves and comes to stand off the ways.

type Point = readonly [number, number];

/** How far right of a way's middle a walker keeps, metres. */
export const KEEP_RIGHT_M = 0.7;
/** How far before and after a corner a walker starts and ends turning, metres, at most. */
const TURN_M = 1.6;
/** How far from a post a walker leaving it or coming to it keeps right of the line to it, metres at most: off the
 *  ways too, two going opposite ways to and from a post pass side by side but at the post itself. */
const POST_M = 1;
/** How many points a rounded corner is drawn through. */
const TURN_POINTS = 5;
const NEAR = 1e-6;

/** A path: its points in turn, and how far along it each stands, metres. */
export interface Path {
  readonly points: readonly Point[];
  readonly along: readonly number[];
  readonly length: number;
}

/** Where a walker stands at a point of a path, and the compass bearing they face. */
export interface Along {
  readonly place: Point;
  readonly facing: number;
}

const apart = (one: Point, two: Point) => Math.hypot(two[0] - one[0], two[1] - one[1]);
const unit = (from: Point, to: Point): Point => {
  const length = apart(from, to) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};
/** The right of a heading, x east and y south: facing north (-y), the right is east. */
const rightOf = ([east, south]: Point): Point => [-south, east];
const plus = (point: Point, [east, south]: Point, metres: number): Point => [
  point[0] + east * metres,
  point[1] + south * metres,
];

/** The points of a walk through `points` in turn, the first and last kept and every one between moved right of the
 *  ways meeting there: where the two offset ways cross, or round the point where the walk turns back on itself. The
 *  walk leaves its first point and comes to its last kept right too, from `POST_M` off them. */
function keptRight(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  const offPost = (post: Point, toward: Point, end: boolean): Point | null => {
    const reach = Math.min(POST_M, apart(post, toward) / 3);
    if (reach < NEAR) return null;
    const along = end ? unit(toward, post) : unit(post, toward);
    return plus(plus(post, along, end ? -reach : reach), rightOf(along), KEEP_RIGHT_M);
  };
  points.forEach((point, nth) => {
    const [before, after] = [points[nth - 1], points[nth + 1]];
    if (!before && after) {
      kept.push(point);
      const off = offPost(point, after, false);
      return void (off && kept.push(off));
    }
    if (before && !after) {
      const off = offPost(point, before, true);
      if (off) kept.push(off);
      return void kept.push(point);
    }
    if (!before || !after) return void kept.push(point);
    const [inward, outward] = [unit(before, point), unit(point, after)];
    const [rightIn, rightOut] = [rightOf(inward), rightOf(outward)];
    const turn = inward[0] * outward[1] - inward[1] * outward[0];
    const ahead = inward[0] * outward[0] + inward[1] * outward[1];
    if (ahead < -0.9) {
      // Back the way it came: round the point, beyond it, from one side of the way to the other.
      for (let step = 0; step <= TURN_POINTS; step++) {
        const angle = (Math.PI * step) / TURN_POINTS;
        const [across, ahead] = [Math.cos(angle), Math.sin(angle)];
        kept.push([
          point[0] + (rightIn[0] * across + inward[0] * ahead) * KEEP_RIGHT_M,
          point[1] + (rightIn[1] * across + inward[1] * ahead) * KEEP_RIGHT_M,
        ]);
      }
      return;
    }
    if (Math.abs(turn) < NEAR) return void kept.push(plus(point, rightIn, KEEP_RIGHT_M));
    // Where the way in, moved right, meets the way out, moved right.
    const start = plus(before, rightIn, KEEP_RIGHT_M);
    const meet = plus(point, rightOut, KEEP_RIGHT_M);
    const share = ((meet[0] - start[0]) * outward[1] - (meet[1] - start[1]) * outward[0]) / turn;
    kept.push(plus(start, inward, share));
  });
  return kept;
}

/** Each corner of a walk rounded: the walk starts turning before it and ends after, on a curve through it. */
function rounded(points: readonly Point[]): Point[] {
  const round: Point[] = [];
  points.forEach((point, nth) => {
    const [before, after] = [points[nth - 1], points[nth + 1]];
    if (!before || !after) return void round.push(point);
    const reach = Math.min(TURN_M, apart(before, point) * 0.45, apart(point, after) * 0.45);
    const [inward, outward] = [unit(before, point), unit(point, after)];
    if (reach < NEAR || inward[0] * outward[0] + inward[1] * outward[1] > 1 - NEAR) return void round.push(point);
    const [into, outOf] = [plus(point, inward, -reach), plus(point, outward, reach)];
    for (let step = 0; step <= TURN_POINTS; step++) {
      const share = step / TURN_POINTS;
      const [early, middle, late] = [(1 - share) ** 2, 2 * share * (1 - share), share ** 2];
      round.push([
        early * into[0] + middle * point[0] + late * outOf[0],
        early * into[1] + middle * point[1] + late * outOf[1],
      ]);
    }
  });
  return round;
}

/** A walker's path through `points` in turn: kept right of the ways between its two ends, its corners rounded. */
export function pathThrough(points: readonly Point[]): Path {
  const kept: Point[] = [];
  for (const point of rounded(keptRight(points)))
    if (!kept.length || apart(kept[kept.length - 1] as Point, point) > NEAR) kept.push(point);
  const along = [0];
  for (let nth = 1; nth < kept.length; nth++)
    along.push((along[nth - 1] ?? 0) + apart(kept[nth - 1] as Point, kept[nth] as Point));
  return { points: kept, along, length: along[along.length - 1] ?? 0 };
}

/** Where a walker stands `metres` along a path, and faces: along it, or as they reached its end. */
export function alongPath(path: Path, metres: number): Along {
  const { points, along } = path;
  let [low, high] = [0, points.length - 1];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((along[middle] ?? 0) <= metres) low = middle;
    else high = middle;
  }
  const [from, to] = [points[low] as Point, (points[high] ?? points[low]) as Point];
  const length = (along[high] ?? 0) - (along[low] ?? 0);
  const share = length > NEAR ? Math.min(1, Math.max(0, (metres - (along[low] ?? 0)) / length)) : 1;
  const place: Point = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
  return { place, facing: Math.atan2(to[0] - from[0], from[1] - to[1]) };
}
