// Which lights reach which surfaces in a storeyed dungeon: a light lights its own storey, and the storey beside it
// only inside what joins the two, never through a slab. A join is a flight (its cells on both storeys and its two
// landings) or a run of open air (its cells and the hall's cells under them). A space is a mask: storey k's bit, and
// from STOREY_BITS each join's own bit, on the join's cells alone. A surface's space is its storey's bit and its
// cell's joins; a light reaches its storey and every join of its storey within its reach; an eye may see lit its
// storey and, near a join, the storey beside it. The shader reads the same masks from each cell's word (`cellWords`)
// and each light's (`Light.space`).
import { type DungeonLayout, ROCK, SIDE_STEPS, STAIR, storeysOf, storeyUnder, VOID } from './dungeonLayout.ts';

type Point = readonly [number, number, number];

/** The storeys' bits, one each (a dungeon has five at most), and the joins' bits after them, reused past the last. */
export const STOREY_BITS = 5;
export const JOIN_BITS = 23;
/** Every bit a space may hold: a point off the grid's. */
export const EVERY_SPACE = 2 ** (STOREY_BITS + JOIN_BITS) - 1;
/** How near a join an eye stands to see the storey beside its own through it (m): down a flight's whole length. */
const SEEN_M = 16;

/** A join: its bit, its two storeys, and its cells' middles on the plane. */
interface Join {
  readonly bit: number;
  readonly storeys: readonly [number, number];
  readonly middles: readonly (readonly [number, number])[];
}

/** A layout's joins, and each joined cell's joins' bits, by its number in the whole layout. */
export interface Spaces {
  readonly joins: readonly Join[];
  readonly cells: ReadonlyMap<number, number>;
}

/** The joins of a layout: each flight, and each run of open air side by side on its storey. */
export function spacesOf(layout: DungeonLayout): Spaces {
  const { columns, rows, cell: size } = layout;
  const plane = columns * rows;
  const joins: Join[] = [];
  const cells = new Map<number, number>();
  const join = (storey: number, members: readonly number[]) => {
    const bit = 2 ** (STOREY_BITS + (joins.length % JOIN_BITS));
    for (const member of members) cells.set(member, (cells.get(member) ?? 0) | bit);
    const middles = members.map((member) => {
      const flat = member % plane;
      return [((flat % columns) + 0.5) * size, (Math.floor(flat / columns) + 0.5) * size] as const;
    });
    joins.push({ bit, storeys: [storey, storey + 1], middles });
  };
  for (const stair of layout.stairs ?? []) {
    const flight = stair.cells.flatMap((each) => [stair.upper * plane + each, (stair.upper + 1) * plane + each]);
    join(stair.upper, [...flight, stair.upper * plane + stair.top, (stair.upper + 1) * plane + stair.bottom]);
  }
  const seen = new Set<number>();
  for (let storey = 0; storey + 1 < storeysOf(layout); storey++)
    for (let first = 0; first < plane; first++) {
      if (layout.cells[storey * plane + first] !== VOID || seen.has(first + storey * plane)) continue;
      const run: number[] = [];
      const waiting = [first];
      seen.add(first + storey * plane);
      while (waiting.length > 0) {
        const flat = waiting.pop() ?? 0;
        run.push(storey * plane + flat);
        const hall = layout.cells[(storey + 1) * plane + flat] ?? ROCK;
        if (hall !== ROCK && hall !== STAIR && hall !== VOID) run.push((storey + 1) * plane + flat);
        const [column, row] = [flat % columns, Math.floor(flat / columns)];
        for (const [east, south] of SIDE_STEPS) {
          const [next, below] = [column + east, row + south];
          const beside = below * columns + next;
          if (next < 0 || below < 0 || next >= columns || below >= rows || seen.has(beside + storey * plane)) continue;
          if (layout.cells[storey * plane + beside] !== VOID) continue;
          seen.add(beside + storey * plane);
          waiting.push(beside);
        }
      }
      join(storey, run);
    }
  return { joins, cells };
}

/** The storey a point lies on and its cell's number in the whole layout; off the grid, null. */
function placeOf(layout: DungeonLayout, [x, y, z]: Point) {
  const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
  if (column < 0 || row < 0 || column >= layout.columns || row >= layout.rows) return null;
  const storey = storeyUnder(layout, z);
  return { storey, cell: (storey * layout.rows + row) * layout.columns + column };
}

/** The joins of a storey with a cell within `distance` of a point on the plane. */
function joinsNear(spaces: Spaces, storey: number, point: Point, distance: number): Join[] {
  return spaces.joins.filter((join) => joinNear(join, storey, point, distance));
}

/** Whether a join is of a storey and has a cell within `distance` of a point on the plane. */
function joinNear(join: Join, storey: number, [x, y]: Point, distance: number): boolean {
  if (join.storeys[0] !== storey && join.storeys[1] !== storey) return false;
  for (const [east, south] of join.middles) if (Math.hypot(east - x, south - y) <= distance) return true;
  return false;
}

/** The space of a surface or a figure at a point: its storey, and its cell's joins. */
export function spaceAt(layout: DungeonLayout, spaces: Spaces, point: Point): number {
  const place = placeOf(layout, point);
  if (!place) return EVERY_SPACE;
  return 2 ** place.storey + (spaces.cells.get(place.cell) ?? 0);
}

/** The spaces a light at a point reaching `reach` metres lights: its storey, and each join of its storey whose cells
 *  it reaches (a cell's half diagonal past its middle). */
export function reachOf(layout: DungeonLayout, spaces: Spaces, where: Point, reach: number): number {
  const place = placeOf(layout, where);
  if (!place) return EVERY_SPACE;
  const near = joinsNear(spaces, place.storey, where, reach + layout.cell * Math.SQRT1_2);
  return near.reduce((space, join) => space | join.bit, 2 ** place.storey);
}

/** The spaces an eye at a point may see lit: its storey, and within SEEN_M of a join the join and the storey beside
 *  its own through it. */
export function seenFrom(layout: DungeonLayout, spaces: Spaces, eye: Point): number {
  const place = placeOf(layout, eye);
  if (!place) return EVERY_SPACE;
  // Asked every frame: a loop, so it makes no list.
  let seen = 2 ** place.storey;
  for (const join of spaces.joins)
    if (joinNear(join, place.storey, eye, SEEN_M)) seen |= join.bit | (2 ** join.storeys[0]) | (2 ** join.storeys[1]);
  return seen;
}
