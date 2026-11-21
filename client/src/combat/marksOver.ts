// The marks over what a player can use on foot, after DFO's marks over the people who do something: a pixel picture
// standing on a point over each, bobbing, turned to the eye and hidden by what stands before it, never narrower on the
// screen than MIN_RAD of the view so a keeper across the plaza still shows one, faded out over the last fifth of its
// reach, the nearest MOST of them; it holds still under reduced motion. It is laid as the drops' pictures are
// (drops.ts). What wears one is the game's (game/overheadMarks.ts) and the Test Ground's (testground/gearGround.ts).

import type { PixelPicture } from './dropPictures.ts';
import { markPicture, PIXEL_M } from './drops.ts';
import { motionReduced } from '../plus/kit.ts';

type Point = readonly [number, number, number];

/** How far from the eye a mark shows (metres), and the share of that over which it fades out at its far end. */
export const REACH_M = 30;
const FADE = 0.2;
/** How far over the crown a mark's foot stands, and over a resource node's ground (metres). */
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
/** The most marks a frame lays, the nearest, as DFO's. */
export const MOST = 12;

/** A little over the most a mark rises over its foot (metres): its height at the end of its reach, where MIN_RAD
 *  holds it 2 × REACH_M × tan(MIN_RAD) tall, and its bob. */
export const TALLEST_M = 1.2;

/** One mark to lay: its picture, the point its foot stands on before the bob, and whether a beam of light stands
 *  over it (a resource node's, seen across the patrol). */
export interface Marked {
  readonly picture: PixelPicture;
  readonly at: Point;
  readonly beam?: boolean;
}

/** The marks seen from `eye` at `seconds`, as mark vertices: the nearest MOST within reach, each bobbing on a phase of
 *  its own unless `holding`, as wide as WIDTH_M or MIN_RAD of the view, whichever is wider, fading at the far end. */
export function marksSeen(marked: readonly Marked[], eye: Point, seconds: number, holding = motionReduced()): number[] {
  const out: number[] = [];
  const near = marked
    .map((mark) => ({ mark, far: Math.hypot(mark.at[0] - eye[0], mark.at[1] - eye[1], mark.at[2] - eye[2]) }))
    .filter(({ far }) => far <= REACH_M)
    .sort((one, other) => one.far - other.far)
    .slice(0, MOST);
  for (const { mark, far } of near) {
    const cells = mark.picture.rows[0]?.length ?? 1;
    const width = Math.max(WIDTH_M, 2 * far * Math.tan(MIN_RAD));
    // Each its own phase, by where it stands, so a row of keepers does not bob as one.
    const phase = (Math.abs(mark.at[0] * 7.31 + mark.at[1] * 3.17) % 1) * 2 * Math.PI;
    const bob = holding ? 0 : BOB_M * Math.sin(2 * Math.PI * BOB_HZ * seconds + phase);
    const fading = REACH_M * (1 - FADE);
    const opacity = far <= fading ? 1 : Math.max(0, (REACH_M - far) / (REACH_M - fading));
    const bobbing: Point = [mark.at[0], mark.at[1], mark.at[2] + bob];
    markPicture(out, mark.picture, bobbing, eye, width / cells / PIXEL_M, opacity);
  }
  return out;
}
