// The grain a walk's flagstones are laid in (the city crate's `hub::ground`): along its way and across it in whole
// pictures from edge to edge, measured along from the city's origin, so a walk's pieces join along it and the round
// and corners at a joint, laid in the grain of the walk on top there, carry its flags on unbroken.
import type { Vector } from './mesh.ts';

/** A walk piece's grain: the solid's place in its social space's list, the walk's turn (clockwise from north, within
 *  a half turn), a point on its middle line (world east and south, metres) and its width, metres. */
export type Grain = {
  readonly solid: number;
  readonly turn: number;
  readonly middle: readonly [number, number];
  readonly width: number;
};

/** The UVs of a walk piece's top corners (measured from `origin`), in `grain` on a picture `pictureM` metres across. */
export function grainUvs(
  corners: readonly Vector[],
  grain: Grain,
  origin: readonly [number, number],
  pictureM: number,
): [number, number][] {
  const [sine, cosine] = [Math.sin(grain.turn), Math.cos(grain.turn)];
  const [middleX, middleY] = [grain.middle[0] - origin[0], grain.middle[1] - origin[1]];
  const pictures = Math.max(1, Math.round(grain.width / pictureM));
  return corners.map(([x, y]) => [
    (((x - middleX) * cosine + (y - middleY) * sine) / grain.width + 0.5) * pictures,
    ((-x * sine + y * cosine) * pictures) / grain.width,
  ]);
}
