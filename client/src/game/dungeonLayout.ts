// A dungeon as the page reads it: room-wasm's `room_dungeon` answer, and what the movement rules and the camera stand
// on in it.
import { startRoomDoor } from '../../../server/roomDoor.ts';
import type { Block } from '../rules/movementRules.ts';

type Triple = readonly [number, number, number];

/** A dungeon style's key: the Forge's crypt, hall, cells and temple, and its cave and mine. */
export type StyleKey = 'crypt' | 'halls' | 'cells' | 'sanctum' | 'caverns' | 'mines';

/** What a room's ceiling is drawn as: flat, a barrel vault along its longer side, a dome, or rough rock. */
export type CeilingForm = 'flat' | 'vault' | 'dome' | 'cave';

/** A light that is not a wall's torch, by its kind's number: what it is drawn as and how it lights. */
export const FIXTURE = { brazier: 0, candles: 1, crystals: 2, lantern: 3, hearth: 4, fungus: 5 } as const;

/** A patrol's dungeon as `room_dungeon` answers it (crates/room-wasm/src/dungeon_door.rs): x east and y south from
 *  its north-west corner, z up from its floor. A cell is -2 rock, -1 corridor or its room's number; a side is 0 east,
 *  1 south, 2 west, 3 north; a torch is x, y, z and its wall's side; a fixture x, y, z and its kind (`FIXTURE`); a
 *  frame is its room's cell, the side its corridor lies on and its height; a pillar its corner and its height; a box
 *  min x, min y, max x, max y and top: the jambs, then the pillars, then the props' solids, then the fixtures', then
 *  the landmarks'. */
export interface DungeonLayout {
  readonly name: string;
  /** The first block's style, which names the dungeon. */
  readonly style: StyleKey;
  /** The first look's two picture sets. */
  readonly pictures: readonly [number, number];
  /** Each look a part of the dungeon wears: its style and its two picture sets, the first block's look first. */
  readonly looks: readonly { readonly style: StyleKey; readonly pictures: readonly [number, number] }[];
  /** Each cell's look, by its number among `looks`; -1 for rock. */
  readonly cellLooks: readonly number[];
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly number[];
  readonly ceilings: readonly number[];
  /** Each room's rectangle, its ceiling's height and its walk from the way in, its purpose and its name, how its
   *  ceiling is drawn and its look. */
  readonly rooms: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly depth: number;
    readonly height: number;
    readonly walk: number;
    readonly role: string;
    readonly name: string;
    readonly ceiling: CeilingForm;
    readonly look: number;
  }[];
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
  readonly fixtures: readonly (readonly [number, number, number, number])[];
  readonly frames: readonly Triple[];
  readonly doorway: { readonly half: number; readonly jambDepth: number; readonly lintel: number };
  readonly pillars: readonly Triple[];
  readonly pillarHalf: number;
  /** The forged props standing in it: each its model, where its origin stands (x, y, z) and its yaw. A piece hung on a
   *  wall has no solid among the boxes. */
  readonly props: readonly (readonly [number, number, number, number, number])[];
  readonly boxes: readonly (readonly [number, number, number, number, number])[];
  /** The set pieces its rooms are remembered by (content/dungeon/landmarks.json): each its module, the north-west
   *  corner of its turned footprint (x, y) and its quarter turns clockwise. */
  readonly landmarks: readonly (readonly [string, number, number, number])[];
  /** The landmarks' lights: each x, y, z and its kind, the fixtures' kinds and then 6 spirit, 7 daylight, 8 water and
   *  9 rune. */
  readonly glows: readonly (readonly [number, number, number, number])[];
  /** An Elite Dungeon's encounters, as its room lays them; none in any other dungeon. */
  readonly encounters?: EncounterLayout;
}

/** One seal of an Elite Dungeon: its kind (network/encounterMessages.ts `SEAL_KIND`), its room, its pieces (x, y, z:
 *  a Litany's runes in the order they light, a Weighing's plates, an Ascent's seal stone, a Holdfast's relic), its
 *  pads (min x, min y, max x, max y, top), the cells its drowned floor covers, and its doorways' middles. */
export interface SealLayout {
  readonly kind: number;
  readonly room: number;
  readonly pieces: readonly Triple[];
  readonly pads: readonly (readonly [number, number, number, number, number])[];
  readonly drowned: readonly number[];
  readonly doors: readonly (readonly [number, number])[];
}

/** An Elite Dungeon's encounters as `room_dungeon` answers them: its seals in walk order, the Court's anchors, and
 *  how near a piece's middle a player stands on it, and how far round the warded Boss its slam reaches (m), as the
 *  room judges. */
