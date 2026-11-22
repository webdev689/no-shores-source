/** While aiming, the look may rise this far over the horizon (radians), so it reaches the guns' longest throw on the
 *  water, as DFO's free look does. */
export const AIM_LOOK_TOP = 0.15;
/** Past the dip where the look's point moves out faster than this (metres a degree), it goes on at this rate. */
export const AIM_SLOPE = 30;

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

/** The pitch (radians, up positive) whose look from an eye `height` over the water lays `reach` out: `lookReach`
 *  undone. */
export function lookPitch(reach: number, height: number): number {
  const slope = AIM_SLOPE / (Math.PI / 180);
  const eye = Math.max(0.5, height);
  const knee = Math.asin(Math.min(1, Math.sqrt(eye / slope)));
  const kneeReach = eye / Math.tan(knee);
  return reach <= kneeReach ? -Math.atan(eye / Math.max(1e-6, reach)) : -(knee - (reach - kneeReach) / slope);
}

/** A look's bearing off its bow, degrees in (-180, 180], starboard positive. */
export function lookBearing(lookYaw: number, heading: number): number {
  const turn = (((lookYaw - heading) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const degrees = (turn * 180) / Math.PI;
  return degrees > 180 ? degrees - 360 : degrees;
}
