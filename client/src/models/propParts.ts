// The boxes a prop's drawn shape fills, which the rules stand bodies against in place of the prop's whole box
// (crates/layout/src/collide.rs reads them from content/forged/parts.json, which tools/forgedParts.mjs writes from
// here). The piece's floor plan is cut into columns, each as high as its mesh reaches over it, and neighbouring
// columns as high are joined, so a boat is its hull, deck and mast, not a block as tall as its mast.
import type { ForgedModel, Point } from './model.ts';
import type { PropTable } from './tables.ts';
import { propModel } from './props.ts';

/** A box of the prop's own frame: low x, y, z, then high x, y, z, metres. */
export type PropPart = readonly [number, number, number, number, number, number];

/** A column's side, and on a piece longer than LARGE_M a larger one, metres. */
export const PART_CELL_M = 0.25;
export const LARGE_PART_CELL_M = 0.5;
export const LARGE_M = 8;
/** Columns are joined whose tops lie within this of each other, metres: a body stands no further off the mesh. */
export const TOP_KEEP_M = 0.25;
/** A crouched body's height: a gap lower is filled, and an underside lower than this over the floor is the floor. */
export const CROUCHED_M = 1.0;
/** Undersides over a body's head are joined within this of each other, metres. */
export const UNDERSIDE_KEEP_M = 0.5;
/** What reaches no higher than this over the floor is stepped over, as the layouts step over it, metres. */
export const STEPPED_OVER_M = 0.45;
/** A column of a lone surface (a canopy, a deck) is at least this thick, metres. */
export const THINNEST_M = 0.2;
/** A column takes in what lies this far past its edges, metres: the mesh's single floats put a face on the box's own
 *  edge a hair outside it. */
const EDGE_M = 1e-4;

type Span = [bottom: number, top: number];

/** The y the triangle reaches within a column (x from `fromX` to `toX`, z from `fromZ` to `toZ`), if it crosses it. */
function reachIn(triangle: number[][], fromX: number, toX: number, fromZ: number, toZ: number): Span | null {
  let polygon = triangle;
  const clip = (axis: number, bound: number, above: boolean): void => {
    const kept: number[][] = [];
    polygon.forEach((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const [inside, nextInside] = [point, next].map((corner) =>
        above ? corner[axis] >= bound : corner[axis] <= bound,
      );
      if (inside) kept.push(point);
      if (inside !== nextInside) {
        const share = (bound - point[axis]) / (next[axis] - point[axis]);
        kept.push(point.map((value, index) => value + (next[index] - value) * share));
      }
    });
    polygon = kept;
  };
  for (const [axis, bound, above] of [
    [0, fromX - EDGE_M, true],
    [0, toX + EDGE_M, false],
    [2, fromZ - EDGE_M, true],
    [2, toZ + EDGE_M, false],
  ] as const) {
    clip(axis, bound, above);
    if (polygon.length === 0) return null;
  }
  const heights = polygon.map((point) => point[1]);
  return [Math.min(...heights), Math.max(...heights)];
}

/** A column's spans: gaps no body fits joined, each at least THINNEST_M thick, what is stepped over left out, and an
 *  underside too low to crouch under taken down to the floor. */
function spansOf(reached: Span[], floor: number): Span[] {
  const joined: Span[] = [];
  for (const span of [...reached].sort((a, b) => a[0] - b[0])) {
    const last = joined[joined.length - 1];
    if (last && span[0] - last[1] < CROUCHED_M) last[1] = Math.max(last[1], span[1]);
    else joined.push([span[0], span[1]]);
  }
  return joined
    .filter(([, top]) => top - floor >= STEPPED_OVER_M)
    .map(([bottom, top]): Span => {
      const thick = Math.min(bottom, top - THINNEST_M);
      return [thick - floor < CROUCHED_M ? floor : thick, top];
    });
}

/** To the centimetre, down and up, but for a single float's last hair over a centimetre's edge. */
const centimetresDown = (value: number): number => Math.floor(value * 100 + 1e-4) / 100;
const centimetresUp = (value: number): number => Math.ceil(value * 100 - 1e-4) / 100;

/** The parts a model's mesh fills over its box (`min` to `max`, its floor `min`'s y) and wherever its mesh reaches
 *  past it, to the centimetre, grown out so none shrinks. */
export function partsOf(model: ForgedModel, box: { readonly min: Point; readonly max: Point }): PropPart[] {
  const [min, max] = [[...box.min], [...box.max]];
  for (let vertex = 0; vertex < model.positions.length; vertex += 3)
    for (const axis of [0, 2]) {
      min[axis] = Math.min(min[axis], model.positions[vertex + axis]);
      max[axis] = Math.max(max[axis], model.positions[vertex + axis]);
    }
  const cell = Math.max(max[0] - min[0], max[2] - min[2]) > LARGE_M ? LARGE_PART_CELL_M : PART_CELL_M;
  const [columns, rows] = [0, 2].map((axis) => Math.max(1, Math.ceil((max[axis] - min[axis]) / cell - 1e-9)));
  const [wide, deep] = [(max[0] - min[0]) / columns, (max[2] - min[2]) / rows];
  const reached: Span[][] = Array.from({ length: columns * rows }, () => []);
  const { positions, indices } = model;
  for (let first = 0; first < indices.length; first += 3) {
    const triangle = [0, 1, 2].map((corner) => {
      const vertex = indices[first + corner] * 3;
      return [positions[vertex], positions[vertex + 1], positions[vertex + 2]];
    });
    const [acrossXs, acrossZs] = [0, 2].map((axis) => triangle.map((point) => point[axis]));
    const column0 = Math.max(0, Math.floor((Math.min(...acrossXs) - EDGE_M - min[0]) / wide));
    const column1 = Math.min(columns - 1, Math.floor((Math.max(...acrossXs) + EDGE_M - min[0]) / wide));
    const row0 = Math.max(0, Math.floor((Math.min(...acrossZs) - EDGE_M - min[2]) / deep));
    const row1 = Math.min(rows - 1, Math.floor((Math.max(...acrossZs) + EDGE_M - min[2]) / deep));
    for (let column = column0; column <= column1; column++)
      for (let row = row0; row <= row1; row++) {
        const [fromX, fromZ] = [min[0] + column * wide, min[2] + row * deep];
        const span = reachIn(triangle, fromX, fromX + wide, fromZ, fromZ + deep);
        if (span) reached[column * rows + row].push(span);
      }
  }
  const floor = min[1];
  const spans = filled(
    reached.map((list) => spansOf(list, floor)),
    columns,
    rows,
    floor,
  );
  return joined(spans, columns, rows, floor).map(([column0, row0, column1, row1, bottom, top]): PropPart => [
    centimetresDown(min[0] + column0 * wide),
    centimetresDown(bottom),
    centimetresDown(min[2] + row0 * deep),
    centimetresUp(min[0] + (column1 + 1) * wide),
    centimetresUp(top),
    centimetresUp(min[2] + (row1 + 1) * deep),
  ]);
}

