// The grain a walk's flagstones are laid in (the city crate's `hub::ground`): along its way and across it in whole
// pictures from edge to edge, measured along from the city's origin, so a walk's pieces join along it and the round
// and corners at a joint, laid in the grain of the walk on top there, carry its flags on unbroken. The hub's paving
// takes one grain too (`hub::courts`), so the walks' floors carry the plaza's pattern across their seams.
import type { Vector } from './mesh.ts';
import type { Solid } from './plan.ts';

/** A top's grain: the solid's place in its social space's list, the turn (clockwise from north, within a half turn), a
 *  point on its middle line (world east and south, metres) and the width whole pictures fit across, metres. */
export type Grain = {
  readonly solid: number;
  readonly turn: number;
  readonly middle: readonly [number, number];
  readonly width: number;
};

/** Each solid of a social space that has a grain, and its grain. */
export function grainsOf(social: {
  readonly solids: readonly Solid[];
  readonly grains?: readonly Grain[];
}): Map<Solid, Grain> {
  const grains = new Map<Solid, Grain>();
  for (const grain of social.grains ?? []) {
    const solid = social.solids[grain.solid];
    if (solid) grains.set(solid, grain);
  }
  return grains;
}

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
