// What rises over a dungeon's walls: a room's ceiling flat, a barrel vault across its narrower side, a dome over its
// middle, or rough rock over a cave; and the rock walls of a cave, bulging in and out. Each cell's ceiling is a height
// over every point of it, never below the cell's own ceiling, where its walls end; where two cells' ceilings differ
// along their edge, the higher one's side is closed up to it. Every shape is drawn from where it stands, so every
// machine draws the same.
import type { MeshBuilder } from '../models/model.ts';
import { CORRIDOR, type DungeonLayout, openAt, SIDE_STEPS } from './dungeonLayout.ts';
import { TILE_M, uvOf } from './dungeonUv.ts';

type Point = readonly [number, number, number];
type Picture = readonly [number, number];
type Height = (x: number, y: number) => number;

/** How many strips a curved cell's ceiling is cut into each way, and an edge's closing and a cave's wall. */
const CUTS = 4;
/** The highest a vault or a dome rises over its walls, and how much of its half span it rises at most. */
const RISE_M = { vault: 1.6, dome: 2.2 };
const RISE_SHARE = 0.6;
/** A cave's ceiling rises this far over its walls at least and at most; its walls bulge this far either way. */
const CAVE_RISE_M = [0.25, 1.1] as const;
export const CAVE_BULGE_M = 0.22;
/** The cave's lattice: its rough ceiling and its walls' bulges change this often (m). */
const CAVE_GRAIN_M = 1.6;

