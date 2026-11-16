import { Builder, type Colour, type Vector } from './meshes.ts';

/** A solid of a city's plan as the city crate writes it: its shape with the shape's own numbers, the middle of its
 *  base (world metres, z up), its size (width across, depth along, height), its turn clockwise from north (radians)
 *  and its material. Its lean and roll are not read here. */
export interface PlanSolid {
  readonly shape: 'block' | 'column' | 'dome' | 'pyramid' | 'gable' | 'arch';
  readonly sides?: number;
  readonly top?: number;
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly turn: number;
  readonly material: string;
}

const STONE: Colour = [0.6, 0.58, 0.53];
/** Each material in one plain colour. */
const MATERIALS: Readonly<Record<string, Colour>> = {
  stone: STONE,
  trim: [0.74, 0.71, 0.63],
  roof: [0.45, 0.23, 0.17],
  timber: [0.42, 0.3, 0.2],
  plaster: [0.84, 0.8, 0.71],
  paving: [0.66, 0.63, 0.57],
  gold: [0.86, 0.68, 0.26],
  iron: [0.3, 0.3, 0.32],
  bone: [0.88, 0.85, 0.76],
  glow: [1, 0.8, 0.42],
};
/** Paving lies on the very ground the city levelled for it, so it is drawn this much over it, not into it. */
const PAVING_LIFT_M = 0.03;
/** A round solid is drawn with at most this many faces round. */
const MOST_SIDES = 16;
/** A dome is drawn as this many bands from its foot to its crown. */
const DOME_BANDS = 4;

/** The faces between two rings of the same count, lower to upper, and the upper ring's cap where it has width. */
function band(mesh: Builder, lower: readonly Vector[], upper: readonly Vector[], colour: Colour, cap: boolean): void {
  lower.forEach((corner, index) => {
    const following = (index + 1) % lower.length;
    const [nextLower, nextUpper, ownUpper] = [lower[following], upper[following], upper[index]];
    if (nextLower && nextUpper && ownUpper) mesh.quad(corner, nextLower, nextUpper, ownUpper, colour);
  });
  const first = upper[0];
  if (!cap || !first) return;
  for (let index = 1; index + 1 < upper.length; index++) {
    const [second, third] = [upper[index], upper[index + 1]];
    if (second && third) mesh.triangle(first, second, third, colour);
  }
}

/**
 * A city's solids as one plain mesh about an anchor (a world point on the map): x east and y north of it, z up, so a
 * mesh drawn facing north stands them where they are. Each is its own shape in its material's one colour: a block,
 * a column or a pyramid as a frustum of its sides, a dome in bands, a gable as its roof, an arch as its block. It
 * stands in for the city's own drawer until the city layer's is merged.
 */
export function plainCityMesh(solids: readonly PlanSolid[], anchor: readonly [number, number]): Float32Array {
  const mesh = new Builder();
  for (const solid of solids) {
    const colour = MATERIALS[solid.material] ?? STONE;
    const [x, y, base] = solid.at;
    const foot = base + (solid.material === 'paving' ? PAVING_LIFT_M : 0);
    const [width, depth, height] = solid.size;
    const [sine, cosine] = [Math.sin(solid.turn), Math.cos(solid.turn)];
    // A point of the solid's own plan (across, along, up) in the mesh's metres.
    const place = (across: number, along: number, up: number): Vector => [
      x + across * cosine + along * sine - anchor[0],
      anchor[1] - (y + across * sine - along * cosine),
      foot + up,
    ];
    const ring = (count: number, scale: number, up: number, turned: number) =>
      Array.from({ length: count }, (unused, index) => {
        const angle = turned + (index * 2 * Math.PI) / count;
        return place(((Math.cos(angle) * width) / 2) * scale, ((Math.sin(angle) * depth) / 2) * scale, up);
      });
    const sides = Math.max(3, Math.min(MOST_SIDES, solid.sides ?? MOST_SIDES));
    if (solid.shape === 'column') {
      band(mesh, ring(sides, 1, 0, 0), ring(sides, solid.top ?? 1, height, 0), colour, (solid.top ?? 1) > 0);
    } else if (solid.shape === 'dome') {
      for (let step = 0; step < DOME_BANDS; step++) {
        const [low, high] = [step / DOME_BANDS, (step + 1) / DOME_BANDS].map((share) => (share * Math.PI) / 2);
        const lower = ring(sides, Math.cos(low ?? 0), height * Math.sin(low ?? 0), 0);
        band(mesh, lower, ring(sides, Math.cos(high ?? 0), height * Math.sin(high ?? 0), 0), colour, false);
      }
    } else if (solid.shape === 'gable') {
      const [left, right] = [-width / 2, width / 2];
      const [back, front] = [-depth / 2, depth / 2];
      mesh.quad(place(left, back, 0), place(left, front, 0), place(0, front, height), place(0, back, height), colour);
      mesh.quad(place(right, front, 0), place(right, back, 0), place(0, back, height), place(0, front, height), colour);
      mesh.triangle(place(left, back, 0), place(0, back, height), place(right, back, 0), colour);
      mesh.triangle(place(right, front, 0), place(0, front, height), place(left, front, 0), colour);
    } else {
      // A block, an arch or a pyramid: four sides through the corners of its base, its top `top` of its base.
      const top = solid.shape === 'pyramid' ? (solid.top ?? 0) : 1;
      const corners = (scale: number, up: number) => ring(4, scale * Math.SQRT2, up, Math.PI / 4);
      band(mesh, corners(1, 0), corners(top, height), colour, top > 0);
    }
  }
  return new Float32Array(mesh.values);
}
