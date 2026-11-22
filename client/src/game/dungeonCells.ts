// A dungeon's grid as the kits read it: each cell's neighbours and walls, its middle and its edges' middles, which
// way a corridor runs through it, and where a piece's plan lies over the cells, the solids and the props.
import type { ForgedModel } from '../models/model.ts';
import { CORRIDOR, type DungeonLayout, openAt, SIDE_STEPS } from './dungeonLayout.ts';
import { type ModuleMesh, type Place, turnAbout, type Turns } from './dungeonModules.ts';
import { turned } from './entrances.ts';

/** A plan seen from above: its least and greatest x and y (m). */
export type Rect = readonly [minX: number, minY: number, maxX: number, maxY: number];

export const SIDES = [0, 1, 2, 3] as const;
const EPS = 1e-6;

export const stepOf = (side: number) => SIDE_STEPS[side] ?? [0, 0];
export const columnRow = (layout: DungeonLayout, cell: number): readonly [number, number] => [
  cell % layout.columns,
  Math.floor(cell / layout.columns),
];
export const isOpen = (layout: DungeonLayout, cell: number) => openAt(layout, ...columnRow(layout, cell));

/** The cell beside a cell on `side`, or null past the grid. */
export function besideCell(layout: DungeonLayout, cell: number, side: number): number | null {
  const [column, row] = columnRow(layout, cell);
  const [east, south] = stepOf(side);
  const [next, below] = [column + east, row + south];
  if (next < 0 || below < 0 || next >= layout.columns || below >= layout.rows) return null;
  return below * layout.columns + next;
}

/** Whether a cell's side meets rock or the grid's edge. */
export function rockOn(layout: DungeonLayout, cell: number, side: number): boolean {
  const next = besideCell(layout, cell, side);
  return next === null || !isOpen(layout, next);
}

/** A cell with rock on three sides. */
export const alcove = (layout: DungeonLayout, cell: number) =>
  SIDES.filter((side) => rockOn(layout, cell, side)).length === 3;

/** A room's cell no side of which meets a corridor. */
export const quiet = (layout: DungeonLayout, cell: number) =>
  (layout.cells[cell] ?? CORRIDOR) >= 0 &&
  SIDES.every((side) => layout.cells[besideCell(layout, cell, side) ?? -1] !== CORRIDOR);

/** A cell's middle (m). */
export function centreOf(layout: DungeonLayout, cell: number): readonly [number, number] {
  const [column, row] = columnRow(layout, cell);
  return [(column + 0.5) * layout.cell, (row + 0.5) * layout.cell];
}

/** The middle of a cell's edge on `side` (m). */
export function wallPoint(layout: DungeonLayout, cell: number, side: number): readonly [number, number] {
  const [x, y] = centreOf(layout, cell);
  const [east, south] = stepOf(side);
  return [x + (east * layout.cell) / 2, y + (south * layout.cell) / 2];
}

/** The cell a point stands in. */
export const cellAt = (layout: DungeonLayout, x: number, y: number) =>
  Math.floor(y / layout.cell) * layout.columns + Math.floor(x / layout.cell);

/** A point a little off a cell's wall, as a torch, the exit and the portal give theirs, moved onto the wall. */
export function ontoWall(layout: DungeonLayout, x: number, y: number, side: number): readonly [number, number] {
  const [east, south] = stepOf(side);
  const edge = (along: number, step: number) =>
    step === 0 ? along : (Math.floor(along / layout.cell) + 0.5 + step / 2) * layout.cell;
  return [edge(x, east), edge(y, south)];
}

/** The turns that lay a piece's +x along a straight way through a cell: 0 east-west, 1 north-south; null where the
 *  way turns or meets another. */
export function wayTurns(layout: DungeonLayout, cell: number): Turns | null {
  if (rockOn(layout, cell, 1) && rockOn(layout, cell, 3)) return 0;
  if (rockOn(layout, cell, 0) && rockOn(layout, cell, 2)) return 1;
  return null;
}

/** A piece's plan seen from above, laid where `place` says: its bounds turned and moved. */
export function planOf(module: ModuleMesh, place: Place): Rect {
  const [minX, minY, , maxX, maxY] = module.bounds;
  const [first, second] = [turnAbout([minX, minY, 0], place.turns), turnAbout([maxX, maxY, 0], place.turns)];
  const [x, y] = place.origin;
  return [
    Math.min(first[0], second[0]) + x,
    Math.min(first[1], second[1]) + y,
    Math.max(first[0], second[0]) + x,
    Math.max(first[1], second[1]) + y,
  ];
}

/** The cells of the grid a plan lies over, past its edges' touching. */
export function cellsUnder(layout: DungeonLayout, [minX, minY, maxX, maxY]: Rect): number[] {
  const cells: number[] = [];
  const size = layout.cell;
  const [first, last] = [
    Math.max(0, Math.floor(minX / size + EPS)),
    Math.min(layout.columns - 1, Math.floor(maxX / size - EPS)),
  ];
  const bottom = Math.min(layout.rows - 1, Math.floor(maxY / size - EPS));
  for (let row = Math.max(0, Math.floor(minY / size + EPS)); row <= bottom; row++)
    for (let column = first; column <= last; column++) cells.push(row * layout.columns + column);
  return cells;
}

/** Each forged prop's plan seen from above as `layModel` lays it: its model's bounds turned by its yaw. `models` are
 *  the props' models in their order, null where the forge builds none and nothing is drawn. A hung prop's origin
 *  stands behind its wall's face and its picture in front of it, so only its model says where it is. */
export function propPlans(layout: DungeonLayout, models: readonly (ForgedModel | null)[]): Rect[] {
  return layout.props.flatMap(([, x, y, , yaw], index) => {
    const model = models[index];
    if (!model) return [];
    // A model's x runs right and its z forward: the two axes of its plan.
    const span = (axis: number) => {
      const values = model.positions.filter((_value, place) => place % 3 === axis);
      return [Math.min(...values), Math.max(...values)];
    };
    const ahead = span(2);
    const corners = span(0).flatMap((right) => ahead.map((forward) => turned([right, 0, forward], yaw)));
    const [eastings, southings] = [corners.map(([east]) => east), corners.map(([, south]) => south)];
    return [
      [x + Math.min(...eastings), y + Math.min(...southings), x + Math.max(...eastings), y + Math.max(...southings)],
    ] as const;
  });
}

/** Whether any solid, or with `grow` any prop's plan (`props`, as `propPlans` gives them; a hanging has no solid),
 *  stands within `grow` of a plan. */
export function crowded(
  layout: DungeonLayout,
  props: readonly Rect[],
  [minX, minY, maxX, maxY]: Rect,
  grow: number,
): boolean {
  const meets = ([west, north, east, south]: readonly [number, number, number, number, ...number[]]) =>
    west < maxX + grow - EPS && east > minX - grow + EPS && north < maxY + grow - EPS && south > minY - grow + EPS;
  return layout.boxes.some(meets) || (grow > 0 && props.some(meets));
}
