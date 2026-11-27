// The helm's keys at sea in the Sealevel view, as in a fight: A and D turn it while held, W sets it sailing
// straight ahead at ×60, eased to true speed while watched close, S heaves it to. Straight ahead is a course to the
// farthest point that way short of the first coast, so the sea room, which refuses a course whose leg meets a coast,
// takes every one sent.
import { WORLD_FRAME } from '../overworld/worldFrame.ts';
import type { Point2 } from '../overworld/ground.ts';

/** How fast the helm turns it under sail, radians a second: Come Sail Away's (crates/sailing/src/helm.rs,
 *  `turn_speed_sail`). */
export const HELM_TURN = (10 * Math.PI) / 180;

/** A course straight ahead reaches this far; stops this far short of a coast; is set again once less than `renewM`
 *  of it is left; and is not worth setting under `leastM`, metres. */
export const AHEAD = { reachM: 20_000, shortM: 500, renewM: 5_000, leastM: 200 } as const;

const TURN = 2 * Math.PI;

/** A heading turned by `turn` radians, kept in one turn. */
export function turned(heading: number, turn: number): number {
  return (((heading + turn) % TURN) + TURN) % TURN;
}

/** How far along a ray from `from` heading `way` (a unit vector) it first meets the segment from `a` to `b`; Infinity
 *  where it never does. */
function meetsAt(from: Point2, way: Point2, a: Point2, b: Point2): number {
  const edge: Point2 = [b[0] - a[0], b[1] - a[1]];
  const across = way[0] * edge[1] - way[1] * edge[0];
  if (Math.abs(across) < 1e-12) return Infinity;
  const toStart: Point2 = [a[0] - from[0], a[1] - from[1]];
  const along = (toStart[0] * edge[1] - toStart[1] * edge[0]) / across;
  const share = (toStart[0] * way[1] - toStart[1] * way[0]) / across;
  return along >= 0 && share >= 0 && share <= 1 ? along : Infinity;
}

/** The world's frame as a ring: the sea room takes no point past it. */
const FRAME_RING: readonly Point2[] = [
  [0, 0],
  [WORLD_FRAME.widthM, 0],
  [WORLD_FRAME.widthM, WORLD_FRAME.heightM],
  [0, WORLD_FRAME.heightM],
];

/** The farthest point straight ahead of `from` along `heading` (radians clockwise from north), up to `reachM`, and
 *  `shortM` short of the first coast of `outlines` the way meets, or of the world's frame; null where that leaves less
 *  than `leastM`. */
export function clearAhead(
  outlines: readonly (readonly Point2[])[],
  from: Point2,
  heading: number,
  reachM: number = AHEAD.reachM,
): Point2 | null {
  const way: Point2 = [Math.sin(heading), -Math.cos(heading)];
  let nearest = Infinity;
  for (const ring of [...outlines, FRAME_RING]) {
    for (let index = 0; index < ring.length; index++) {
      const [a, b] = [ring[index], ring[(index + 1) % ring.length]];
      if (a && b) nearest = Math.min(nearest, meetsAt(from, way, a, b));
    }
  }
  const length = Math.min(reachM, nearest - AHEAD.shortM);
  if (length < AHEAD.leastM) return null;
  return [from[0] + way[0] * length, from[1] + way[1] * length];
}
