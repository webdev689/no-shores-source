// What keeps the rain off: a grid laid round the eye of the highest underside of anything a body meets over each cell,
// so the fall, the wet and the fresh snow stop under a roof, a ceiling, an arch or a bridge, as the sky's shaders
// read it (`sky_sheltered`).

/** The grid's cells a side, and a cell's side, metres: 224 m round the eye, so the far end of a great hall is on it. */
export const SHELTER_CELLS = 112;
export const SHELTER_CELL_M = 2;
/** How far a box must reach into a cell, metres, to keep the rain off all of it: a roof ending on a wall's face shelters
 *  the cell the wall stands in, an eave its own edge. */
const REACHES_IN_M = SHELTER_CELL_M / 4;
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

/** The shelter grid round `eye` (world metres east, south and up) under `boxes`: each cell a box reaches well into
 *  takes the highest of their undersides; a box narrower than a cell (a brazier, a lamp's head) keeps no ground dry.
 *  The grid stands on the world's 2 m lattice, so the cells never shift. */
export function shelterOver(boxes: readonly Roofing[], eye: readonly [number, number, number]): Shelter {
  const half = (SHELTER_CELLS * SHELTER_CELL_M) / 2;
  const west = Math.round((eye[0] - half) / SHELTER_CELL_M) * SHELTER_CELL_M;
  const north = Math.round((eye[1] - half) / SHELTER_CELL_M) * SHELTER_CELL_M;
  const base = Math.round(eye[2]);
  const undersides = new Float32Array(SHELTER_CELLS * SHELTER_CELLS).fill(OPEN_SKY);
  // The cells that [low, high] reaches into by REACHES_IN_M or more, along one axis of the grid.
  const span = (low: number, high: number, from: number): [number, number] => [
    Math.max(0, Math.floor((low - from + REACHES_IN_M) / SHELTER_CELL_M)),
    Math.min(SHELTER_CELLS - 1, Math.ceil((high - from - REACHES_IN_M) / SHELTER_CELL_M) - 1),
  ];
  for (const box of boxes) {
    if (box.maxX - box.minX < SHELTER_CELL_M || box.maxY - box.minY < SHELTER_CELL_M) continue;
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
