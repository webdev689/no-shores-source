// The dungeon map's reader of a layout's storeys: how many, each one's floor, its flights, and what each cell of each
// storey is. A layout without storeys is one storey at 0 m with no flights. Cells are storey-major: storey k's plane
// follows storey k - 1's.
import { CORRIDOR, type DungeonLayout, floorOf, ROCK, type Stair, STOREY_M, storeysOf } from '../dungeonLayout.ts';

/** A layout's storeys as the map reads them: their count, each floor's height (m, storey 0 the top), the cells in a
 *  storey's plane, the flights and how far apart the storeys stand. */
export interface Storeys {
  readonly count: number;
  readonly floors: readonly number[];
  readonly plane: number;
  readonly stairs: readonly Stair[];
  readonly storeyM: number;
}

/** What a cell of a storey is to the map: rock, open floor (a room's or a corridor's), a flight's, or open air over the
 *  storey under it. */
export type CellKind = 'rock' | 'open' | 'stair' | 'void';

/** The storeys of `layout`, as the map reads them. */
export function readStoreys(layout: DungeonLayout): Storeys {
  const count = storeysOf(layout);
  const floors = [...Array(count).keys()].map((storey) => floorOf(layout, storey));
  const storeyM = layout.storeyM ?? STOREY_M;
  return { count, floors, plane: layout.columns * layout.rows, stairs: layout.stairs ?? [], storeyM };
}

/** The storey-major index of a cell. */
export const cellIndex = (layout: DungeonLayout, storey: number, column: number, row: number): number =>
  storey * layout.columns * layout.rows + row * layout.columns + column;

/** The flight a cell of a storey belongs to, and its place along it (0 at the head), or null. */
function stairAt(storeys: Storeys, storey: number, cell: number): { stair: Stair; place: number } | null {
  for (const stair of storeys.stairs) {
    const place = stair.cells.indexOf(cell);
    if (place >= 0 && (storey === stair.upper || storey === stair.upper + 1)) return { stair, place };
  }
  return null;
}

/** What the cell at `column`, `row` of `storey` is; off the grid, or on a storey the layout lacks, rock. A flight's
 *  cells are named by `stairs`; any other code but a room's, a corridor's and rock is open air. */
export function kindAt(layout: DungeonLayout, storeys: Storeys, storey: number, column: number, row: number): CellKind {
  const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
  if (!inside || storey < 0 || storey >= storeys.count) return 'rock';
  const cell = row * layout.columns + column;
  if (stairAt(storeys, storey, cell)) return 'stair';
  const code = layout.cells[storey * storeys.plane + cell] ?? ROCK;
  if (code === ROCK) return 'rock';
  return code >= CORRIDOR ? 'open' : 'void';
}

/** The floor a body stands on at the middle of a cell of `storey` (m): its storey's floor, or a flight's ramp there;
 *  null over rock and open air. */
export function floorAt(
  layout: DungeonLayout,
  storeys: Storeys,
  storey: number,
  column: number,
  row: number,
): number | null {
  const kind = kindAt(layout, storeys, storey, column, row);
  if (kind === 'open') return storeys.floors[storey] ?? null;
  if (kind !== 'stair') return null;
  const flight = stairAt(storeys, storey, row * layout.columns + column);
  if (!flight) return null;
  const top = storeys.floors[flight.stair.upper] ?? 0;
  const drop = (flight.place + 0.5) / flight.stair.cells.length;
  return top - drop * storeys.storeyM;
}

/** The storey a body with its feet at `feet` stands on: of the storeys with a floor (a room's, a corridor's or a
 *  flight's) in the cell under the feet, the highest under them by less than half a storey, so a flight's upper half
 *  is the storey over's and its lower half the one under's, and a jump under open air stays on the floor it left.
 *  Over no such floor, the highest storey under the feet by that much; else the lowest. */
export function storeyOfFeet(layout: DungeonLayout, storeys: Storeys, feet: readonly [number, number, number]): number {
  const [column, row] = [Math.floor(feet[0] / layout.cell), Math.floor(feet[1] / layout.cell)];
  let [onFloor, byHeight] = [-1, storeys.count - 1];
  for (let storey = storeys.count - 1; storey >= 0; storey--) {
    if ((storeys.floors[storey] ?? 0) > feet[2] + storeys.storeyM / 2) continue;
    byHeight = storey;
    const kind = kindAt(layout, storeys, storey, column, row);
    if (kind === 'open' || kind === 'stair') onFloor = storey;
  }
  return onFloor >= 0 ? onFloor : byHeight;
}
