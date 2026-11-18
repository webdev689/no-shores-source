// The city's ground: a plate at each levelled cell's level, dressed in its block's ground tiles (an avenue as a
// road between lawns, the landmark's ground paved), with a skirt down its open sides, so the land's 1 km smoothing
// never shows a terrace floating or buried. And what of the land the city keeps clear: its pads and every solid's
// footprint.
import { groundTiles, type RmbBlock, TILES } from './blocks.ts';
import { addPolygon, type MeshData } from './mesh.ts';
import { CELL_M, type CityPlan, type PlanCell, type Solid, solidReach } from './plan.ts';
import { SOLID_TEXELS_PER_METRE } from './solidMesh.ts';

/** How far a plate's skirt reaches under it where nothing built stands beside it. */
const SKIRT_M = 30;
/** A tile's turns that mark it paved: laid in the paving picture over the whole plate. */
export const PAVED_TILE = 4;
/** The terrain set's grass, where an avenue's road leaves its cell's sides. */
const LAWN = { record: 2, turns: 0 };

type Tile = { record: number; turns: number };
type Sides = { north: boolean; south: boolean; west: boolean; east: boolean };

/** An avenue's cell: a paved road 38.4 m wide through its middle toward each paved cell beside it, grass either
 *  side, with no kerb or border, so a run of avenues reads as one road and not as a grid of squares; paved whole
 *  where nothing paved stands beside it. Undefined is paving. */
function avenueTile(row: number, column: number, sides: Sides): Tile | undefined {
  if (!sides.north && !sides.south && !sides.west && !sides.east) return undefined;
  const [low, high] = [TILES / 2 - 3, TILES / 2 + 2];
  const [inColumns, inRows] = [column >= low && column <= high, row >= low && row <= high];
  const road =
    (inColumns && ((sides.north && row <= high) || (sides.south && row >= low))) ||
    (inRows && ((sides.west && column <= high) || (sides.east && column >= low)));
  return road ? undefined : LAWN;
}

/** The cells a plan's grid holds along each side. */
export const sideOf = (plan: CityPlan): number => Math.round((2 * (plan.centre[0] - plan.grid.west)) / CELL_M);

/** A cell's place in the list of every cell, row by row. */
export const cellIndex = (side: number, column: number, row: number): number => row * side + column;

/** Every levelled cell by its place, with its level. */
export function levelledCells(plan: CityPlan): Map<number, PlanCell & { level: number }> {
  const side = sideOf(plan);
  const levelled = new Map<number, PlanCell & { level: number }>();
  for (const cell of plan.cells)
    if (cell.ground === 'level' && cell.level !== undefined)
      levelled.set(cellIndex(side, cell.column, cell.row), { ...cell, level: cell.level });
  return levelled;
}

/** The levelled cells that stand on a plate of their own: all but those holding placed pieces, which stand on the
 *  land. */
function platedCells(plan: CityPlan): Map<number, PlanCell & { level: number }> {
  const plated = levelledCells(plan);
  for (const [index, cell] of plated) if (cell.use === 'pieces') plated.delete(index);
  return plated;
}

/** The plates' tops (positions only, from the city's origin), and their tiles: per tile its layer and quarter turns,
 *  (side x 16) tiles a row. */
export function groundPlates(
  plan: CityPlan,
  blocks: ReadonlyMap<string, RmbBlock>,
  groundLayers: readonly number[],
  paving: number,
): { tops: Float32Array; tiles: Uint8Array; width: number } {
  const side = sideOf(plan);
  const width = side * TILES;
  const tiles = new Uint8Array(width * width * 2);
  const byPlace = platedCells(plan);
  const levelled = [...byPlace.values()];
  const tops = new Float32Array(levelled.length * 18);
  const paved = (column: number, row: number): boolean => {
    if (column < 0 || row < 0 || column >= side || row >= side) return false;
    const use = byPlace.get(cellIndex(side, column, row))?.use;
    return use === 'avenue' || use === 'landmark';
  };
  levelled.forEach((cell, k) => {
    const [west, north] = [
      cell.column * CELL_M + plan.grid.west - plan.centre[0],
      cell.row * CELL_M + plan.grid.north - plan.centre[1],
    ];
    const [east, south] = [west + CELL_M, north + CELL_M];
    // wound to face up as the city's other faces are
    tops.set([west, north, cell.level, east, south, cell.level, west, south, cell.level], k * 18);
    tops.set([west, north, cell.level, east, north, cell.level, east, south, cell.level], k * 18 + 9);
    const block = cell.block === undefined ? undefined : blocks.get(cell.block);
    const laid = block ? groundTiles(block) : null;
    const sides = {
      north: paved(cell.column, cell.row - 1),
      south: paved(cell.column, cell.row + 1),
      west: paved(cell.column - 1, cell.row),
      east: paved(cell.column + 1, cell.row),
    };
    for (let row = 0; row < TILES; row++)
      for (let column = 0; column < TILES; column++) {
        const tile = laid
          ? laid[row * TILES + column]
          : cell.use === 'avenue'
            ? avenueTile(row, column, sides)
            : cell.use === 'landmark'
              ? undefined
              : LAWN;
        const slot = ((cell.row * TILES + row) * width + cell.column * TILES + column) * 2;
        tiles[slot] = tile ? (groundLayers[tile.record] ?? 0) : paving;
        tiles[slot + 1] = tile ? tile.turns : PAVED_TILE;
      }
  });
  return { tops, tiles, width };
}

