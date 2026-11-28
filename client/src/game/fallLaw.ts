// A fall in a social space as the player sees and hears it: the shot held where it was when the room said they fell,
// turning to keep the body in view; the body tumbling down and lying where it lands; the whistle of the drop; and the
// moment the veil and "You fell." come, once the fall has played.

import { lookAt, type Point3 } from '../cinema/rail.ts';
import type { Standing } from '../network/messages.ts';
import type { Mode } from '../rules/movementRules.ts';
import { panShot, type Shot } from './camera.ts';

/** The longest the fall plays before death is told, seconds since the room said the player fell. */
export const FALL_MOST_S = 3;
/** How long the body lies, landed, before death is told: long enough to see it land, seconds. */
export const LANDED_BEAT_S = 0.6;
/** How fast the held shot turns onto the body: the share of the way left it closes each second is 1 - e^-this. */
const TURN_RATE = 4;
/** How far over the feet the held shot looks: about a body's middle. */
const AIM_OVER_FEET_M = 0.9;
/** How tall a window round the body the held shot's lens narrows to as it drops away, metres, and the narrowest the
 *  lens goes, radians: far below, the body still reads, never smaller than this share of the view. */
const FRAMED_M = 14;
const NARROWEST_FOV = 0.3;
/** How fast a tumbling body spins about, turns a second. */
export const TUMBLE_TURNS_A_SECOND = 1.5;
/** The whistle's pitch as the fall begins, and the lowest it drops to, hertz; it falls an octave in this many
 *  seconds. */
const WHISTLE_FROM_HZ = 1900;
const WHISTLE_FLOOR_HZ = 320;
const WHISTLE_OCTAVE_S = 1.1;

/** How a fallen body shows: tumbling while it falls, lying once its feet are down; null for no fall. */
export type FallShown = 'tumbling' | 'lying' | null;

/** How the player's body shows with the room's word on their standing and its mode as the page predicts it. */
export function fallShown(standing: Standing, mode: Mode): FallShown {
  if (standing.kind !== 'dead' || !standing.fell) return null;
  return mode === 'air' ? 'tumbling' : 'lying';
}

/** Whether death may be told, `secondsDead` after it: at once for straying; for a fall, once the body has lain
 *  LANDED_BEAT_S (it landed `landedAt` seconds after death, null while it falls) or FALL_MOST_S have passed. */
export function fallPlayed(fell: boolean, secondsDead: number, landedAt: number | null): boolean {
  if (!fell || secondsDead >= FALL_MOST_S) return true;
  return landedAt !== null && secondsDead >= landedAt + LANDED_BEAT_S;
}

/** The held shot one frame `seconds` on from `last`: `held`'s eye, its look turned smoothly (the short way) toward
 *  the body whose feet are at `feet`, and its lens narrowing as smoothly to frame the body as it drops away. */
export function heldShot(held: Shot, last: Shot, feet: Point3, seconds: number): Shot {
  const middle: Point3 = [feet[0], feet[1], feet[2] + AIM_OVER_FEET_M];
  const look = lookAt(held.eye, middle);
  const away = Math.hypot(middle[0] - held.eye[0], middle[1] - held.eye[1], middle[2] - held.eye[2]);
  const framed = Math.max(NARROWEST_FOV, 2 * Math.atan(FRAMED_M / 2 / Math.max(away, 1e-3)));
  const share = 1 - Math.exp(-TURN_RATE * Math.max(0, seconds));
  const from = { ...held, yaw: last.yaw, pitch: last.pitch, fov: last.fov };
  return panShot(from, { ...held, ...look, fov: Math.min(held.fov, framed) }, share);
}

/** The facing of a tumbling body that faced `facing` as it died, `secondsDead` after: spinning about, within a turn. */
export function tumbleFacing(facing: number, secondsDead: number): number {
  const turned = facing + 2 * Math.PI * TUMBLE_TURNS_A_SECOND * secondsDead;
  return ((turned % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

/** The falling whistle's pitch `seconds` into the fall, hertz: high, sliding down an octave each WHISTLE_OCTAVE_S, to
 *  its floor. */
export function whistlePitch(seconds: number): number {
  return Math.max(WHISTLE_FLOOR_HZ, WHISTLE_FROM_HZ * 2 ** (-Math.max(0, seconds) / WHISTLE_OCTAVE_S));
}
