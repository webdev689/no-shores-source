// Layouts drawn by the city layer: the layouts near the eye gathered into one plan of placed pieces (every building
// and prop where its layout stood it), solids (plinths and set pieces), and ground pictures laid on the land (a block's
// streets and yards, and the paths), on a grid of cells just large enough to hold them. Its cells carry no plates:
// what stands in them stands on the land.
import { type CityPlan, CELL_M, type Decal, type Pad, type PlanCell, type Piece } from '../city/plan.ts';
import { type LaidPath, type LaidTile, type NodeLayout, PATH_WIDTH_M } from './layouts.ts';

/** How far round a building nothing wild grows, metres: its yard, its eaves' drip and the lane past its door. */
const YARD_CLEAR_M = 10;
/** The ground records a path wears: Daggerfall's dirt. */
const DIRT = 1;
/** A ground picture's side on the land, metres: one tile of a block. */
const PICTURE_M = CELL_M / 16;

/** A tile's corner UVs (north-west, north-east, south-east, south-west), turned as its byte and its block turn it:
 *  a flip read as a half turn, as the city reads it. */
export function tileUvs(byte: number, blockTurns: number): [number, number][] {
  const turns = (((byte >> 6) & 1) | (((byte >> 7) & 1) << 1)) + blockTurns;
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  return square.map(([u, v]) => {
    switch (turns % 4) {
      case 1:
        return [1 - v, u];
      case 2:
        return [1 - u, 1 - v];
      case 3:
        return [v, 1 - u];
      default:
        return [u, v];
    }
  });
}

/** A tile as a ground picture laid on its corners' heights. */
function tileDecal(tile: LaidTile): Decal {
  const half = PICTURE_M / 2;
  const [x, y] = tile.at;
  const spots: [number, number][] = [
    [x - half, y - half],
    [x + half, y - half],
    [x + half, y + half],
    [x - half, y + half],
  ];
  return {
    corners: spots.map(([east, south], k) => [east, south, tile.corners[k]] as const),
    uvs: tileUvs(tile.byte, tile.turns),
    record: tile.byte & 63,
  };
}

/** A path as a ribbon of ground pictures, a quad between each pair of its points, its edges square to its way and
 *  mitred at each bend; the stretches over a river's crossing are left to its bridge. */
export function pathDecals(path: LaidPath): Decal[] {
  const half = PATH_WIDTH_M[path.tier] / 2;
  const points = path.points;
  if (points.length < 2 || path.heights.length !== points.length) return [];
  const across = points.map((point, k) => {
    const before = points[Math.max(k - 1, 0)];
    const after = points[Math.min(k + 1, points.length - 1)];
    const [east, south] = [after[0] - before[0], after[1] - before[1]];
    const length = Math.hypot(east, south) || 1;
    return [-south / length, east / length] as const;
  });
  const overWater = (point: readonly [number, number]) =>
    path.crossings.some(([from, to]) => {
      const [spanX, spanY] = [to[0] - from[0], to[1] - from[1]];
      const length = spanX * spanX + spanY * spanY || 1;
      const along = ((point[0] - from[0]) * spanX + (point[1] - from[1]) * spanY) / length;
      const [nearX, nearY] = [from[0] + spanX * along, from[1] + spanY * along];
      return along > 0 && along < 1 && Math.hypot(point[0] - nearX, point[1] - nearY) < 4;
    });
  const decals: Decal[] = [];
  let travelled = 0;
  for (let k = 0; k + 1 < points.length; k++) {
    const [from, to] = [points[k], points[k + 1]];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [startV, endV] = [travelled / PICTURE_M, (travelled + length) / PICTURE_M];
    travelled += length;
    if (overWater(from) || overWater(to)) continue;
    const side = (point: readonly [number, number], k2: number, sign: number, height: number) =>
      [point[0] + across[k2][0] * half * sign, point[1] + across[k2][1] * half * sign, height] as const;
    const width = (2 * half) / PICTURE_M;
    decals.push({
      corners: [
        side(from, k, -1, path.heights[k]),
        side(from, k, 1, path.heights[k]),
        side(to, k + 1, 1, path.heights[k + 1]),
        side(to, k + 1, -1, path.heights[k + 1]),
      ],
      uvs: [
        [0, startV],
        [width, startV],
        [width, endV],
        [0, endV],
      ],
      record: DIRT,
    });
  }
  return decals;
}

