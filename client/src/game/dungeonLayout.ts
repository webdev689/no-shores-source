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
 *  its north-west corner, z up from its top storey's floor, every z absolute. `cells`, `ceilings` and `cellLooks`
 *  hold a plane of `columns` by `rows` for each storey, storey by storey. A cell is -2 rock, -1 corridor, -3 a flight's,
 *  -4 open air over the storey under it, or its room's number; a side is 0 east, 1 south, 2 west, 3 north; a torch is
 *  x, y, z and its wall's side; a fixture x, y, z and its kind (`FIXTURE`); a frame is its room's cell, the side its
 *  corridor lies on and its height over its floor; a pillar its corner and its top; a box min x, min y, max x, max y,
 *  bottom and top: the jambs, then the pillars, then the props' solids, then the fixtures', then the landmarks'. */
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
  /** Its storeys, STOREY_M apart downward, each at its floor; none answered is read as one. */
  readonly storeys?: number;
  readonly storeyM?: number;
  readonly floors?: readonly number[];
  /** Each flight: the storey at its head, its four cells head first and its landings, as plane indices. */
  readonly stairs?: readonly Stair[];
  readonly cells: readonly number[];
  /** Each open cell's ceiling over its own floor. */
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
    readonly storey?: number;
  }[];
  readonly end: number;
  readonly wayIn: { readonly cell: number; readonly side: number; readonly room: number };
  readonly arrival: { readonly x: number; readonly y: number; readonly z?: number; readonly bearing: number };
  readonly exitDoor: {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
    readonly width: number;
    readonly height: number;
  };
  /** The return portal on the end room's far wall: its foot's middle on the wall, its width and height, and the side
   *  it stands on. */
  readonly portal: {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
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
  readonly boxes: readonly Box[];
  /** The set pieces its rooms are remembered by (content/dungeon/landmarks.json): each its module, the north-west
   *  corner of its turned footprint (x, y) and its quarter turns clockwise. */
  readonly landmarks: readonly (readonly [string, number, number, number])[];
  /** The landmarks' lights: each x, y, z and its kind, the fixtures' kinds and then 6 spirit, 7 daylight, 8 water and
   *  9 rune. */
  readonly glows: readonly (readonly [number, number, number, number])[];
  /** An Elite Dungeon's encounters, as its room lays them; none in any other dungeon. */
  readonly encounters?: EncounterLayout;
}

/** A solid: min x, min y, max x, max y, bottom and top. */
export type Box = readonly [number, number, number, number, number, number];

/** A flight of stairs (`DungeonLayout.stairs`). */
export interface Stair {
  readonly upper: number;
  readonly cells: readonly number[];
  readonly top: number;
  readonly bottom: number;
}

/** One seal of an Elite Dungeon: its kind (network/encounterMessages.ts `SEAL_KIND`), its room, its pieces (x, y, z:
 *  a Litany's runes in the order they light, a Weighing's plates, an Ascent's seal stone, a Holdfast's relic), its
 *  pads (min x, min y, max x, max y, top and, from a module that stands storeys, bottom), the cells its drowned floor
 *  covers, and its doorways' middles on their floor. */
