// Which figures a frame draws and how often each is posed: a card is drawn only where a sphere about its feet meets the
// view, casts into the near shadow map only where that sphere's box may reach the map's square, and is posed (its move's
// frame chosen and its card asked of the forge) every frame near the eye, less often farther off or out of sight.
import { boxSeen } from '../city/tiers.ts';

/** How far past its card a figure's sphere is taken, metres: a shake, a weapon's outline and a smear stand a little
 *  outside the card. */
export const CULL_MARGIN_M = 0.5;
/** The sphere grows for a turning eye, so a figure the view swings onto is posed before it shows: by this many frames
 *  of the last frame's turn, at most this angle (radians). */
export const TURN_LEAD_FRAMES = 3;
export const TURN_LEAD_MAX = 1.2;
/** How many frames apart a figure is posed by its distance from the eye along the ground: `[within metres, every]`,
 *  the first row that holds. Within 10 m a blow's every frame is read; a far figure's move plays at 6 frames a second,
 *  so every third frame (20 a second at 60) still shows each. */
export const POSE_CADENCE: readonly (readonly [number, number])[] = [
  [10, 1],
  [25, 2],
  [Infinity, 3],
];
/** A figure out of sight is posed as one at the far end, so its shadow and its first frame in view are near current. */
export const UNSEEN_EVERY = 3;
/** The reach of a figure the view is asked about before its card is chosen, metres: a body's height and more. */
export const FIGURE_REACH_M = 2.5;
/** Half the shade's side under a figure's feet, metres, and how far it leans by the card's height where it stands in
 *  for a shadow: a quarter of it over the sun's height, half at its rim (`shade_vertex` in figureView.ts). */
const SHADE_RADIUS_M = 0.45;
const SHADE_LEAN = 0.125;

/** How many frames apart a figure `distanceM` along the ground from the eye is posed. */
export function poseEvery(distanceM: number): number {
  for (const [within, every] of POSE_CADENCE) if (distanceM <= within) return every;
  return UNSEEN_EVERY;
}

/** Whether a figure posed every `every` frames is posed on frame `frame`: each figure's `phase` (its number) sets it
 *  apart, so figures on one cadence are posed on different frames. */
export const cadenceDue = (frame: number, phase: number, every: number): boolean => (frame + phase) % every === 0;

/** The angle between two yaws (radians), the shorter way round. */
export function turnBetween(from: number, to: number): number {
  const turn = Math.abs(to - from) % (2 * Math.PI);
  return turn > Math.PI ? 2 * Math.PI - turn : turn;
}

/** The margin a figure `distanceM` off takes when the view turned `turn` radians last frame. */
export const leadMargin = (distanceM: number, turn: number): number =>
  CULL_MARGIN_M + (turn > 0 ? Math.max(0, distanceM) * Math.tan(Math.min(TURN_LEAD_MAX, turn * TURN_LEAD_FRAMES)) : 0);

/** The farthest a card `width` by `height` metres reaches from its feet (`rootX` across, `rootY` down from its top)
 *  however it turns about them, or its shade does, leaning `lean` (the sun's run over its rise). */
export function cardReach(width: number, height: number, rootX: number, rootY: number, lean: number): number {
  const across = Math.max(rootX, width - rootX);
  const up = Math.max(Math.abs(rootY), Math.abs(height - rootY));
  return Math.max(Math.hypot(across, up), SHADE_RADIUS_M + SHADE_LEAN * height * lean);
}

/** A box about a sphere, written into `low` and `high`, measured as the sphere's middle is. */
export function sphereBox(
  low: [number, number, number],
  high: [number, number, number],
  x: number,
  y: number,
  z: number,
  radius: number,
): void {
  low[0] = x - radius;
  low[1] = y - radius;
  low[2] = z - radius;
  high[0] = x + radius;
  high[1] = y + radius;
  high[2] = z + radius;
}

const low: [number, number, number] = [0, 0, 0];
const high: [number, number, number] = [0, 0, 0];

/** Whether a sphere about a point measured from the eye meets the view between `planes` (`viewPlanes`). */
export function sphereSeen(planes: readonly number[][], x: number, y: number, z: number, radius: number): boolean {
  sphereBox(low, high, x, y, z, radius);
  return boxSeen(planes, low, high);
}