export interface EncounterLayout {
  readonly seals: readonly SealLayout[];
  readonly anchors: readonly Triple[];
  readonly reach: {
    readonly rune: number;
    readonly plate: number;
    readonly relic: number;
    readonly anchor: number;
    readonly light: number;
    readonly slam: number;
  };
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
 *  and a patrol has three, so each is laid once by each module, whose rules may lay it otherwise. */
const doors = new WeakMap<WebAssembly.Module, ReturnType<typeof startRoomDoor>>();
const laidBy = new WeakMap<WebAssembly.Module, Map<string, DungeonLayout>>();

/** The dungeons a room module has laid, by their ask. */
function laidOf(module: WebAssembly.Module): Map<string, DungeonLayout> {
  const laid = laidBy.get(module) ?? new Map<string, DungeonLayout>();
  laidBy.set(module, laid);
  return laid;
}

/** Which dungeon, as the room module's `room_dungeon` and `fighter_dungeon` read it: a patrol's by its number, an
 *  Elite Dungeon by its place, or one laid by a seed and a style (a sea island's); each with its place's name. */
export type DungeonAsk =
  | { readonly patrol: string; readonly name: string; readonly number: number }
  | { readonly place: string; readonly name: string }
  | { readonly seed: number; readonly style: StyleKey; readonly name: string };

/** The dungeon an ask names, laid by the room module's own rules; an ask it does not answer throws. */
export function askLayout(module: WebAssembly.Module, ask: DungeonAsk): DungeonLayout {
  const key = JSON.stringify(ask);
  const laid = laidOf(module);
  const known = laid.get(key);
  if (known) return known;
  const door = doors.get(module) ?? startRoomDoor(module);
  doors.set(module, door);
  const layout = readDungeon(door.layout(key));
  if (!layout) throw new Error(`no dungeon is laid for ${key}`);
  laid.set(key, layout);
  return layout;
}

/** A dungeon laid by `seed` and the style keyed `style` where no patrol lays it (a sea island's), named for its place
 *  `name`, by the room module's own rules; a style that is none throws. */
export function askDungeonOf(module: WebAssembly.Module, seed: number, style: StyleKey, name: string): DungeonLayout {
  return askLayout(module, { seed: seed >>> 0, style, name });
}

/** The dungeon `number` of the patrol `patrol` (its id) named `name`, laid by the room module's own rules; an ask it
 *  does not answer throws. */
export function askDungeon(module: WebAssembly.Module, patrol: string, name: string, number: number): DungeonLayout {
  return askLayout(module, { patrol, name, number });
}

/** A dungeon as the room module answers it, null for none. A module older than the landmarks answers none of them
 *  or their glows, and a page newer than it reads that as none of each. */
export function readDungeon(answer: string): DungeonLayout | null {
  const read = JSON.parse(answer) as
    (Omit<DungeonLayout, 'landmarks' | 'glows'> & Partial<Pick<DungeonLayout, 'landmarks' | 'glows'>>) | null;
  return read && { ...read, landmarks: read.landmarks ?? [], glows: read.glows ?? [] };
}

/** Whether a cell lies on the grid and is open: a room's or a corridor. */
export function openAt(layout: DungeonLayout, column: number, row: number): boolean {
  const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
  return inside && (layout.cells[row * layout.columns + column] ?? ROCK) !== ROCK;
}

/** The style a cell wears, its look's; null for rock. */
export function styleAt(layout: DungeonLayout, cell: number): StyleKey | null {
  return layout.looks[layout.cellLooks[cell] ?? -1]?.style ?? null;
}

/** The ceiling over a point (m): its cell's, null over rock or off the grid. */
export function ceilingAt(layout: DungeonLayout, x: number, y: number): number | null {
  const [column, row] = [Math.floor(x / layout.cell), Math.floor(y / layout.cell)];
  return openAt(layout, column, row) ? (layout.ceilings[row * layout.columns + column] ?? null) : null;
}

/** The doorways' jambs, the pillars and the solids, and an Elite Dungeon's Ascents' pads, as blocks, each standing on
 *  the dungeon's one floor at 0 m. */
export function courseOf(layout: DungeonLayout): Block[] {
  const pads = (layout.encounters?.seals ?? []).flatMap((seal) => seal.pads);
  return [...layout.boxes, ...pads].map(([minX, minY, maxX, maxY, top]) => ({
    minX,
    minY,
    maxX,
    maxY,
    top,
    bottom: 0,
  }));
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
      blocks.push({ minX, minY, maxX: minX + layout.cell, maxY: minY + layout.cell, top: ROCK_TOP_M, bottom: 0 });
    }
  return blocks;
}
