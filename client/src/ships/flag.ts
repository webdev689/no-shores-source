// A ship's flag at the head of its tallest mast: a cloth on the canvas's own grid, its hoist down the mast from its
// masthead and its fly streaming the way the wind blows, waving along its length on the clock.
import { SAIL_COLUMNS, SAIL_ROWS } from './sails.ts';

type Point = readonly [number, number, number];

/** A flag flies a tenth of its waterline's length, and is two thirds as deep as it flies. */
export const FLAG_FLY_SHARE = 0.1;
const FLAG_DEPTH = 2 / 3;
/** Its wave: how far a crest stands out at the fly's end, a share of the fly; its crests along it; how fast they
 *  run. */
const WAVE = { share: 0.08, crests: 1.5, perS: 1.4 } as const;
/** The metres of picture its UVs span either way: one picture of the ship's pictures, laid once over the flag. */
export const FLAG_PICTURE_M = 1.6;

/** Its flag's grid in its frame (x to its bow, y to starboard, z up), its columns from the hoist to the fly and its
 *  rows from its foot up, at `masthead` a waterline `lengthM` long, the wind `offDeg` off its bow at `time`. */
export function flagGrid(masthead: Point, lengthM: number, offDeg: number, time: number): Float32Array {
  const fly = lengthM * FLAG_FLY_SHARE;
  const depth = fly * FLAG_DEPTH;
  const toward = (offDeg * Math.PI) / 180;
  const [alongX, alongY] = [Math.cos(toward), Math.sin(toward)];
  const points = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  for (let row = 0; row < SAIL_ROWS; row++)
    for (let column = 0; column < SAIL_COLUMNS; column++) {
      const [along, up] = [column / (SAIL_COLUMNS - 1), row / (SAIL_ROWS - 1)];
      const phase = 2 * Math.PI * (WAVE.crests * along - WAVE.perS * time) + up * 0.6;
      const wave = WAVE.share * fly * along * Math.sin(phase);
      const out = fly * along * (1 - 0.04 * along);
      points.set(
        [
          masthead[0] + alongX * out - alongY * wave,
          masthead[1] + alongY * out + alongX * wave,
          masthead[2] - depth * (1 - up) - 0.05 * fly * along * along,
        ],
        (row * SAIL_COLUMNS + column) * 3,
      );
    }
  return points;
}

/** The flag laid flat for its UVs: one picture across and down it, upright, a hair inside its edges. */
export function flagFlat(): Float32Array {
  const points = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  for (let row = 0; row < SAIL_ROWS; row++)
    for (let column = 0; column < SAIL_COLUMNS; column++) {
      const [along, up] = [column / (SAIL_COLUMNS - 1), row / (SAIL_ROWS - 1)];
      const inside = (share: number) => (0.005 + 0.99 * share) * FLAG_PICTURE_M;
      points.set([inside(along), 0, inside(up)], (row * SAIL_COLUMNS + column) * 3);
    }
  return points;
}
