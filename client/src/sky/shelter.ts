// What keeps the rain off: a grid laid round the eye of the highest underside of anything a body meets over each cell,
// so the fall, the wet and the fresh snow stop under a roof, a ceiling, an arch or a bridge, as the sky's shaders
// read it (`sky_sheltered`).

/** The grid's cells a side, and a cell's side, metres: 128 m round the eye. */
export const SHELTER_CELLS = 64;
export const SHELTER_CELL_M = 2;
/** A cell nothing covers: lower than any point the grid is read for. */
export const OPEN_SKY = -1e6;
/** How far the eye may stray from the grid's middle before it is laid again round it, metres. */
const STRAY_M = 16;

/** A box a body meets, world metres east and south, and its top and underside over the sea. */
export interface Roofing {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly top: number;
  readonly bottom: number;
}

/** A shelter grid: its north-west corner (world metres), the height its undersides are measured from, and each
 *  cell's highest underside over that height, rows from the north, OPEN_SKY where nothing covers it. */
export interface Shelter {
  readonly west: number;
  readonly north: number;
  readonly base: number;
  readonly undersides: Float32Array;
}

/** The shelter grid round `eye` (world metres east, south and up) under `boxes`: each cell's middle under a box takes
 *  the highest of their undersides. The grid stands on the world's 2 m lattice, so the cells never shift. */
export function shelterOver(boxes: readonly Roofing[], eye: readonly [number, number, number]): Shelter {
  const half = (SHELTER_CELLS * SHELTER_CELL_M) / 2;
  const west = Math.round((eye[0] - half) / SHELTER_CELL_M) * SHELTER_CELL_M;
  const north = Math.round((eye[1] - half) / SHELTER_CELL_M) * SHELTER_CELL_M;
  const base = Math.round(eye[2]);
  const undersides = new Float32Array(SHELTER_CELLS * SHELTER_CELLS).fill(OPEN_SKY);
  // The cells whose middles lie within [low, high] along one axis of the grid.
  const span = (low: number, high: number, from: number): [number, number] => [
    Math.max(0, Math.ceil((low - from) / SHELTER_CELL_M - 0.5)),
    Math.min(SHELTER_CELLS - 1, Math.floor((high - from) / SHELTER_CELL_M - 0.5)),
  ];
  for (const box of boxes) {
    const [first, last] = span(box.minX, box.maxX, west);
    const [top, bottom] = span(box.minY, box.maxY, north);
    const under = box.bottom - base;
    for (let row = top; row <= bottom; row++) {
      for (let column = first; column <= last; column++) {
        const cell = row * SHELTER_CELLS + column;
        if (under > (undersides[cell] ?? OPEN_SKY)) undersides[cell] = under;
      }
    }
  }
  return { west, north, base, undersides };
}

/** Whether a grid laid round one eye still serves another: near enough its middle, and not far above or below. */
export function stillServes(shelter: Shelter, eye: readonly [number, number, number]): boolean {
  const middle = (SHELTER_CELLS * SHELTER_CELL_M) / 2;
  return (
    Math.abs(eye[0] - (shelter.west + middle)) <= STRAY_M &&
    Math.abs(eye[1] - (shelter.north + middle)) <= STRAY_M &&
    Math.abs(eye[2] - shelter.base) <= 1000
  );
}

/** Whether a point (world metres) stands under shelter in the grid, as `sky_sheltered` reads it. */
export function sheltered(shelter: Shelter, [east, south, up]: readonly [number, number, number]): boolean {
  const column = Math.floor((east - shelter.west) / SHELTER_CELL_M);
  const row = Math.floor((south - shelter.north) / SHELTER_CELL_M);
  if (column < 0 || row < 0 || column >= SHELTER_CELLS || row >= SHELTER_CELLS) return false;
  return up - shelter.base < (shelter.undersides[row * SHELTER_CELLS + column] ?? OPEN_SKY) - 0.05;
}
