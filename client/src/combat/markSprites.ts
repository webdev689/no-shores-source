// Pixel pictures laid in the world as marks, in any four-stop ramp: the steel of a glint, a gun's powder, its smoke,
// a ground's dust. Each is cells of one stop, turned to the eye about its own up (the world's, or a shot's way), each
// row's run of one stop one quad. The spells lay theirs in an element's ramp alone (spellPixels.ts).
import type { Rgb } from '../elementGlow.ts';
import { HOT, LIGHT, BODY, type Sprite, sprite, stopOf } from './spellPixels.ts';

type Point = readonly [number, number, number];
/** A ramp's four stops, dark to white-hot. */
export type Ramp = readonly [Rgb, Rgb, Rgb, Rgb];

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];
export const rampOf = (...hexes: [string, string, string, string]): Ramp => hexes.map(rgb) as unknown as Ramp;

/** Bare steel's glint and a shot's flash; black powder's fire (Blaze's own stops) and its smoke. */
export const STEEL = rampOf('#2a3340', '#8fa6c8', '#cfe0ff', '#ffffff');
export const POWDER = rampOf('#4a1606', '#ff7a2a', '#ffd36a', '#fff4d6');
export const SMOKE = rampOf('#2b2b2b', '#5e5e5e', '#9a9a9a', '#d0d0d0');
/** An iron blow's red (the display's iron red its light stop) and water thrown up. */
export const IRON = rampOf('#3a0806', '#a01a10', '#e0281c', '#ffd8c8');
export const WATER = rampOf('#1d4a5e', '#4f93b4', '#a8dcef', '#f4fcff');

/** A picture nearer the eye than this (metres) is not laid: it would fill the view. */
const NEAR_M = 0.3;

/** A star of four arms `reach` cells long: white-hot in the middle, each arm a stop cooler by thirds of its length. */
export function starSprite(reach: number): Sprite {
  const size = 2 * reach + 1;
  return sprite(size, size, (across, up) => {
    if (across !== 0 && up !== 0) return Math.abs(across) + Math.abs(up) <= 1 ? HOT : -1;
    const out = Math.abs(across) + Math.abs(up);
    if (out <= reach / 3) return HOT;
    return out <= (2 * reach) / 3 ? LIGHT : BODY;
  });
}

/** How a picture is laid: its cell (metres), its up (the world's by default), its right, mirrored, and its opacity
 *  (below none, light added to what is behind). */
export interface Laying {
  readonly cell: number;
  readonly up?: Point;
  /** Its right, for a picture laid flat or fixed; else turned to the eye. */
  readonly right?: Point;
  readonly flip?: boolean;
  readonly opacity?: number;
}

/**
 * Lays `picture` with its middle at `middle`, turned to the eye at `eye` about its up, each cell `ramp`'s stop: mark
 * vertices into `out`. Cells off the ramp (CLEAR, or a stop below the ramp) are left out.
 */
export function layPicture(
  out: number[],
  picture: Sprite,
  ramp: Ramp,
  middle: Point,
  eye: Point,
  laying: Laying,
): void {
  const toEye: Point = [eye[0] - middle[0], eye[1] - middle[1], eye[2] - middle[2]];
  if (Math.hypot(...toEye) < NEAR_M) return;
  const up = laying.up ?? ([0, 0, 1] as const);
  // Its right is across both its up and the way to the eye; looking along its up, any way across will do.
  let right: readonly [number, number, number] = laying.right ?? [
    up[1] * toEye[2] - up[2] * toEye[1],
    up[2] * toEye[0] - up[0] * toEye[2],
    up[0] * toEye[1] - up[1] * toEye[0],
  ];
  let length = Math.hypot(...right);
  if (length < 1e-6) [right, length] = [Math.abs(up[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], 1];
  const side = (laying.flip ? -1 : 1) * laying.cell;
  const [rightX, rightY, rightZ] = [(right[0] / length) * side, (right[1] / length) * side, (right[2] / length) * side];
  const [upX, upY, upZ] = [up[0] * laying.cell, up[1] * laying.cell, up[2] * laying.cell];
  const opacity = laying.opacity ?? 1;
  const vertex = (across: number, high: number, colour: Rgb) =>
    out.push(
      middle[0] + rightX * across + upX * high,
      middle[1] + rightY * across + upY * high,
      middle[2] + rightZ * across + upZ * high,
      colour[0],
      colour[1],
      colour[2],
      opacity,
    );
  for (let row = 0; row < picture.height; row++) {
    const [top, bottom] = [picture.height / 2 - row, picture.height / 2 - row - 1];
    for (let column = 0; column < picture.width;) {
      const stop = stopOf(picture, column, row);
      let end = column + 1;
      while (end < picture.width && stopOf(picture, end, row) === stop) end++;
      const colour = ramp[stop];
      if (colour) {
        const [left, rightEdge] = [column - picture.width / 2, end - picture.width / 2];
        vertex(left, top, colour);
        vertex(rightEdge, top, colour);
        vertex(rightEdge, bottom, colour);
        vertex(left, top, colour);
        vertex(rightEdge, bottom, colour);
        vertex(left, bottom, colour);
      }
      column = end;
    }
  }
}

/** A cell (metres) at least `least` radians of the eye's view at `distance`, so a picture far off keeps its pixels. */
export const cellAt = (cell: number, distance: number, least: number): number => Math.max(cell, distance * least);
