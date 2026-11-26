import { type Orbit, rayAt } from '../editor/orbit.ts';
import { rayHit } from './playerCamera.ts';
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';

type Point = readonly [number, number, number];

/** A body as a shot meets it: an upright cylinder this wide and tall from its feet (crates/combat/src/tuning.rs). */
export const BODY_RADIUS = 0.35;
export const BODY_HEIGHT = 1.8;
/** The farthest the crosshair is laid, in metres: past it, the point that far out along the view. */
export const CROSSHAIR_REACH = 120;

/** How far along a ray (`from` plus shares of `along`) it enters a body standing at `feet`, or null. */
export function bodyHit(from: Point, along: Point, feet: Point): number | null {
  const [startX, startY] = [from[0] - feet[0], from[1] - feet[1]];
  const square = along[0] * along[0] + along[1] * along[1];
  if (square < 1e-12) return null;
  const half = startX * along[0] + startY * along[1];
  const reach = half * half - square * (startX * startX + startY * startY - BODY_RADIUS * BODY_RADIUS);
  if (reach < 0) return null;
  const enter = (-half - Math.sqrt(reach)) / square;
  const height = from[2] + along[2] * enter - feet[2];
  return enter > 0 && height >= 0 && height <= BODY_HEIGHT ? enter : null;
}

/** How far apart, in metres, the ray is tried against the ground before it narrows in on where it went under. */
const GROUND_STEP = 0.5;

/** How far along a ray (`from` plus shares of `along`, within `most`) it first goes under the ground `groundAt` gives
 *  (0 where it gives none); `most` when it never does, or starts under it. */
function groundHit(from: Point, along: Point, most: number, groundAt: GroundAt): number {
  const under = (share: number) =>
    from[2] + along[2] * share <= (groundAt(from[0] + along[0] * share, from[1] + along[1] * share) ?? 0);
  if (under(0)) return most;
  const steps = Math.max(1, Math.ceil((most * Math.hypot(...along)) / GROUND_STEP));
  for (let step = 1; step <= steps; step++) {
    let [over, below] = [((step - 1) / steps) * most, (step / steps) * most];
    if (!under(below)) continue;
    for (let halving = 0; halving < 16; halving++) {
      const middle = (over + below) / 2;
      if (under(middle)) below = middle;
      else over = middle;
    }
    return below;
  }
  return most;
}

/** The ground's height at a place, or null where none is known. */
type GroundAt = (x: number, y: number) => number | null;

/** Where the middle of the view first meets something an aimed shot would: a block, the ground (`groundAt`'s, else
 *  level at 0), or one of `bodies` (each by its feet), out to CROSSHAIR_REACH; the point at the reach when it meets
 *  none. */
export function crosshairPoint(
  orbit: Orbit,
  aspect: number,
  blocks: readonly Block[],
  bodies: readonly Point[],
  groundAt?: GroundAt,
): Point {
  const { origin, direction } = rayAt(orbit, aspect, 0, 0);
  const along: Point = [direction[0] * CROSSHAIR_REACH, direction[1] * CROSSHAIR_REACH, direction[2] * CROSSHAIR_REACH];
  const far: Point = [origin[0] + along[0], origin[1] + along[1], origin[2] + along[2]];
  let share = rayHit(origin, far, blocks);
  if (groundAt) share = groundHit(origin, along, share, groundAt);
  else if (along[2] < 0 && origin[2] > 0) share = Math.min(share, origin[2] / -along[2]);
  for (const feet of bodies) share = Math.min(share, bodyHit(origin, along, feet) ?? 1);
  return [origin[0] + along[0] * share, origin[1] + along[1] * share, origin[2] + along[2] * share];
}

/** The feet of each body drawn (`drawn`, by the room's number) that a player's aimed shot would stop on, as the room
 *  flies it: a living foe, never a dead one, one of the players' side, nor one still arriving, which no shot meets
 *  until it lands (`foes`, the fight's). */
export function shotBodies(
  drawn: ReadonlyMap<number, { readonly x: number; readonly y: number; readonly z: number }>,
  foes: ReadonlyMap<number, { readonly view: Pick<FighterView, 'side' | 'action'>; readonly arrival?: unknown }>,
): Point[] {
  return [...drawn]
    .filter(([id]) => {
      const foe = foes.get(id);
      const view = foe?.view;
      return view !== undefined && !foe?.arrival && view.side !== 'players' && view.action.kind !== 'dead';
    })
    .map(([, { x, y, z }]) => [x, y, z] as const);
}