/** The ground round each building kept clear of the wild, as rects: what nature keeps off. */
function yards(layouts: readonly NodeLayout[]): Pad[] {
  return layouts.flatMap((layout) =>
    layout.buildings.map((building) => {
      const [west, north, east, south] = building.footprint;
      return {
        bounds: [west - YARD_CLEAR_M, north - YARD_CLEAR_M, east + YARD_CLEAR_M, south + YARD_CLEAR_M],
        level: building.at[2],
      };
    }),
  );
}

/** The layouts as one plan the city layer draws, or null when they hold nothing to draw. */
export function planOfLayouts(layouts: readonly NodeLayout[]): CityPlan | null {
  const pieces: Piece[] = layouts.flatMap((layout) =>
    [...layout.buildings, ...layout.props].map((seated) => ({
      model: seated.model,
      building: seated.building,
      at: seated.at,
      yaw: seated.yaw,
    })),
  );
  const decals: Decal[] = layouts.flatMap((layout) => [
    ...layout.tiles.map(tileDecal),
    ...layout.paths.flatMap(pathDecals),
  ]);
  const solids = layouts.flatMap((layout) => layout.solids);
  const spots = [
    ...pieces.map((piece) => [piece.at[0], piece.at[1]] as const),
    ...decals.flatMap((decal) => decal.corners.map((corner) => [corner[0], corner[1]] as const)),
    ...solids.map((solid) => [solid.at[0], solid.at[1]] as const),
  ];
  if (!spots.length) return null;
  const [west, north, east, south] = spots.reduce(
    ([w, n, e, s], [x, y]) => [Math.min(w, x), Math.min(n, y), Math.max(e, x), Math.max(s, y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const centre = [(west + east) / 2, (north + south) / 2] as const;
  // a cell spare each way, and an odd count so the grid's middle cell sits on the centre as the city's does
  const side = 2 * Math.ceil(Math.max(east - west, south - north) / CELL_M / 2) + 3;
  const grid = { west: centre[0] - (side * CELL_M) / 2, north: centre[1] - (side * CELL_M) / 2 };
  const levels = new Map<string, PlanCell & { level: number }>();
  for (const piece of pieces) {
    const [column, row] = [
      Math.floor((piece.at[0] - grid.west) / CELL_M),
      Math.floor((piece.at[1] - grid.north) / CELL_M),
    ];
    const key = `${column},${row}`;
    const known = levels.get(key);
    if (!known || piece.at[2] < known.level)
      levels.set(key, { column, row, ground: 'level', level: piece.at[2], use: 'pieces' });
  }
  const tileRects: Pad[] = layouts.flatMap((layout) =>
    layout.tiles.map((tile) => ({
      bounds: [
        tile.at[0] - PICTURE_M / 2,
        tile.at[1] - PICTURE_M / 2,
        tile.at[0] + PICTURE_M / 2,
        tile.at[1] + PICTURE_M / 2,
      ],
      level: tile.corners[0],
    })),
  );
  return {
    id: 'layouts',
    name: 'Layouts',
    motif: '',
    centre,
    grid,
    cells: [...levels.values()],
    gates: [],
    harbour: null,
    landmark: [],
    works: solids,
    social: { bounds: [0, 0, 0, 0], level: 0, ring: [], spawns: [], solids: [] },
    pads: [...layouts.flatMap((layout) => layout.pads), ...tileRects, ...yards(layouts)],
    pieces,
    decals,
  };
}
