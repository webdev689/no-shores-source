// A patrol's dungeon as the page reads it: room-wasm's `room_dungeon` answer, and what the movement rules and the
// camera stand on in it.
import { startRoomDoor } from '../../../server/roomDoor.ts';
import type { Block } from '../rules/movementRules.ts';

type Triple = readonly [number, number, number];

/** A patrol's dungeon as `room_dungeon` answers it (crates/room-wasm/src/dungeon_door.rs): x east and y south from
 *  its north-west corner, z up from its floor. A cell is -2 rock, -1 corridor or its room's number; a side is 0 east,
 *  1 south, 2 west, 3 north; a torch is x, y, z and its wall's side; a frame is its room's cell, the side its
 *  corridor lies on and its height; a pillar its corner and its height; a box min x, min y, max x, max y and top: the jambs, then the pillars, then
 *  the props' solids. */
export interface DungeonLayout {
  readonly name: string;
  readonly pictures: readonly [number, number];
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly number[];
  readonly ceilings: readonly number[];
  readonly rooms: readonly { readonly x: number; readonly y: number; readonly width: number; readonly depth: number }[];
  readonly end: number;
  readonly wayIn: { readonly cell: number; readonly side: number; readonly room: number };
  readonly arrival: { readonly x: number; readonly y: number; readonly bearing: number };
  readonly exitDoor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** The return portal on the end room's far wall: its foot's middle on the wall, its width and height, and the side
   *  it stands on. */
  readonly portal: {
    readonly x: number;
    readonly y: number;
    readonly side: number;
    readonly width: number;
    readonly height: number;
  };
  readonly torches: readonly (readonly [number, number, number, number])[];
  readonly torchReach: number;
  readonly frames: readonly Triple[];
  readonly doorway: { readonly half: number; readonly jambDepth: number; readonly lintel: number };
  readonly pillars: readonly Triple[];
  readonly pillarHalf: number;
  /** The forged props standing in it: each its model, where its origin stands (x, y, z) and its yaw. */
  readonly props: readonly (readonly [number, number, number, number, number])[];
  readonly boxes: readonly (readonly [number, number, number, number, number])[];
}

export const ROCK = -2;
export const CORRIDOR = -1;
/** Each side's step, x east and y south, by the side's number. */
export const SIDE_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
/** How high the rock beside the open cells stands for the camera and the shots: over any ceiling. */
const ROCK_TOP_M = 12;

/** Each room module's door, kept, and the dungeons it has laid: the prompt names a dungeon before the trip lays it,
 *  and a patrol has three, so each is laid once. */
const doors = new WeakMap<WebAssembly.Module, ReturnType<typeof startRoomDoor>>();
const laid = new Map<string, DungeonLayout>();

/** The dungeon `number` of the patrol `patrol` (its id) named `name`, laid by the room module's own rules; an ask it
 *  does not answer throws. */
export function askDungeon(module: WebAssembly.Module, patrol: string, name: string, number: number): DungeonLayout {
  const key = `${patrol}\n${name}\n${number}`;
  const known = laid.get(key);
  if (known) return known;
  const door = doors.get(module) ?? startRoomDoor(module);
  doors.set(module, door);
  const layout = JSON.parse(door.dungeon(patrol, name, number)) as DungeonLayout | null;
  if (!layout) throw new Error(`${patrol} has no dungeon ${number}`);
  laid.set(key, layout);
  return layout;
}

/** Whether a cell lies on the grid and is open: a room's or a corridor. */
export function openAt(layout: DungeonLayout, column: number, row: number): boolean {
  const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
  return inside && (layout.cells[row * layout.columns + column] ?? ROCK) !== ROCK;
}

/** The ceiling over a point (m): its cell's, null over rock or off the grid. */
export function ceilingAt(layout: DungeonLayout, x: number, y: number): number | null {
  const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
  return openAt(layout, column, row) ? (layout.ceilings[row * layout.columns + column] ?? null) : null;
}

/** The doorways' jambs and the pillars, as blocks. */
export function courseOf(layout: DungeonLayout): Block[] {
  return layout.boxes.map(([minX, minY, maxX, maxY, top]) => ({ minX, minY, maxX, maxY, top }));
}

/** The course and every cell of rock beside an open one, standing over the ceilings: what the camera keeps short of
 *  and the shots stop on. */
export function seenBlocks(layout: DungeonLayout): Block[] {
  const blocks = courseOf(layout);
  for (let row = -1; row <= layout.rows; row++)
    for (let column = -1; column <= layout.columns; column++) {
      if (openAt(layout, column, row)) continue;
      const besideOpen = SIDE_STEPS.some(([east, south]) => openAt(layout, column + east, row + south));
      if (!besideOpen) continue;
      const [minX, minY] = [column * layout.cell, row * layout.cell];
      blocks.push({ minX, minY, maxX: minX + layout.cell, maxY: minY + layout.cell, top: ROCK_TOP_M });
    }
  return blocks;
}
