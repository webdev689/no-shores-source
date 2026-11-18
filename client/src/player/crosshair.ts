import { type Orbit, rayAt } from '../editor/orbit.ts';
import { rayHit } from './playerCamera.ts';
import type { Block } from '../rules/movementRules.ts';

type Point = readonly [number, number, number];

/** A body as a shot meets it: an upright cylinder this wide and tall from its feet (crates/combat/src/tuning.rs). */
const BODY_RADIUS = 0.35;
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

/** The ground's height at a point, metres: the Test Ground's open ground is 0 m everywhere. */
export type GroundAt = (x: number, y: number) => number;
const OPEN_GROUND: GroundAt = () => 0;
/** Points the crosshair's line is tried against the ground at, out to its reach, and met between by a straight line. */
const GROUND_STEPS = 60;

/** How far along a ray (`from` plus shares of `along`) it first goes under the ground, from over it, tried at `steps`
 *  points and met straight between them (exact on level ground); 1 where it stays over it. */
export function groundShare(from: Point, along: Point, groundAt: GroundAt, steps = 1): number {
  let over = from[2] - groundAt(from[0], from[1]);
  if (over < 0) return 1;
  for (let step = 1; step <= steps; step++) {
    const share = step / steps;
    const under = from[2] + along[2] * share - groundAt(from[0] + along[0] * share, from[1] + along[1] * share);
    if (under < 0) return (step - 1 + over / (over - under)) / steps;
    over = under;
  }
  return 1;
}

/** How far along a shot's step (`from` plus shares of `along`) it first meets a block, the ground or one of `bodies`
 *  (each by its feet); 1 where it meets none. */
export function shotStop(
  from: Point,
  along: Point,
  blocks: readonly Block[],
  bodies: readonly Point[],
  groundAt: GroundAt = OPEN_GROUND,
): number {
  const to: Point = [from[0] + along[0], from[1] + along[1], from[2] + along[2]];
  let share = Math.min(rayHit(from, to, blocks), groundShare(from, along, groundAt));
  for (const feet of bodies) share = Math.min(share, bodyHit(from, along, feet) ?? 1);
  return share;
}

/** Where the middle of the view first meets something an aimed shot would: a block, the ground, or one of `bodies`
 *  (each by its feet), out to CROSSHAIR_REACH; the point at the reach when it meets none. */
export function crosshairPoint(
  orbit: Orbit,
  aspect: number,
  blocks: readonly Block[],
  bodies: readonly Point[],
  groundAt: GroundAt = OPEN_GROUND,
): Point {
  const { origin, direction } = rayAt(orbit, aspect, 0, 0);
  const along: Point = [direction[0] * CROSSHAIR_REACH, direction[1] * CROSSHAIR_REACH, direction[2] * CROSSHAIR_REACH];
  const far: Point = [origin[0] + along[0], origin[1] + along[1], origin[2] + along[2]];
  let share = Math.min(rayHit(origin, far, blocks), groundShare(origin, along, groundAt, GROUND_STEPS));
  for (const feet of bodies) share = Math.min(share, bodyHit(origin, along, feet) ?? 1);
  return [origin[0] + along[0] * share, origin[1] + along[1] * share, origin[2] + along[2] * share];
}

/** How far out along the view's ray the first person's muzzle stands, in metres. */
export const MUZZLE_OUT = 0.55;

/** The first person's muzzle in the world: its point on the design screen (320 by 200 pixels over the whole canvas)
 *  carried out from the eye along the view's ray through it. */
export function screenMuzzle(orbit: Orbit, aspect: number, design: readonly [number, number]): Point {
  const { origin, direction } = rayAt(orbit, aspect, design[0] / 160 - 1, 1 - design[1] / 100);
  return [
    origin[0] + direction[0] * MUZZLE_OUT,
    origin[1] + direction[1] * MUZZLE_OUT,
    origin[2] + direction[2] * MUZZLE_OUT,
  ];
}