/** The skirts down each plate's sides that no plate as high stands beside, wound out of the plate. */
export function plateSkirts(
  plan: CityPlan,
  layer: number,
  picture: { width: number; height: number },
  into: (cell: PlanCell) => MeshData,
): void {
  const side = sideOf(plan);
  const levelled = platedCells(plan);
  const [scaleU, scaleV] = [SOLID_TEXELS_PER_METRE / picture.width, SOLID_TEXELS_PER_METRE / picture.height];
  const sides = [
    { step: [0, -1], from: [0, 0], to: [1, 0], out: [0, -1, 0] },
    { step: [1, 0], from: [1, 0], to: [1, 1], out: [1, 0, 0] },
    { step: [0, 1], from: [1, 1], to: [0, 1], out: [0, 1, 0] },
    { step: [-1, 0], from: [0, 1], to: [0, 0], out: [-1, 0, 0] },
  ] as const;
  for (const cell of levelled.values()) {
    const [west, north] = [
      cell.column * CELL_M + plan.grid.west - plan.centre[0],
      cell.row * CELL_M + plan.grid.north - plan.centre[1],
    ];
    for (const { step, from, to, out } of sides) {
      const [column, row] = [cell.column + step[0], cell.row + step[1]];
      const beside =
        column >= 0 && row >= 0 && column < side && row < side ? levelled.get(cellIndex(side, column, row)) : undefined;
      if (beside && beside.level >= cell.level) continue;
      const bottom = Math.max(cell.level - SKIRT_M, beside ? beside.level : -Infinity);
      const [a, b] = [
        [west + from[0] * CELL_M, north + from[1] * CELL_M],
        [west + to[0] * CELL_M, north + to[1] * CELL_M],
      ];
      const along = (point: number[]): number => (point[0] - west + point[1] - north) * scaleU;
      addPolygon(
        into(cell),
        [
          [a[0], a[1], bottom],
          [b[0], b[1], bottom],
          [b[0], b[1], cell.level],
          [a[0], a[1], cell.level],
        ],
        [out],
        [
          [along(a), -bottom * scaleV],
          [along(b), -bottom * scaleV],
          [along(b), -cell.level * scaleV],
          [along(a), -cell.level * scaleV],
        ],
        layer,
        out,
      );
    }
  }
}

/** Buckets of the clear ground, this many metres a side. */
const BUCKET_M = 64;

/** Whether a world point lies on the city's pads or under any of its solids, for nature to keep off. */
export function clearedGround(plan: CityPlan): (x: number, y: number) => boolean {
  const rects: (readonly [number, number, number, number])[] = plan.pads.map((pad) => pad.bounds);
  const solids: Solid[] = [...plan.works, ...plan.landmark, ...plan.social.solids];
  const buckets = new Map<string, { rects: number[]; solids: number[] }>();
  const bucket = (column: number, row: number) => {
    const key = `${column},${row}`;
    let found = buckets.get(key);
    if (!found) buckets.set(key, (found = { rects: [], solids: [] }));
    return found;
  };
  const spread = (bounds: readonly number[], add: (entry: { rects: number[]; solids: number[] }) => void): void => {
    for (let row = Math.floor(bounds[1] / BUCKET_M); row <= Math.floor(bounds[3] / BUCKET_M); row++)
      for (let column = Math.floor(bounds[0] / BUCKET_M); column <= Math.floor(bounds[2] / BUCKET_M); column++)
        add(bucket(column, row));
  };
  rects.forEach((rect, k) => spread(rect, (entry) => entry.rects.push(k)));
  const reaches = solids.map(solidReach);
  solids.forEach((solid, k) =>
    spread(
      [solid.at[0] - reaches[k], solid.at[1] - reaches[k], solid.at[0] + reaches[k], solid.at[1] + reaches[k]],
      (entry) => entry.solids.push(k),
    ),
  );
  return (x, y) => {
    const entry = buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(y / BUCKET_M)}`);
    if (!entry) return false;
    for (const k of entry.rects) {
      const rect = rects[k];
      if (x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3]) return true;
    }
    for (const k of entry.solids) {
      const solid = solids[k];
      const [east, south] = [x - solid.at[0], y - solid.at[1]];
      if (solid.lean || solid.roll) {
        if (Math.hypot(east, south) <= reaches[k]) return true;
        continue;
      }
      const [cosine, sine] = [Math.cos(solid.turn), Math.sin(solid.turn)];
      const [across, along] = [east * cosine + south * sine, -east * sine + south * cosine];
      if (Math.abs(across) <= solid.size[0] / 2 && Math.abs(along) <= solid.size[1] / 2) return true;
    }
    return false;
  };
}
