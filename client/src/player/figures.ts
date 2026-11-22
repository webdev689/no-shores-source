import type { Dress } from './dressing.ts';

/** The forge drew every picture at 62 pixels a metre. */
export const PX_PER_M = 62;
/** Each of the 8 turns between a figure's facing and the eye, as the forge's five views: 0 the front, 4 the back. The
 *  turns past the back are the views on the other side, mirrored. */
const VIEW_OF_TURN = [0, 1, 2, 3, 4, 3, 2, 1] as const;

/** A figure placed on the ground: where it stands (x east, y south, z up), the compass bearing it faces, and how it
 *  moves. */
export interface Placed {
  readonly id: number;
  x: number;
  y: number;
  z: number;
  facing: number;
  dress: Dress;
  anim: string;
  /** The move's frame to show, or null to play it round. */
  frame: number | null;
  spin: boolean;
}

/** The compass bearing from one point to another: 0 north (-y), a quarter turn east (+x). */
export function bearing(fromX: number, fromY: number, toX: number, toY: number): number {
  return Math.atan2(toX - fromX, fromY - toY);
}

/** The forge view a figure is seen in from an eye, and whether it is drawn mirrored. A figure facing the eye shows
 *  view 0; turned to the eye's left, the views count up to its back. */
export function viewOf(
  facing: number,
  figureX: number,
  figureY: number,
  eyeX: number,
  eyeY: number,
): { view: number; flip: boolean } {
  const turned = facing - bearing(figureX, figureY, eyeX, eyeY);
  const turn = (((Math.round(turned / (Math.PI / 4)) % 8) + 8) % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  return { view: VIEW_OF_TURN[turn], flip: turn > 4 };
}

/** The frame of an animation showing `seconds` into it, looping at `fps` frames a second. */
export function frameAt(seconds: number, frames: number, fps: number): number {
  return frames > 0 ? Math.floor(Math.max(0, seconds) * fps) % frames : 0;
}

/** How far a figure's card stands in front of its body's centre, toward the eye: a body's radius in the movement
 *  rules. A card is flat, so standing at the centre, a wall the body touches or a lip it is going over would cut it. */
const CARD_FORWARD_M = 0.35;
/** In first person no other figure's card stands nearer the eye than this, metres: one nearer, a foe in a melee,
 *  would fill the view; it stands this far off along the same line instead. */
export const CARD_NEAREST_M = 1.5;

/** Where a figure's card stands: its body's centre (x, y) moved toward the eye by the body's radius, never past it,
 *  and never nearer the eye than `nearest` (`CARD_NEAREST_M` for another figure seen in first person). */
export function cardStand(x: number, y: number, eyeX: number, eyeY: number, nearest = 0): { x: number; y: number } {
  const [toEyeX, toEyeY] = [eyeX - x, eyeY - y];
  const length = Math.hypot(toEyeX, toEyeY);
  if (length < 1e-6) return { x, y };
  const toward = 1 - Math.max(nearest, length - CARD_FORWARD_M, 0) / length;
  return { x: x + toEyeX * toward, y: y + toEyeY * toward };
}

/** Where the eye of an orbit stands: back from its target along the bearing it looks, raised by its pitch. */
export function eyeOf(orbit: {
  readonly targetX: number;
  readonly targetY: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}): { x: number; y: number } {
  const flat = Math.cos(orbit.pitch) * orbit.distance;
  return { x: orbit.targetX - Math.sin(orbit.yaw) * flat, y: orbit.targetY + Math.cos(orbit.yaw) * flat };
}
