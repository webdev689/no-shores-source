// An island's ground as a mesh: a vertex on each of its heights (2 m apart), or on every fourth for the coarse mesh
// seen from afar (8 m), in the island's own frame. Its colour is the shader's (isleShader.ts), from each point's
// height and slope and its climate's ground, as the land's is.
import type { IsleGrid } from './islePlan.ts';

/** Floats a ground vertex: its position, then its normal. */
export const GROUND_FLOATS = 6;
/** How many of the fine cells a far cell spans: 8 m. */
export const FAR_STRIDE = 4;

export interface GroundMesh {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

/** The height at sample (column, row), NaN where there is none or past the grid. */
function sample(grid: IsleGrid, column: number, row: number): number {
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return NaN;
  return grid.heights[row * grid.columns + column] ?? NaN;
}

/** The ground's mesh on every `stride`th sample: each vertex at its sample's middle and height exactly, its normal
 *  from its neighbours, and two triangles a square whose four corners all have a height. */
export function groundMesh(grid: IsleGrid, stride = 1): GroundMesh {
  const columns = Math.ceil((grid.columns - 1) / stride) + 1;
  const rows = Math.ceil((grid.rows - 1) / stride) + 1;
  const vertices = new Float32Array(columns * rows * GROUND_FLOATS);
  const step = grid.cell * stride;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // The last row and column stand on the grid's own edge, so a coarse mesh reaches as far as the fine one.
      const [across, down] = [Math.min(column * stride, grid.columns - 1), Math.min(row * stride, grid.rows - 1)];
      const height = sample(grid, across, down);
      const first = (row * columns + column) * GROUND_FLOATS;
      vertices[first] = grid.west + (across + 0.5) * grid.cell;
      vertices[first + 1] = grid.north + (down + 0.5) * grid.cell;
      vertices[first + 2] = height;
      const near = (eastward: number, southward: number) => {
        const value = sample(grid, across + eastward * stride, down + southward * stride);
        return Number.isFinite(value) ? value : height;
      };
      // x east, y south: the normal leans against the rise each way.
      const [east, south] = [(near(1, 0) - near(-1, 0)) / (2 * step), (near(0, 1) - near(0, -1)) / (2 * step)];
      const length = Math.hypot(east, south, 1);
      vertices.set([-east / length, -south / length, 1 / length], first + 3);
    }
  }
  const indices: number[] = [];
  const has = (column: number, row: number) => Number.isFinite(vertices[(row * columns + column) * GROUND_FLOATS + 2]);
  for (let row = 0; row + 1 < rows; row++) {
    for (let column = 0; column + 1 < columns; column++) {
      if (!has(column, row) || !has(column + 1, row) || !has(column, row + 1) || !has(column + 1, row + 1)) continue;
      const corner = row * columns + column;
      indices.push(corner, corner + columns, corner + 1, corner + 1, corner + columns, corner + columns + 1);
    }
  }
  return { vertices, indices: new Uint32Array(indices) };
}

/** The ground's height at a point of the island's frame, as the room's `movement::Heights` reads it: null where the
 *  point's own cell has none or lies off the grid, else straight between its four nearest samples, those with none
 *  left out and the rest weighed again. */
export function groundHeight(grid: IsleGrid, x: number, y: number): number | null {
  if (!Number.isFinite(sample(grid, Math.floor((x - grid.west) / grid.cell), Math.floor((y - grid.north) / grid.cell))))
    return null;
  const [along, onward] = [(x - grid.west) / grid.cell - 0.5, (y - grid.north) / grid.cell - 0.5];
  const [column, row] = [Math.floor(along), Math.floor(onward)];
  const [east, south] = [along - column, onward - row];
  const corners: [number, number][] = [
    [sample(grid, column, row), (1 - east) * (1 - south)],
    [sample(grid, column + 1, row), east * (1 - south)],
    [sample(grid, column, row + 1), (1 - east) * south],
    [sample(grid, column + 1, row + 1), east * south],
  ];
  let [sum, weight] = [0, 0];
  for (const [height, share] of corners) {
    if (!Number.isFinite(height)) continue;
    sum += height * share;
    weight += share;
  }
  return weight > 0 ? sum / weight : null;
}

/** A climate's ground: its inland colour, the colour its high ground turns to, and the height above which it lies
 *  under snow (metres; far above any island where it never does). */
export interface GroundLook {
  readonly inland: readonly [number, number, number];
  readonly high: readonly [number, number, number];
  readonly snowM: number;
  /** Whether its low ground is paved in flagstones (a passage's court). */
  readonly paved?: boolean;
  /** The rock of its walls and cliffs in place of its kit's (a passage's chalk hollow). */
  readonly rock?: readonly [number, number, number];
}

const GRASS = [0.3, 0.42, 0.2] as const;
const EARTH = [0.46, 0.37, 0.25] as const;

/** Each climate's ground, by the climates' names in content/islands/kits.json. */
export const GROUND_LOOKS: Readonly<Record<string, GroundLook>> = {
  woodland: { inland: GRASS, high: [0.36, 0.4, 0.22], snowM: 1e4 },
  highland: { inland: [0.38, 0.44, 0.24], high: EARTH, snowM: 1e4 },
  desert: { inland: [0.8, 0.66, 0.45], high: [0.7, 0.5, 0.34], snowM: 1e4 },
  savanna: { inland: [0.62, 0.56, 0.3], high: [0.6, 0.45, 0.28], snowM: 1e4 },
  steppe: { inland: [0.55, 0.53, 0.34], high: EARTH, snowM: 1e4 },
  rainforest: { inland: [0.2, 0.36, 0.14], high: [0.24, 0.32, 0.16], snowM: 1e4 },
  swamp: { inland: [0.3, 0.33, 0.2], high: [0.33, 0.3, 0.21], snowM: 1e4 },
  tundra: { inland: [0.4, 0.45, 0.33], high: [0.5, 0.5, 0.46], snowM: 12 },
};

/** A climate the contract does not name is drawn as woodland. */
export const groundLook = (climate: string): GroundLook =>
  GROUND_LOOKS[climate] ?? (GROUND_LOOKS.woodland as GroundLook);
