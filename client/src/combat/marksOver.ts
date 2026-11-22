// The marks over what a player can use on foot, after DFO's marks over the people who do something: a pixel picture
// standing on a point over each, bobbing, turned to the eye and hidden by what stands before it, never narrower on the
// screen than MIN_RAD of the view so a keeper across the plaza still shows one, faded out over the last fifth of its
// reach, the nearest MOST of them; one beating while something waits there swells and eases back; each holds still
// under reduced motion. It is laid as the drops' pictures are
// (drops.ts). What wears one is the game's (game/overheadMarks.ts) and the Test Ground's (testground/gearGround.ts).

import type { PixelPicture } from './dropPictures.ts';
import { markPicture, PIXEL_M } from './drops.ts';
import { ditherCode } from './marks.ts';
import { motionReduced } from '../plus/kit.ts';

type Point = readonly [number, number, number];

/** How far from the eye a mark shows (metres), and the share of that over which it fades out at its far end. */
export const REACH_M = 30;
const FADE = 0.2;
/** How far over the crown a mark's foot stands, and over the Test Ground's course nodes' ground (metres). */
export const OVER_HEAD_M = 0.2;
export const OVER_NODE_M = 1.2;
/** A mark's width (metres), as DFO's. */
export const WIDTH_M = 0.32;
/** The narrowest half-width a mark stands at on the screen, as an angle of the view (radians): two screen pixels a cell
 *  of it on a 1080-line screen. */
export const MIN_RAD = 0.017;
/** The bob: how far a mark rises and falls (metres) and how often (cycles a second). */
const BOB_M = 0.06;
const BOB_HZ = 1;
/** The beat: how much wider a beating mark swells at its fullest, and how often (cycles a second). */
const BEAT = 0.2;
const BEAT_HZ = 0.75;
/** The most marks a frame lays, the nearest, as DFO's. */
export const MOST = 12;
/** A whole mark's opacity: solid, lighting nothing. */
const WHOLE = ditherCode(1);

/** One mark to lay: its picture, and the point its foot stands on before the bob. */
export interface Marked {
  readonly picture: PixelPicture;
  readonly at: Point;
  /** Whether it beats, as the Postmaster's does while letters wait for the player. */
  readonly beating?: boolean;
}

/** The marks seen from `eye` at `seconds`, as mark vertices: the nearest MOST within reach, each bobbing on a phase of
 *  its own and a beating one swelling unless `holding`, as wide as WIDTH_M or MIN_RAD of the view, whichever is wider,
 *  fading at the far end. */
export function marksSeen(marked: readonly Marked[], eye: Point, seconds: number, holding = motionReduced()): number[] {
  const out: number[] = [];
  const near = marked
    .map((mark) => ({ mark, far: Math.hypot(mark.at[0] - eye[0], mark.at[1] - eye[1], mark.at[2] - eye[2]) }))
    .filter(({ far }) => far <= REACH_M)
    .sort((one, other) => one.far - other.far)
    .slice(0, MOST);
  for (const { mark, far } of near) {
    const cells = mark.picture.rows[0]?.length ?? 1;
    const swell = mark.beating && !holding ? 1 + BEAT * (0.5 - 0.5 * Math.cos(2 * Math.PI * BEAT_HZ * seconds)) : 1;
    const width = swell * Math.max(WIDTH_M, 2 * far * Math.tan(MIN_RAD));
    // Each its own phase, by where it stands, so a row of keepers does not bob as one.
    const phase = (Math.abs(mark.at[0] * 7.31 + mark.at[1] * 3.17) % 1) * 2 * Math.PI;
    const bob = holding ? 0 : BOB_M * Math.sin(2 * Math.PI * BOB_HZ * seconds + phase);
    const fading = REACH_M * (1 - FADE);
    // Whole, it is drawn by the ground's code for a mark kept whole, which gives the light layer no light: the
    // brightest brass of a keeper's sign would otherwise light the sign itself in blocks over its own colours.
    const opacity = far <= fading ? WHOLE : Math.max(0, (REACH_M - far) / (REACH_M - fading));
    const bobbing: Point = [mark.at[0], mark.at[1], mark.at[2] + bob];
    markPicture(out, mark.picture, bobbing, eye, width / cells / PIXEL_M, opacity);
  }
  return out;
}