/** A number from 0 to 1 at a lattice point, the same everywhere. */
function lattice(column: number, row: number, salt: number): number {
  let hash = Math.imul(column, 73856093) ^ Math.imul(row, 19349663) ^ Math.imul(salt, 83492791);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise from 0 to 1 over the plane, the lattice's values eased between its points. */
export function roughness(x: number, y: number, salt: number): number {
  const [across, down] = [x / CAVE_GRAIN_M, y / CAVE_GRAIN_M];
  const [column, row] = [Math.floor(across), Math.floor(down)];
  const ease = (share: number) => share * share * (3 - 2 * share);
  const [east, south] = [ease(across - column), ease(down - row)];
  const corner = (stepColumn: number, stepRow: number) => lattice(column + stepColumn, row + stepRow, salt);
  const north = corner(0, 0) + (corner(1, 0) - corner(0, 0)) * east;
  const southern = corner(0, 1) + (corner(1, 1) - corner(0, 1)) * east;
  return north + (southern - north) * south;
}

/** Whether a cell is rough rock: a cave room's, or a corridor in the caverns. */
export function isCave(layout: DungeonLayout, cell: number): boolean {
  const room = layout.cells[cell] ?? CORRIDOR;
  if (room >= 0) return layout.rooms[room]?.ceiling === 'cave';
  return room === CORRIDOR && layout.looks[layout.cellLooks[cell] ?? 0]?.style === 'caverns';
}

/** Each cell's ceiling as a height over its points: its own flat ceiling, or its room's vault, dome or cave over it. */
export function ceilingHeights(layout: DungeonLayout): (cell: number) => Height {
  const flat = (cell: number): Height => {
    const height = layout.ceilings[cell] ?? 0;
    return () => height;
  };
  const shaped = layout.rooms.map((room): ((cell: number) => Height) | null => {
    const { cell: side } = layout;
    const [west, north] = [room.x * side, room.y * side];
    const [east, south] = [west + room.width * side, north + room.depth * side];
    const [middleX, middleY] = [(west + east) / 2, (north + south) / 2];
    const inside = (x: number, y: number) => x >= west && x <= east && y >= north && y <= south;
    const arc = (offset: number, half: number, rise: number) =>
      rise * Math.sqrt(Math.max(0, 1 - (offset / half) * (offset / half)));
    if (room.ceiling === 'vault') {
      const across = room.width >= room.depth ? room.depth * side : room.width * side;
      const rise = Math.min(RISE_M.vault, (across / 2) * RISE_SHARE);
      return (cell) => {
        const height = layout.ceilings[cell] ?? 0;
        return (x, y) =>
          inside(x, y) ? height + arc(room.width >= room.depth ? y - middleY : x - middleX, across / 2, rise) : height;
      };
    }
    if (room.ceiling === 'dome') {
      const radius = (Math.min(room.width, room.depth) * side) / 2;
      const rise = Math.min(RISE_M.dome, radius * RISE_SHARE);
      return (cell) => {
        const height = layout.ceilings[cell] ?? 0;
        return (x, y) => height + arc(Math.hypot(x - middleX, y - middleY), radius, rise);
      };
    }
    return null;
  });
  return (cell) => {
    const room = layout.cells[cell] ?? CORRIDOR;
    if (isCave(layout, cell)) {
      const height = layout.ceilings[cell] ?? 0;
      return (x, y) => height + CAVE_RISE_M[0] + (CAVE_RISE_M[1] - CAVE_RISE_M[0]) * roughness(x, y, 7);
    }
    return (room >= 0 ? shaped[room]?.(cell) : null) ?? flat(cell);
  };
}

/** A quad's normal from three of its corners, for a face wound as the city winds its solids. */
function normalOf(a: Point, b: Point, third: Point, flip: boolean): Point {
  const [alongX, alongY, alongZ] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const [acrossX, acrossY, acrossZ] = [third[0] - a[0], third[1] - a[1], third[2] - a[2]];
  const normal: Point = [
    alongY * acrossZ - alongZ * acrossY,
    alongZ * acrossX - alongX * acrossZ,
    alongX * acrossY - alongY * acrossX,
  ];
  return flip ? [-normal[0], -normal[1], -normal[2]] : normal;
}

/** A cell's curved ceiling, cut into strips each way, facing down, its pictures laid by x and y as a floor's. */
export function curvedCeiling(
  mesh: MeshBuilder,
  picture: Picture,
  west: number,
  north: number,
  side: number,
  height: Height,
) {
  const step = side / CUTS;
  for (let row = 0; row < CUTS; row++)
    for (let column = 0; column < CUTS; column++) {
      const [cutWest, cutNorth] = [west + column * step, north + row * step];
      const [cutEast, cutSouth] = [cutWest + step, cutNorth + step];
      const corners: Point[] = [
        [cutWest, cutNorth, height(cutWest, cutNorth)],
        [cutEast, cutNorth, height(cutEast, cutNorth)],
        [cutEast, cutSouth, height(cutEast, cutSouth)],
        [cutWest, cutSouth, height(cutWest, cutSouth)],
      ];
      const [a, b, third] = corners as [Point, Point, Point, Point];
      const normal = normalOf(a, b, third, false);
      const down: Point = normal[2] > 0 ? [-normal[0], -normal[1], -normal[2]] : normal;
      mesh.quad(
        picture,
        corners,
        down,
        corners.map(([x, y]) => [x / TILE_M, y / TILE_M]),
      );
    }
}

/** Closes a cell's side from `low` up to `high` along its edge, both heights over each point of it, facing into the
 *  cell; nothing where the two meet. Its picture runs down from the cell's own ceiling, `top`, as the wall under it. */
export function closeEdge(
  mesh: MeshBuilder,
  picture: Picture,
  edge: {
    readonly from: readonly [number, number];
    readonly to: readonly [number, number];
    readonly facing: Point;
    readonly top: number;
  },
  low: Height,
  high: Height,
): void {
  const [startX, startY] = edge.from;
  const [endX, endY] = edge.to;
  for (let piece = 0; piece < CUTS; piece++) {
    const [first, second] = [piece / CUTS, (piece + 1) / CUTS];
    const along = (share: number) => [startX + (endX - startX) * share, startY + (endY - startY) * share] as const;
    const [[firstX, firstY], [secondX, secondY]] = [along(first), along(second)];
    const [lowA, lowB] = [low(firstX, firstY), low(secondX, secondY)];
    const [highA, highB] = [high(firstX, firstY), high(secondX, secondY)];
    if (!(highA - lowA > 1e-3 || highB - lowB > 1e-3)) continue;
    const corners: Point[] = [
      [firstX, firstY, lowA],
      [secondX, secondY, lowB],
      [secondX, secondY, Math.max(lowB, highB)],
      [firstX, firstY, Math.max(lowA, highA)],
    ];
    mesh.quad(picture, corners, edge.facing, corners.map(uvOf(edge.facing, edge.top)));
  }
}

/** How far a cave's rock wall stands back into the rock (less than nothing: out into the cell) at a point (x, y) of
 *  its cell's edge, `along` the edge and `up` the wall, each from 0 to 1: none at the edge's ends, its foot or its
 *  head. */
export function caveBulge(x: number, y: number, along: number, up: number): number {
  return (roughness(x, y + up * 7, 11) * 2 - 1) * CAVE_BULGE_M * Math.sin(Math.PI * along) * Math.sin(Math.PI * up);
}

/** The most an arch round the portal or the exit door spans along its wall either side of its middle, and its top
 *  (m), as the kits' envelopes allow (tools/dungeon/envelope.py). */
export const ARCH_M = { half: 1.3, top: 3.1 } as const;

/** A cell's side, by its column, its row, the side's number and the cell's size. */
type WallAt = { readonly column: number; readonly row: number; readonly side: number; readonly cell: number };

/** A cave wall's lattice, as `caveWall` draws it: the heights of its rows (m), each point's place on the wall line
 *  (`column` along the edge from its left end seen from the cell, `row` up), and how far the rock stands back there.
 *  Up to `flat` m the wall is one flat row, so an arch stands on flat rock, and over it the bulges ease back in. */
function latticeOf(where: WallAt, high: number, flat: number) {
  const [east, south] = SIDE_STEPS[where.side] ?? [0, 0];
  const half = where.cell / 2;
  const [leftX, leftY] = [
    (where.column + 0.5) * where.cell + east * half - south * half,
    (where.row + 0.5) * where.cell + south * half + east * half,
  ];
  const low = Math.min(Math.max(0, flat), high);
  const rows =
    low >= high
      ? [0, high]
      : [
          ...(low > 0 ? [0] : []),
          ...Array.from({ length: CUTS + 1 }, (_unused, row) => low + ((high - low) * row) / CUTS),
        ];
  const onLine = (column: number, row: number): Point => [
    leftX + (south * where.cell * column) / CUTS,
    leftY - (east * where.cell * column) / CUTS,
    rows[row] ?? 0,
  ];
  const back = (column: number, row: number): number => {
    const [x, y, z] = onLine(column, row);
    if (!(z > low)) return 0;
    const rise = low > 0 ? (z - low) / (high - low) : 1;
    return caveBulge(x, y, column / CUTS, z / high) * rise * rise * (3 - 2 * rise);
  };
  return { east, south, rows, onLine, back };
}

/** A cave cell's rock wall on its side from the floor to its ceiling, facing into the cell, bulging in and out by the
 *  lattice and never at its edges, so it meets the floor, the ceiling and the next wall without a gap; flat up to
 *  `flat` m, where an arch stands on it. */
export function caveWall(mesh: MeshBuilder, picture: Picture, where: WallAt, high: number, flat = 0): void {
  const { east, south, rows, onLine, back } = latticeOf(where, high, flat);
  const point = (column: number, row: number): Point => {
    const [x, y, z] = onLine(column, row);
    const bulge = back(column, row);
    return [x + east * bulge, y + south * bulge, z];
  };
  const facing: Point = [-east, -south, 0];
  for (let row = 0; row + 1 < rows.length; row++)
    for (let column = 0; column < CUTS; column++) {
      const corners = [point(column, row), point(column + 1, row), point(column + 1, row + 1), point(column, row + 1)];
      mesh.quad(picture, corners, facing, corners.map(uvOf(facing, high)));
    }
}

/** The least and the most a cave cell's wall, as `caveWall` draws it with no flat foot, stands back into the rock over
 *  a span of it: `along` its edge from the left end seen from the cell, and `up` it (m). Each of its lattice's
 *  triangles is flat, so the rock comes least and most at a corner of the span within a quad, or where the span's
 *  edges cross a quad's diagonal. Over the wall's head the rock closes up its edge, standing back none. */
export function caveWallRange(
  where: WallAt,
  high: number,
  [alongFrom, alongTo]: readonly [number, number],
  [upFrom, upTo]: readonly [number, number],
): readonly [number, number] {
  const { rows, back } = latticeOf(where, high, 0);
  const values = upTo > high ? [0] : [];
  // A span's share of a quad from `low` to `top`, kept to it.
  const share = (value: number, low: number, top: number) => Math.min(1, Math.max(0, (value - low) / (top - low)));
  for (let row = 0; row + 1 < rows.length; row++) {
    const [bottom = 0, top = 0] = [rows[row], rows[row + 1]];
    if (upTo < bottom || upFrom > top) continue;
    const [upLow, upHigh] = [share(upFrom, bottom, top), share(upTo, bottom, top)];
    for (let column = 0; column < CUTS; column++) {
      const [left, right] = [(column * where.cell) / CUTS, ((column + 1) * where.cell) / CUTS];
      if (alongTo < left || alongFrom > right) continue;
      const [alongLow, alongHigh] = [share(alongFrom, left, right), share(alongTo, left, right)];
      const [corner, across, above, both] = [
        back(column, row),
        back(column + 1, row),
        back(column, row + 1),
        back(column + 1, row + 1),
      ];
      // A quad is cut along its diagonal from its first corner: one triangle below it, one above.
      const value = (along: number, up: number) =>
        along >= up
          ? corner + along * (across - corner) + up * (both - across)
          : corner + up * (above - corner) + along * (both - above);
      const diagonal = [alongLow, alongHigh, upLow, upHigh].filter(
        (cut) => cut >= alongLow && cut <= alongHigh && cut >= upLow && cut <= upHigh,
      );
      values.push(
        value(alongLow, upLow),
        value(alongHigh, upLow),
        value(alongLow, upHigh),
        value(alongHigh, upHigh),
        ...diagonal.map((cut) => value(cut, cut)),
      );
    }
  }
  return values.length > 0 ? [Math.min(...values), Math.max(...values)] : [0, 0];
}

/** Whether a cell's neighbour on `side` is open, and its index. */
export function besideOf(layout: DungeonLayout, column: number, row: number, side: number): number | null {
  const [east, south] = SIDE_STEPS[side] ?? [0, 0];
  return openAt(layout, column + east, row + south) ? (row + south) * layout.columns + column + east : null;
}
