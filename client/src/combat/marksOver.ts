// The marks over what a player can use on foot, after DFO's marks over the people who do something: a pixel picture
// standing on a point over each, bobbing, turned to the eye, never narrower on the screen than MIN_RAD of the view so a
// keeper across the plaza still shows one, faded out over the last fifth of its reach, the nearest MOST of them. Where
// something stands before one, the game draws a faded copy of it through that (`marksHidden`). A lit one, its keeper
// having something for the player, is laid apart: at any distance, whole and beating (swelling and easing back), to be
// drawn over everything, so it is seen from everywhere. Each holds still under reduced motion. It is laid as the drops'
// pictures are (drops.ts). What wears one is the game's (game/overheadMarks.ts) and the Test Ground's
// (testground/gearGround.ts).

import type { PixelPicture } from './dropPictures.ts';
import { markPicture, PIXEL_M } from './drops.ts';
import { MARK_FLOATS, ditherCode } from './marks.ts';
import { Nearest } from '../nearest.ts';
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
/** How much of a mark shows where something stands before it: seen through walls, faded; and how much nearer the eye
 *  its copy is laid than its foot: past a whole mark's layers, a picture's dozen or so of `LAYER_M` (drops.ts). */
export const HIDDEN_SHARE = 0.45;
const HIDDEN_NEARER_M = 0.03;

/** One mark to lay: its picture, and the point its foot stands on before the bob. */
export interface Marked {
  readonly picture: PixelPicture;
  readonly at: Point;
  /** Whether it is lit: its keeper has something for the player, so it beats and is seen from everywhere. */
  readonly lit?: boolean;
}

/** One mark laid `far` from `eye` at `seconds`, `opacity` as the drawer reads it: bobbing on a phase of its own and,
 *  lit, swelling, unless `holding`; as wide as WIDTH_M or MIN_RAD of the view, whichever is wider. */
function lay(out: number[], mark: Marked, far: number, eye: Point, seconds: number, holding: boolean, opacity: number) {
  const cells = mark.picture.rows[0]?.length ?? 1;
  const swell = mark.lit && !holding ? 1 + BEAT * (0.5 - 0.5 * Math.cos(2 * Math.PI * BEAT_HZ * seconds)) : 1;
  const width = swell * Math.max(WIDTH_M, 2 * far * Math.tan(MIN_RAD));
  // Each its own phase, by where it stands, so a row of keepers does not bob as one.
  const phase = (Math.abs(mark.at[0] * 7.31 + mark.at[1] * 3.17) % 1) * 2 * Math.PI;
  const bob = holding ? 0 : BOB_M * Math.sin(2 * Math.PI * BOB_HZ * seconds + phase);
  const bobbing: Point = [mark.at[0], mark.at[1], mark.at[2] + bob];
  markPicture(out, mark.picture, bobbing, eye, width / cells / (mark.picture.pixelM ?? PIXEL_M), opacity);
}

const distance = (mark: Marked, eye: Point) =>
  Math.hypot(mark.at[0] - eye[0], mark.at[1] - eye[1], mark.at[2] - eye[2]);

/** The unlit marks nearest the eye within reach, found each frame without sorting them all. */
const nearest = new Nearest(MOST);

/** The marks seen from `eye` at `seconds` but the lit ones, as mark vertices: the nearest MOST within reach, fading at
 *  the far end, at `share` of their opacity (a share under 1 lays them flat). */
export function marksSeen(
  marked: readonly Marked[],
  eye: Point,
  seconds: number,
  holding = motionReduced(),
  share = 1,
): number[] {
  const out: number[] = [];
  nearest.clear();
  for (let index = 0; index < marked.length; index++) {
    const mark = marked[index] as Marked;
    const far = mark.lit ? Infinity : distance(mark, eye);
    if (far <= REACH_M) nearest.offer(index, far);
  }
  const fading = REACH_M * (1 - FADE);
  for (let nth = 0; nth < nearest.count; nth++) {
    const [mark, far] = [marked[nearest.order[nth] ?? 0] as Marked, nearest.away[nth] ?? 0];
    // Whole, it is drawn by the ground's code for a mark kept whole, which gives the light layer no light: the
    // brightest brass of a keeper's sign would otherwise light the sign itself in blocks over its own colours.
    const faded = far <= fading ? 1 : Math.max(0, (REACH_M - far) / (REACH_M - fading));
    const opacity = faded >= 1 && share >= 1 ? WHOLE : faded * share;
    lay(out, mark, far, eye, seconds, holding, opacity);
  }
  return out;
}

/** The same marks as `marksSeen` lays them, laid flat at HIDDEN_SHARE of their opacity and measured from `eye`, for
 *  drawing only where something stands before them (`MarkDraw.drawHiddenOver`): so a keeper's mark inside their
 *  stall, or the Hall's, is seen through its walls. A lit one needs none: it is drawn over everything. */
export function marksHidden(marked: readonly Marked[], eye: Point, seconds: number): Float32Array {
  const out = marksSeen(marked, eye, seconds, motionReduced(), HIDDEN_SHARE);
  for (let start = 0; start < out.length; start += MARK_FLOATS) {
    const [x, y, z] = [0, 1, 2].map((axis) => (out[start + axis] ?? 0) - (eye[axis] ?? 0)) as [number, number, number];
    // Laid as near as a whole mark's nearest layer, so where the mark is seen its copy is never behind it.
    const toward = Math.max(0, 1 - HIDDEN_NEARER_M / (Math.hypot(x, y, z) || 1));
    [out[start], out[start + 1], out[start + 2]] = [x * toward, y * toward, z * toward];
  }
  return new Float32Array(out);
}

/** The lit marks seen from `eye` at `seconds`, as mark vertices measured from the eye, to draw over everything
 *  (`MarkDraw.drawAbove`): every one, at any distance and whole, the farthest first so a nearer one stands over it.
 *  Laid at an opacity of 1, which the drawer shows whole without a ground's dither. */
export function litMarksSeen(
  marked: readonly Marked[],
  eye: Point,
  seconds: number,
  holding = motionReduced(),
): number[] {
  const out: number[] = [];
  const lit = marked
    .filter((mark) => mark.lit)
    .map((mark) => ({ mark, far: distance(mark, eye) }))
    .sort((one, other) => other.far - one.far);
  for (const { mark, far } of lit) lay(out, mark, far, eye, seconds, holding, 1);
  for (let start = 0; start < out.length; start += MARK_FLOATS)
    for (let axis = 0; axis < 3; axis += 1) out[start + axis] = (out[start + axis] ?? 0) - (eye[axis] ?? 0);
  return out;
}
