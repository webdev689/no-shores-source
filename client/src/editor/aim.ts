import { headingFrame } from '../rules/landRules.ts';

/** DFO's aim eye while laying a broadside: this far out from its middle (past its ports), up from its waterline and
 *  aft of its middle, metres. */
export const AIM_EYE = { out: 5.1, up: 5.5, aft: 3 } as const;
/** While aiming, the look may rise this far over the horizon (radians), so it reaches the guns' longest throw on the
 *  water, as DFO's free look does. */
export const AIM_LOOK_TOP = 0.15;
/** Past the dip where the look's point moves out faster than this (metres a degree), it goes on at this rate. */
export const AIM_SLOPE = 30;

/** Where it lies, for the aim: its middle (metres east and south), its heading and its waterline's height. */
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

/** A look's bearing off its bow, degrees in (-180, 180], starboard positive. */
export function lookBearing(lookYaw: number, heading: number): number {
  const turn = (((lookYaw - heading) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const degrees = (turn * 180) / Math.PI;
  return degrees > 180 ? degrees - 360 : degrees;
}

/** No battery bears within this of the bow or the stern, degrees: the rules' `BOW_ARC_DEG` and `STERN_ARC_DEG`
 *  (crates/naval/src/arms.rs). A look outside lays nothing, so the aim and its lay are gone. */
export const BATTERY_ARC_DEG = { bow: 35, stern: 40 } as const;
/** A look held back into the arc stands this far inside its end, degrees, so it lays every frame. */
const ARC_INSIDE_DEG = 1;

/** The side whose battery a look bears on (1 starboard, -1 port), or null for one over the bow or the stern. */
export function batterySide(lookYaw: number, heading: number): 1 | -1 | null {
  const bearing = lookBearing(lookYaw, heading);
  const off = Math.abs(bearing);
  if (off <= BATTERY_ARC_DEG.bow || off >= 180 - BATTERY_ARC_DEG.stern) return null;
  return bearing > 0 ? 1 : -1;
}

/** `lookYaw` held within the arc of `side`'s battery (1 starboard, -1 port) on a ship heading `heading`: a look past
 *  either end, or across the bow or the stern onto the other side, comes back to the nearer end. */
export function yawInBattery(lookYaw: number, heading: number, side: 1 | -1): number {
  const bearing = lookBearing(lookYaw, heading) * side;
  const [least, most] = [BATTERY_ARC_DEG.bow, 180 - BATTERY_ARC_DEG.stern];
  if (bearing > least && bearing < most) return lookYaw;
  const held = bearing >= most || bearing < -90 ? most - ARC_INSIDE_DEG : least + ARC_INSIDE_DEG;
  return lookYaw + ((held - bearing) * side * Math.PI) / 180;
}

/** The aim eye on the ship's starboard (`side` 1) or port (-1) side, in the world. */
export function aimEye(ship: Lying, side: number): [number, number, number] {
  const { forward, starboard } = headingFrame(ship.heading);
  return [
    ship.x + starboard[0] * AIM_EYE.out * side - forward[0] * AIM_EYE.aft,
    ship.y + starboard[1] * AIM_EYE.out * side - forward[1] * AIM_EYE.aft,
    ship.heave + AIM_EYE.up,
  ];
}

/** How far out along its fire a look from `eye` along `lookYaw` (radians clockwise from north) and `pitch` lays,
 *  counted from its middle: where it meets the water, carried onto the line its guns fire along. */
export function lookRange(ship: Lying, eye: readonly [number, number, number], lookYaw: number, pitch: number): number {
  const reach = lookReach(pitch, eye[2] - ship.heave);
  const point = [eye[0] + Math.sin(lookYaw) * reach, eye[1] - Math.cos(lookYaw) * reach];
  const { starboard } = headingFrame(ship.heading);
  const side = lookBearing(lookYaw, ship.heading) >= 0 ? 1 : -1;
  return ((point[0] ?? 0) - ship.x) * starboard[0] * side + ((point[1] ?? 0) - ship.y) * starboard[1] * side;
}
