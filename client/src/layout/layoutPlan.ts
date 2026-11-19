// Layouts drawn by the city layer: the layouts near the eye gathered into one plan of placed pieces (every building
// and prop where its layout stood it) and solids (plinths, set pieces, works and rooms), on a grid of cells just large
// enough to hold them. Its cells carry no plates: what stands in them stands on the land. A block's streets and the
// paths are the terrain's to draw (the game's groundPaint.ts).
import { type CityPlan, CELL_M, type Pad, type PlanCell, type Piece } from '../city/plan.ts';
import type { NodeLayout } from './layouts.ts';

/** How far round a building nothing wild grows, metres: its yard, its eaves' drip and the lane past its door. */
const YARD_CLEAR_M = 10;
/** How much of each kind of area's reach is open ground nothing wild grows on; a kind not listed keeps its wild. */
const CLEARED_SHARE: Readonly<Record<string, number>> = {
  landing: 0.9,
  entrance: 0.7,
  gate: 0.45,
  camp: 0.65,
  wilds: 0.5,
  arena: 0.7,
  tower: 0.6,
  lighthouse: 0.7,
  dock: 0.7,
  mill: 0.6,
  quarry: 0.7,
  bones: 0.55,
  causeway: 0.6,
  cave: 0.4,
  farm: 0.85,
  graveyard: 0.75,
  shrine: 0.6,
  ruin: 0.45,
  keep: 0.6,
  hamlet: 0.55,
};
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
  return square.map(([across, down]) => {
    switch (turns % 4) {
      case 1:
        return [1 - down, across];
      case 2:
        return [1 - across, 1 - down];
      case 3:
        return [down, 1 - across];
      default:
        return [across, down];
    }
  });
}

/** A run's ground nothing wild grows on: its beats whole, and its way every few metres. */
function runClearings(
  run: NonNullable<NodeLayout['runs']>[number],
): { at: readonly [number, number]; radius: number }[] {
  const along = run.line.slice(1).flatMap((to, k) => {
    const from = run.line[k] ?? to;
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / RUN_CLEAR_EVERY_M));
    return Array.from({ length: steps }, (_unused, step) => ({
      at: [from[0] + ((to[0] - from[0]) * step) / steps, from[1] + ((to[1] - from[1]) * step) / steps] as const,
      radius: RUN_CLEAR_M,
    }));
  });
  return [...run.beats.map((beat) => ({ at: beat.at, radius: beat.radius + 2 })), ...along];
}

/** How far round a run's way nothing wild grows, metres, and how far apart its clearings are laid. */
const RUN_CLEAR_M = 6;
const RUN_CLEAR_EVERY_M = 5;

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
      open: seated.open,
      at: seated.at,
      yaw: seated.yaw,
    })),
  );
  // Rubble wears the zone's own stone where its brief names one (pictures.ts CHALK).
  const solids = layouts.flatMap((layout) =>
    [...layout.solids, ...layout.rooms].map((solid) =>
      layout.stone === 'chalk' && solid.material === 'rubble' ? { ...solid, material: 'chalk' as const } : solid,
    ),
  );
  const spots = [
    ...pieces.map((piece) => [piece.at[0], piece.at[1]] as const),
    ...layouts.flatMap((layout) => layout.tiles.map((tile) => tile.at)),
    ...solids.map((solid) => [solid.at[0], solid.at[1]] as const),
  ];
  if (!spots.length) return null;
  const [west, north, east, south] = spots.reduce(
    ([west, north, east, south], [x, y]) => [
      Math.min(west, x),
      Math.min(north, y),
      Math.max(east, x),
      Math.max(south, y),
    ],
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
    clearings: layouts.flatMap((layout) => [
      ...layout.areas.flatMap((area) => {
        const share = CLEARED_SHARE[area.kind];
        return share ? [{ at: area.at, radius: area.radius * share }] : [];
      }),
      ...(layout.runs ?? []).flatMap(runClearings),
    ]),
  };
}
