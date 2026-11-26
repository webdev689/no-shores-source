// The dungeon map's reader of a layout's storeys: how many, each one's floor, its flights, and what each cell of each
// storey is. A layout from before the storeys (no `storeys` key) is one storey at 0 m with no flights, so the map
// reads today's dungeons and a storeyed one alike. Cells are storey-major: storey k's plane follows storey k - 1's.
import { CORRIDOR, type DungeonLayout, ROCK } from '../dungeonLayout.ts';

/** A flight between storey `upper` and the one under it: its four cells (plane indices, head first) and its landings'
 *  cells, `top` on the upper storey and `bottom` on the lower. */
export interface MapStair {
  readonly upper: number;
  readonly cells: readonly number[];
  readonly top: number;
  readonly bottom: number;
}

/** A layout's storeys as the map reads them: their count, each floor's height (m, storey 0 the top), the cells in a
 *  storey's plane, the flights and how far apart the storeys stand. */
export interface Storeys {
  readonly count: number;
  readonly floors: readonly number[];
  readonly plane: number;
  readonly stairs: readonly MapStair[];
  readonly storeyM: number;
}

/** What a cell of a storey is to the map: rock, open floor (a room's or a corridor's), a flight's, or open air over the
 *  storey under it. */
export type CellKind = 'rock' | 'open' | 'stair' | 'void';

/** The keys a storeyed layout adds, each missing from a layout laid before the storeys. */
type StoreyKeys = {
  readonly storeys?: number;
  readonly storeyM?: number;
  readonly floors?: readonly number[];
  readonly stairs?: readonly MapStair[];
};

/** How far apart the storeys stand where the layout does not say (m). */
const STOREY_M = 8;
/** How high a body steps up (m): it stands on the highest floor within this of its feet. */
const STEP_M = 0.5;

/** The storeys of `layout`. */
export function storeysOf(layout: DungeonLayout): Storeys {
  const keys = layout as DungeonLayout & StoreyKeys;
  const count = Math.max(1, keys.storeys ?? 1);
  const storeyM = keys.storeyM ?? STOREY_M;
  const floors = keys.floors ?? [...Array(count).keys()].map((storey) => 0 - storey * storeyM);
  return { count, floors, plane: layout.columns * layout.rows, stairs: keys.stairs ?? [], storeyM };
}

/** The storey-major index of a cell. */
export const cellIndex = (layout: DungeonLayout, storey: number, column: number, row: number): number =>
  storey * layout.columns * layout.rows + row * layout.columns + column;

/** The flight a cell of a storey belongs to, and its place along it (0 at the head), or null. */
function stairAt(storeys: Storeys, storey: number, cell: number): { stair: MapStair; place: number } | null {
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

/** The storey a body with its feet at `z` stands on: the one with the highest floor within a step under its feet,
 *  else the lowest. */
export function storeyOfHeight(storeys: Storeys, z: number): number {
  let found = storeys.count - 1;
  for (let storey = storeys.count - 1; storey >= 0; storey--)
    if ((storeys.floors[storey] ?? 0) <= z + STEP_M) found = storey;
  return found;
}