/** The columns whose ground no body reaches from outside the piece (walled round, or under a roof walled round)
 *  filled down to the floor, so a closed piece is solid: a body walks in only where a door or a gap lets it. */
function filled(spans: Span[][], columns: number, rows: number, floor: number): Span[][] {
  const open = (cell: number): boolean => !spans[cell].some(([bottom]) => bottom === floor);
  const outside = new Array<boolean>(columns * rows).fill(false);
  const waiting: number[] = [];
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++) {
      const cell = column * rows + row;
      const edge = column === 0 || row === 0 || column === columns - 1 || row === rows - 1;
      if (edge && open(cell)) [outside[cell], waiting.length] = [true, waiting.push(cell)];
    }
  while (waiting.length > 0) {
    const cell = waiting.pop() ?? 0;
    const [column, row] = [Math.floor(cell / rows), cell % rows];
    for (const [next, inside] of [
      [cell - rows, column > 0],
      [cell + rows, column < columns - 1],
      [cell - 1, row > 0],
      [cell + 1, row < rows - 1],
    ] as const)
      if (inside && !outside[next] && open(next)) [outside[next], waiting.length] = [true, waiting.push(next)];
  }
  return spans.map((list, cell) =>
    outside[cell] || list.length === 0 || !open(cell) ? list : [[floor, list[0][1]] as Span, ...list.slice(1)],
  );
}

/** Neighbouring columns' spans joined into boxes of columns (first and last column and row, bottom, top): each seed
 *  grows along z, then along x while a whole row of it matches; spans match whose tops lie within TOP_KEEP_M and
 *  whose undersides are both the floor, or both overhead within UNDERSIDE_KEEP_M. */
function joined(spans: Span[][], columns: number, rows: number, floor: number): number[][] {
  const taken = spans.map((list) => list.map(() => false));
  const matches = (span: Span, seed: Span): boolean =>
    Math.abs(span[1] - seed[1]) <= TOP_KEEP_M &&
    (span[0] === floor) === (seed[0] === floor) &&
    Math.abs(span[0] - seed[0]) <= UNDERSIDE_KEEP_M;
  const free = (column: number, row: number, seed: Span): number =>
    spans[column * rows + row].findIndex((span, index) => !taken[column * rows + row][index] && matches(span, seed));
  const boxes: number[][] = [];
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++)
      spans[column * rows + row].forEach((seed, index) => {
        if (taken[column * rows + row][index]) return;
        taken[column * rows + row][index] = true;
        let [bottom, top, lastRow, lastColumn] = [seed[0], seed[1], row, column];
        const take = (atColumn: number, atRow: number, found: number): void => {
          taken[atColumn * rows + atRow][found] = true;
          const span = spans[atColumn * rows + atRow][found];
          [bottom, top] = [Math.min(bottom, span[0]), Math.max(top, span[1])];
        };
        for (let found = 0; lastRow + 1 < rows && (found = free(column, lastRow + 1, seed)) >= 0;)
          take(column, ++lastRow, found);
        while (lastColumn + 1 < columns) {
          const row0 = row;
          const found = Array.from({ length: lastRow - row0 + 1 }, (unused, step) =>
            free(lastColumn + 1, row0 + step, seed),
          );
          if (found.some((index) => index < 0)) break;
          lastColumn++;
          found.forEach((index, step) => take(lastColumn, row0 + step, index));
        }
        boxes.push([column, row, lastColumn, lastRow, bottom, top]);
      });
  return boxes;
}

/** Every prop's parts the forge builds, by id, but for those whose whole box is their one part. */
export function partsTable(table: PropTable): Map<number, PropPart[]> {
  const found = new Map<number, PropPart[]>();
  for (const key of Object.keys(table)) {
    const id = Number(key);
    const model = propModel(table, id);
    if (!model) continue;
    const { min, max } = table[key];
    const parts = partsOf(model, table[key]);
    const whole = [...min.map(centimetresDown), ...max.map(centimetresUp)];
    if (parts.length === 1 && parts[0].every((value, index) => value === whole[index])) continue;
    found.set(id, parts);
  }
  return found;
}

/** The table as content/forged/parts.json keeps it: a line a prop, in id order. */
export function partsText(parts: Map<number, PropPart[]>): string {
  const lines = [...parts.keys()].sort((a, b) => a - b).map((id) => `  "${id}": ${JSON.stringify(parts.get(id))}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}
