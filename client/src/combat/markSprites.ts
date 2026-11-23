// Pixel pictures laid in the world as marks, in any four-stop ramp: the steel of a glint, a gun's powder, its smoke,
// a ground's dust. Each is cells of one stop, turned to the eye about its own up (the world's, or a shot's way), each
// row's run of one stop one quad. The spells lay theirs in an element's ramp alone (spellPixels.ts).
import type { Rgb } from '../elementGlow.ts';
import { HOT, LIGHT, BODY, CLEAR, type Sprite, sprite, stopOf } from './spellPixels.ts';

type Point = readonly [number, number, number];
/** A ramp's four stops, dark to white-hot. */
export type Ramp = readonly [Rgb, Rgb, Rgb, Rgb];

export const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];
export const rampOf = (...hexes: [string, string, string, string]): Ramp => hexes.map(rgb) as unknown as Ramp;

/** Bare steel's glint and a shot's flash; black powder's fire (Blaze's own stops) and its smoke. */
export const STEEL = rampOf('#2a3340', '#8fa6c8', '#cfe0ff', '#ffffff');
/** The gold of a crit, a parry, a riposte and a telegraphed blow, the HUD's #ffd95a its light. */
export const GOLD = rampOf('#4a2a06', '#c8901e', '#ffd95a', '#fff6d0');
export const POWDER = rampOf('#4a1606', '#ff7a2a', '#ffd36a', '#fff4d6');
export const SMOKE = rampOf('#2b2b2b', '#5e5e5e', '#9a9a9a', '#d0d0d0');
/** An iron blow's red (the display's iron red its light stop) and water thrown up. */
export const IRON = rampOf('#3a0806', '#a01a10', '#e0281c', '#ffd8c8');
export const WATER = rampOf('#1d4a5e', '#4f93b4', '#a8dcef', '#f4fcff');

/** A picture nearer the eye than this (metres) is not laid: it would fill the view. */
const NEAR_M = 0.3;

/** A star of four arms `reach` cells long: white-hot in the middle, each arm a stop cooler by thirds of its length. */
export function crossStar(reach: number): Sprite {
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
  const side = ((laying.flip ? -1 : 1) * laying.cell) / length;
  const across: Point = [right[0] * side, right[1] * side, right[2] * side];
  const upward: Point = [up[0] * laying.cell, up[1] * laying.cell, up[2] * laying.cell];
  layRuns(out, picture, ramp, 1, middle, across, upward, laying.opacity ?? 1);
}

/** A 4 by 4 ordered dither's order, for thinning a picture in steps. */
const ORDER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Whether a cell at a column and a row is kept when a picture keeps `share` of its cells (0 none, 1 all). */
export const ditherKeeps = (column: number, row: number, share: number): boolean =>
  (ORDER[(row & 3) * 4 + (column & 3)] ?? 0) < share * 16;

/** Each sprite's runs, made once: for each row's run of one stop, its row, first column, end and stop. */
const madeRuns = new WeakMap<Sprite, Int16Array>();
function runsOf(picture: Sprite, share: number): Int16Array {
  const whole = share >= 1;
  const known = whole ? madeRuns.get(picture) : undefined;
  if (known) return known;
  const runs: number[] = [];
  const stopAt = (column: number, row: number) =>
    whole || ditherKeeps(column, row, share) ? stopOf(picture, column, row) : CLEAR;
  for (let row = 0; row < picture.height; row++)
    for (let column = 0; column < picture.width;) {
      const stop = stopAt(column, row);
      let end = column + 1;
      while (end < picture.width && stopAt(end, row) === stop) end++;
      if (stop !== CLEAR) runs.push(row, column, end, stop);
      column = end;
    }
  const made = Int16Array.from(runs);
  if (whole) madeRuns.set(picture, made);
  return made;
}

/** Each run of `picture` (keeping `share` of its cells) as a quad about `middle`, a column `across` and a row `up`
 *  apart (metres, as vectors), at `opacity` (below none, light added to what is behind). */
export function layRuns(
  out: number[],
  picture: Sprite,
  ramp: Ramp,
  share: number,
  middle: Point,
  across: Point,
  up: Point,
  opacity = 1,
): void {
  const runs = runsOf(picture, share);
  const halfWidth = picture.width / 2;
  const halfHeight = picture.height / 2;
  for (let index = 0; index < runs.length; index += 4) {
    const colour = ramp[runs[index + 3] ?? 0];
    if (!colour) continue;
    const top = halfHeight - (runs[index] ?? 0);
    const left = (runs[index + 1] ?? 0) - halfWidth;
    const right = (runs[index + 2] ?? 0) - halfWidth;
    quadOut(out, middle, across, up, [left, right, top, top - 1], colour, opacity);
  }
}

/** One quad about `middle` from column `left` to `right` and row `top` to `bottom`, each a step of `across` and `up`. */
export function quadOut(
  out: number[],
  middle: Point,
  across: Point,
  up: Point,
  [left, right, top, bottom]: readonly [number, number, number, number],
  colour: Rgb,
  opacity = 1,
): void {
  for (let corner = 0; corner < 6; corner++) {
    // The corners in turn: left top, right top, right bottom; left top, right bottom, left bottom.
    const column = corner === 1 || corner === 2 || corner === 4 ? right : left;
    const height = corner === 0 || corner === 1 || corner === 3 ? top : bottom;
    out.push(
      middle[0] + across[0] * column + up[0] * height,
      middle[1] + across[1] * column + up[1] * height,
      middle[2] + across[2] * column + up[2] * height,
      colour[0],
      colour[1],
      colour[2],
      opacity,
    );
  }
}
