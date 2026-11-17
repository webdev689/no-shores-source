import type { Vector } from './spray.ts';

/** DaggerBlood's explosive death: ten chunks thrown up to 15 m/s sideways and 5 to 15 upward, falling at three times
 *  Unity's gravity under a drag of 0.1, stepped at Unity's fixed 0.02 s so the arc is the same at any frame rate, and
 *  frozen where they lie after four seconds. Where one lands it sprays 20's worth of blood; it never bounces. */
export const GIB_COUNT = 10;
export const GIB_THROW_SIDE = 15;
export const GIB_THROW_UP = { min: 5, max: 15 } as const;
export const UNITY_GRAVITY = 9.81;
export const GIB_GRAVITY = UNITY_GRAVITY * 3;
export const GIB_DRAG = 0.1;
export const GIB_LIFE = 4;
export const GIB_FIXED_STEP = 0.02;
export const GIB_SPLASH_RATE = 20;
/** A chunk's splat is sprayed from a hand's breadth above where it landed, so its ray never starts on the surface. */
export const GIB_SPRAY_LIFT = 0.1;

export interface Gib {
  position: Vector;
  velocity: [number, number, number];
  age: number;
  banked: number;
  still: boolean;
}

/** The segment a faller wants to travel this frame, for the scene to test before it moves. */
export interface Segment {
  readonly from: Vector;
  readonly direction: Vector;
  readonly distance: number;
  readonly to: Vector;
}

export function throwGibs(where: Vector, random: () => number, count = GIB_COUNT): Gib[] {
  return Array.from({ length: Math.max(0, Math.min(Math.floor(count), GIB_COUNT * 10)) }, () => ({
    position: where,
    velocity: [
      (random() * 2 - 1) * GIB_THROW_SIDE,
      (random() * 2 - 1) * GIB_THROW_SIDE,
      GIB_THROW_UP.min + random() * (GIB_THROW_UP.max - GIB_THROW_UP.min),
    ],
    age: 0,
    banked: 0,
    still: false,
  }));
}

/** A drop a ceiling lets go of: a chunk with no throw, which falls the way a chunk does. */
export const dripFrom = (where: Vector): Gib => ({
  position: where,
  velocity: [0, 0, 0],
  age: 0,
  banked: 0,
  still: false,
});
/** What a ceiling's drop leaves where it lands: one mark. */
export const DRIP_SPLASH_RATE = 1;

/** Steps a faller by `dt` in whole fixed steps, the rest banked, and answers the segment it wants; null once still. */
export function gibStep(gib: Gib, dt: number): Segment | null {
  if (gib.still || !(dt > 0)) return null;
  gib.age += dt;
  if (gib.age >= GIB_LIFE) {
    gib.still = true;
    return null;
  }
  let moveX = 0;
  let moveY = 0;
  let moveZ = 0;
  gib.banked += dt;
  const damp = Math.max(0, 1 - GIB_DRAG * GIB_FIXED_STEP);
  while (gib.banked >= GIB_FIXED_STEP - 1e-9) {
    gib.banked -= GIB_FIXED_STEP;
    const velocity = gib.velocity;
    velocity[0] *= damp;
    velocity[1] *= damp;
    velocity[2] = velocity[2] * damp - GIB_GRAVITY * GIB_FIXED_STEP;
    moveX += velocity[0] * GIB_FIXED_STEP;
    moveY += velocity[1] * GIB_FIXED_STEP;
    moveZ += velocity[2] * GIB_FIXED_STEP;
  }
  const distance = Math.hypot(moveX, moveY, moveZ);
  if (!(distance > 0)) return null;
  const from = gib.position;
  return {
    from,
    direction: [moveX / distance, moveY / distance, moveZ / distance],
    distance,
    to: [from[0] + moveX, from[1] + moveY, from[2] + moveZ],
  };
}

export const gibSprayFrom = (gib: Gib): Vector => [gib.position[0], gib.position[1], gib.position[2] + GIB_SPRAY_LIFT];
