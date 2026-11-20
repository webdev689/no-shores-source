import { headingFrame } from '../rules/landRules.ts';

/** DFO's aim eye while laying a broadside: this far out from her middle (past her ports), up from her waterline and
 *  aft of her middle, metres. */
export const AIM_EYE = { out: 5.1, up: 5.5, aft: 3 } as const;
/** While aiming, the look may rise this far over the horizon (radians), so it reaches the guns' longest throw on the
 *  water, as DFO's free look does. */
export const AIM_LOOK_TOP = 0.15;
/** Past the dip where the look's point moves out faster than this (metres a degree), it goes on at this rate. */
export const AIM_SLOPE = 30;

/** Where she lies, for the aim: her middle (metres east and south), her heading and her waterline's height. */
export interface Lying {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly heave: number;
}

/** How far out a look lays from the foot of an eye `height` over the water (DFO's lookReach): where it meets the water
 *  while that moves out less than `AIM_SLOPE` a degree, then on at that rate through the horizon and over it.
 *  `pitch` is radians, up positive. */
export function lookReach(pitch: number, height: number): number {
  const slope = AIM_SLOPE / (Math.PI / 180);
  const eye = Math.max(0.5, height);
  const knee = Math.asin(Math.min(1, Math.sqrt(eye / slope)));
  const dip = -pitch;
  return dip >= knee ? eye / Math.tan(dip) : eye / Math.tan(knee) + slope * (knee - dip);
}

/** A look's bearing off her bow, degrees in (-180, 180], starboard positive. */
export function lookBearing(lookYaw: number, heading: number): number {
  const turn = (((lookYaw - heading) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const degrees = (turn * 180) / Math.PI;
  return degrees > 180 ? degrees - 360 : degrees;
}

/** The aim eye on her starboard (`side` 1) or port (-1) side, in the world. */
export function aimEye(ship: Lying, side: number): [number, number, number] {
  const { forward, starboard } = headingFrame(ship.heading);
  return [
    ship.x + starboard[0] * AIM_EYE.out * side - forward[0] * AIM_EYE.aft,
    ship.y + starboard[1] * AIM_EYE.out * side - forward[1] * AIM_EYE.aft,
    ship.heave + AIM_EYE.up,
  ];
}

/** How far out along her fire a look from `eye` along `lookYaw` (radians clockwise from north) and `pitch` lays,
 *  counted from her middle: where it meets the water, carried onto the line her guns fire along. */
export function lookRange(ship: Lying, eye: readonly [number, number, number], lookYaw: number, pitch: number): number {
  const reach = lookReach(pitch, eye[2] - ship.heave);
  const point = [eye[0] + Math.sin(lookYaw) * reach, eye[1] - Math.cos(lookYaw) * reach];
  const { starboard } = headingFrame(ship.heading);
  const side = lookBearing(lookYaw, ship.heading) >= 0 ? 1 : -1;
  return ((point[0] ?? 0) - ship.x) * starboard[0] * side + ((point[1] ?? 0) - ship.y) * starboard[1] * side;
}
