import type { Point2 } from './ground.ts';

/** The pace dial's ladder: how many times its base speed a ship sails in the Overworld. The whole ladder is open at
 *  sea; there is no road to earn the top step on. */
export const PACE_STEPS = [5, 10, 20, 30, 40, 60, 100] as const;
export type Pace = (typeof PACE_STEPS)[number];

/** The dial a voyage starts on. */
export const PACE_DEFAULT: Pace = 60;

/** A ship's base speed, metres a second: a tuning value, about 23 knots, which the pace multiplies. */
export const SHIP_SPEED = 12;

/** The ship's heading is the way of the route over this many metres about it, so it swings through a corner
 *  instead of snapping round at the vertex. */
export const TURN_CHORD_M = 300;

/** A pace held onto the ladder: rounded down onto it, never under its bottom step. */
export function clampPace(pace: number): Pace {
  let held: Pace = PACE_STEPS[0];
  for (const step of PACE_STEPS) if (step <= pace) held = step;
  return held;
}

/** One step along the ladder: `direction` positive faster, negative slower, stopping at either end. */
export function stepPace(pace: number, direction: number): Pace {
  const rung = PACE_STEPS.indexOf(clampPace(pace));
  const next = Math.max(0, Math.min(PACE_STEPS.length - 1, rung + Math.sign(direction)));
  return PACE_STEPS[next];
}

/** How fast a ship sails at a pace, metres a second. */
export const sailSpeed = (pace: number) => SHIP_SPEED * clampPace(pace);

/** A route made ready to sail: its points, the distance along it to each, and its length, metres. */
export interface Voyage {
  readonly points: readonly Point2[];
  readonly along: Float64Array;
  readonly lengthM: number;
}

/** Where a ship stands on its voyage: its place, its heading (a compass bearing; null on a voyage with no length),
 *  how far it has come and has to go, and whether it has arrived. */
export interface ShipFix {
  readonly position: Point2;
  readonly heading: number | null;
  readonly travelledM: number;
  readonly remainingM: number;
  readonly arrived: boolean;
}

export function voyageOf(points: readonly Point2[]): Voyage {
  const along = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    along[i] = along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { points, along, lengthM: points.length ? along[points.length - 1] : 0 };
}

/** The point `distanceM` along the voyage, held to its ends. */
export function pointAlong(voyage: Voyage, distanceM: number): Point2 {
  const { points, along, lengthM } = voyage;
  if (points.length === 0) return [0, 0];
  const target = Math.max(0, Math.min(lengthM, distanceM));
  let [low, high] = [0, points.length - 1];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (along[middle] <= target) low = middle;
    else high = middle;
  }
  const span = along[high] - along[low];
  const share = span > 0 ? (target - along[low]) / span : 0;
  const [from, to] = [points[low], points[high]];
  return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
}

/** The ship `travelledM` along its voyage. */
export function shipAt(voyage: Voyage, travelledM: number): ShipFix {
  const travelled = Math.max(0, Math.min(voyage.lengthM, travelledM));
  const [behind, ahead] = [
    pointAlong(voyage, travelled - TURN_CHORD_M / 2),
    pointAlong(voyage, travelled + TURN_CHORD_M / 2),
  ];
  const [east, south] = [ahead[0] - behind[0], ahead[1] - behind[1]];
  return {
    position: pointAlong(voyage, travelled),
    heading: east || south ? Math.atan2(east, -south) : null,
    travelledM: travelled,
    remainingM: voyage.lengthM - travelled,
    arrived: travelled >= voyage.lengthM,
  };
}

/** The ship after `dt` more seconds at a pace, from `travelledM` along. */
export const sail = (voyage: Voyage, travelledM: number, dt: number, pace: number): ShipFix =>
  shipAt(voyage, travelledM + sailSpeed(pace) * Math.max(0, dt));

/** Seconds left to arrive from `travelledM` along at a pace. */
export const secondsLeft = (voyage: Voyage, travelledM: number, pace: number) =>
  Math.max(0, voyage.lengthM - travelledM) / sailSpeed(pace);
