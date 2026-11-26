// Which lights reach which surfaces in a storeyed dungeon: a light lights its own storey, and through what joins two
// storeys (a flight and its landings, open air, the hall under it and the gallery round it) the joined cells of the
// storeys beside its own, never through a slab. A space is a mask: storey k's bit, and from JOINED_SHIFT its joined
// bit where the cell is joined. A light reaches a surface where their masks share a bit; the shader reads the same
// masks from each cell's word (`cellWords`, CELL_JOINED) and each light's (`Light.space`).
import { type DungeonLayout, ROCK, SIDE_STEPS, STAIR, storeysOf, storeyUnder, VOID } from './dungeonLayout.ts';

type Point = readonly [number, number, number];

/** Where a space's joined bits start, past the most storeys a dungeon has. */
export const JOINED_SHIFT = 4;
/** Every bit a space may hold: what a light that reaches everywhere holds, and a point off the grid. */
export const EVERY_SPACE = (1 << (JOINED_SHIFT * 2)) - 1;

/** The cells, by their number in the whole layout, whose space joins the storey's next. */
export function joinedCells(layout: DungeonLayout): Set<number> {
  const plane = layout.columns * layout.rows;
  const joined = new Set<number>();
  const rooms = new Set<number>();
  const take = (cell: number) => {
    const kind = layout.cells[cell] ?? ROCK;
    if (kind === ROCK) return;
    joined.add(cell);
    if (kind >= 0) rooms.add(kind);
  };
  for (let storey = 0; storey < storeysOf(layout); storey++)
    for (let cell = 0; cell < plane; cell++) {
      const index = storey * plane + cell;
      const kind = layout.cells[index];
      if (kind === STAIR) joined.add(index);
      if (kind !== VOID) continue;
      joined.add(index);
      if (storey + 1 < storeysOf(layout)) take(index + plane);
      const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
      for (const [east, south] of SIDE_STEPS) {
        const [next, below] = [column + east, row + south];
        if (next >= 0 && below >= 0 && next < layout.columns && below < layout.rows)
          take(storey * plane + below * layout.columns + next);
      }
    }
  for (const stair of layout.stairs ?? []) {
    joined.add(stair.upper * plane + stair.top);
    joined.add((stair.upper + 1) * plane + stair.bottom);
  }
  layout.cells.forEach((kind, cell) => {
    if (kind >= 0 && rooms.has(kind)) joined.add(cell);
  });
  return joined;
}

/** The storey a point lies on and whether its cell is joined; off the grid, null. */
function placeOf(layout: DungeonLayout, joined: ReadonlySet<number>, [x, y, z]: Point) {
  const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
  if (column < 0 || row < 0 || column >= layout.columns || row >= layout.rows) return null;
  const storey = storeyUnder(layout, z);
  const cell = (storey * layout.rows + row) * layout.columns + column;
  return { storey, joined: joined.has(cell) };
}

/** The space of a surface or a figure at a point: its storey, and its storey's joined bit where its cell is joined. */
export function spaceAt(layout: DungeonLayout, joined: ReadonlySet<number>, point: Point): number {
  const place = placeOf(layout, joined, point);
  if (!place) return EVERY_SPACE;
  return (1 << place.storey) | (place.joined ? 1 << (JOINED_SHIFT + place.storey) : 0);
}

/** The spaces a light at a point reaches: its storey, and from a joined cell the joined cells of its storey and of
 *  the storeys over and under it. */
export function reachOf(layout: DungeonLayout, joined: ReadonlySet<number>, where: Point): number {
  const place = placeOf(layout, joined, where);
  if (!place) return EVERY_SPACE;
  let reach = 1 << place.storey;
  for (let storey = place.storey - 1; place.joined && storey <= place.storey + 1; storey++)
    if (storey >= 0 && storey < JOINED_SHIFT) reach |= 1 << (JOINED_SHIFT + storey);
  return reach;
}

/** The spaces an eye at a point may see lit: its storey's, and from a joined cell the storeys over and under it,
 *  whole, for a room beyond a flight's landing is seen down the flight. */
export function seenFrom(layout: DungeonLayout, joined: ReadonlySet<number>, eye: Point): number {
  const place = placeOf(layout, joined, eye);
  if (!place || place.joined) return EVERY_SPACE;
  return (1 << place.storey) | (1 << (JOINED_SHIFT + place.storey));
}