export interface SealLayout {
  readonly kind: number;
  readonly room: number;
  readonly pieces: readonly Triple[];
  readonly pads: readonly (readonly [number, number, number, number, number, number?])[];
  readonly drowned: readonly number[];
  readonly doors: readonly (readonly [number, number, number?])[];
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
/** A flight's cell, on both its storeys, and open air over the storey under it. */
export const STAIR = -3;
export const VOID = -4;
/** How far each storey stands under the one over it, where a layout names none (m). */
export const STOREY_M = 8;
/** A flight's ceiling over its slope, and the step a body walks up (movement's TUNING.step) (m). */
export const FLIGHT_CEILING_M = 3.2;
const STEP_M = 0.5;
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

/** Whether a cell of a storey (the top one unless named) lies on the grid and is open: anything but rock. */
export function openAt(layout: DungeonLayout, column: number, row: number, storey = 0): boolean {
  const inside = column >= 0 && row >= 0 && column < layout.columns && row < layout.rows;
  return inside && (layout.cells[(storey * layout.rows + row) * layout.columns + column] ?? ROCK) !== ROCK;
}

/** The style a cell wears, its look's; null for rock. */
export function styleAt(layout: DungeonLayout, cell: number): StyleKey | null {
  return layout.looks[layout.cellLooks[cell] ?? -1]?.style ?? null;
}

/** The storeys a layout holds: one where it names none. */
export function storeysOf(layout: DungeonLayout): number {
  return layout.storeys ?? 1;
}

/** A cell's plane index, its number on the top storey; and the storey it lies on. */
export function planeOf(layout: DungeonLayout, cell: number): number {
  return cell % (layout.columns * layout.rows);
}

export function storeyOf(layout: DungeonLayout, cell: number): number {
  return Math.floor(cell / (layout.columns * layout.rows));
}

/** A storey's floor (m): 0 the top's, each next STOREY_M under the one over it. */
export function floorOf(layout: DungeonLayout, storey: number): number {
  return layout.floors?.[storey] ?? 0 - (layout.storeyM ?? STOREY_M) * storey;
}

/** The storey whose floor lies nearest a height. */
export function storeyAt(layout: DungeonLayout, z: number): number {
  const below = Math.floor(-z / (layout.storeyM ?? STOREY_M) + 0.5);
  return Math.min(storeysOf(layout) - 1, Math.max(0, below));
}

/** The storey whose floor lies at or under a height and nearest it: where a thing standing or hung there belongs. A
 *  storey's rooms keep 0.4 m of rock under the floor over them, so nothing of one reaches the next one's floor. */
export function storeyUnder(layout: DungeonLayout, z: number): number {
  const over = Math.ceil(-z / (layout.storeyM ?? STOREY_M) - 1e-6);
  return Math.min(storeysOf(layout) - 1, Math.max(0, over));
}

/** A flight's slope at (x, y), as the rules walk it (crates/dungeon storeys.rs `Stair::slope_at`): its upper storey's
 *  floor at the head's edge, falling to the lower one's at the foot's edge, level past either end. */
export function slopeAt(layout: DungeonLayout, stair: Stair, x: number, y: number): number {
  const [columns, cell, head] = [layout.columns, layout.cell, stair.cells[0] ?? 0];
  const [headColumn, headRow] = [head % columns, Math.floor(head / columns)];
  const across = headRow === Math.floor(stair.top / columns);
  const going = across ? headColumn > stair.top % columns : headRow > Math.floor(stair.top / columns);
  const [coordinate, index] = across ? [x, headColumn] : [y, headRow];
  const count = stair.cells.length;
  const [start, end] = going
    ? [index * cell, (index + count) * cell]
    : [(index + 1) * cell, (index + 1 - Math.min(count, index + 1)) * cell];
  const share = Math.min(1, Math.max(0, (coordinate - start) / (end - start)));
  const [upper, lower] = [floorOf(layout, stair.upper), floorOf(layout, stair.upper + 1)];
  return upper + (lower - upper) * share;
}

/** An open span of a column: its floor (a flight's lowest in the column) and its ceiling, absolute, and its flight. */
export interface Span {
  readonly storey: number;
  readonly floor: number;
  readonly ceiling: number;
  readonly stair: Stair | null;
}

/** The open spans of a column, lowest first, as the rules hold them (crates/dungeon storeys.rs `spans`): each
 *  storey's open cell from its floor to its ceiling, a flight's one span over its slope, and a Void lifting the span
 *  under it to its own ceiling. Rock and the grid's outside give none. */
export function spansAt(layout: DungeonLayout, column: number, row: number): Span[] {
  const spans: Span[] = [];
  if (column < 0 || row < 0 || column >= layout.columns || row >= layout.rows) return spans;
  const [west, north] = [column * layout.cell, row * layout.cell];
  for (let storey = storeysOf(layout) - 1; storey >= 0; storey--) {
    const cell = (storey * layout.rows + row) * layout.columns + column;
    const [kind, floor, ceiling] = [layout.cells[cell] ?? ROCK, floorOf(layout, storey), layout.ceilings[cell] ?? 0];
    if (kind === STAIR) {
      const stair = (layout.stairs ?? []).find(
        (each) => each.upper === storey && each.cells.includes(cell % (layout.columns * layout.rows)),
      );
      if (!stair) continue;
      const [one, other] = [
        slopeAt(layout, stair, west, north),
        slopeAt(layout, stair, west + layout.cell, north + layout.cell),
      ];
      spans.push({ storey, floor: Math.min(one, other), ceiling: Math.max(one, other) + FLIGHT_CEILING_M, stair });
    } else if (kind === VOID) {
      // Only over the storey just under it: a Void over rock opens nothing.
      const under = spans.at(-1);
      if (under && under.storey === storey + 1) spans[spans.length - 1] = { ...under, ceiling: floor + ceiling };
    } else if (kind !== ROCK) spans.push({ storey, floor, ceiling: floor + ceiling, stair: null });
  }
  return spans;
}

/** The ground under feet at `z` at a point: the highest floor or flight's slope at or below a step over them; null
 *  over rock or off the grid. */
export function groundAt(layout: DungeonLayout, x: number, y: number, z: number): number | null {
  const spans = spansAt(layout, Math.floor(x / layout.cell), Math.floor(y / layout.cell));
  const floors = spans.map((span) => (span.stair ? slopeAt(layout, span.stair, x, y) : span.floor));
  const under = floors.filter((floor) => floor <= z + STEP_M);
  return under.length > 0 ? Math.max(...under) : null;
}

/** The ceiling over feet at `z` at a point (m, absolute): the ceiling of the span they stand in, over a flight its
 *  sloped ceiling there, so the camera keeps under it; null over rock or off the grid. */
export function ceilingAt(layout: DungeonLayout, x: number, y: number, z = 0): number | null {
  const spans = spansAt(layout, Math.floor(x / layout.cell), Math.floor(y / layout.cell));
  const span = spans.filter((each) => each.floor <= z + STEP_M).at(-1);
  if (!span) return null;
  return span.stair ? slopeAt(layout, span.stair, x, y) + FLIGHT_CEILING_M : span.ceiling;
}

/** A dungeon's ground and ceiling as the player feels them, the camera's line among them: at a point, from the height
 *  `z` stands at there (the feet's where unsaid), never under the feet's own (`feet`), so a line behind a body on a
 *  flight meets the treads and the sloped ceiling over it, and one under the floor never the storey under. */
export function feltAt(layout: DungeonLayout, feet: () => number) {
  const from = (z: number | undefined) => Math.max(z ?? feet(), feet());
  return {
    ground: (x: number, y: number, z?: number) => groundAt(layout, x, y, from(z)),
    roof: (x: number, y: number, z?: number) => ceilingAt(layout, x, y, from(z)),
  };
}

/** The doorways' jambs, the pillars and the solids, and an Elite Dungeon's Ascents' pads, as blocks, each standing on
 *  its own floor. */
export function courseOf(layout: DungeonLayout): Block[] {
  const pads = (layout.encounters?.seals ?? []).flatMap((seal) => seal.pads);
  const solids = layout.boxes.map(([minX, minY, maxX, maxY, bottom, top]) => ({ minX, minY, maxX, maxY, top, bottom }));
  return [
    ...solids,
    ...pads.map(([minX, minY, maxX, maxY, top, bottom = 0]) => ({ minX, minY, maxX, maxY, top, bottom })),
  ];
}

/** The course, every cell of rock beside an open one on its storey (on the top storey standing over the ceilings,
 *  on any other up to the floor over it), and the slabs between storeys: what the camera keeps short of and the shots
 *  stop on. */
export function seenBlocks(layout: DungeonLayout): Block[] {
  const blocks = courseOf(layout);
  for (let storey = 0; storey < storeysOf(layout); storey++) {
    const bottom = floorOf(layout, storey);
    const top = storey === 0 ? ROCK_TOP_M : floorOf(layout, storey - 1);
    for (let row = -1; row <= layout.rows; row++)
      for (let column = -1; column <= layout.columns; column++) {
        if (openAt(layout, column, row, storey)) continue;
        const besideOpen = SIDE_STEPS.some(([east, south]) => openAt(layout, column + east, row + south, storey));
        if (!besideOpen) continue;
        const [minX, minY] = [column * layout.cell, row * layout.cell];
        blocks.push({ minX, minY, maxX: minX + layout.cell, maxY: minY + layout.cell, top, bottom });
      }
  }
  // One storey has no slab.
  for (let row = 0; row < (storeysOf(layout) > 1 ? layout.rows : 0); row++)
    for (let column = 0; column < layout.columns; column++) {
      const spans = spansAt(layout, column, row);
      const [minX, minY] = [column * layout.cell, row * layout.cell];
      for (let upper = 1; upper < spans.length; upper++) {
        const [under, over] = [spans[upper - 1]!, spans[upper]!];
        blocks.push({
          minX,
          minY,
          maxX: minX + layout.cell,
          maxY: minY + layout.cell,
          top: over.floor,
          bottom: under.ceiling,
        });
      }
    }
  return blocks;
}
