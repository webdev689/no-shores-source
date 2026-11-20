// A dungeon's look, as DFO's Forge builds a floor's mesh (src/world/forge/forgeMesh.js): each open cell's floor and
// ceiling; a wall with a trim band at its foot and head wherever it meets rock or the grid's edge; a wall from a lower
// ceiling up to its own; each doorway's frame, a square pillar at each of a great room's corners, a bracket and a
// flame at each torch, the exit door and the return portal. Points are the dungeon's own: x east, y south, z up from the floor. Each
// face names its picture by Daggerfall's archive and record, a dungeon set's by its role, and every UV runs in world
// metres, one picture to 3.2 m, so faces side by side meet without a seam.
import { type ForgedModel, type MeshBuilder, meshBuilder } from '../models/model.ts';
import { besideOf, caveWall, ceilingHeights, closeEdge, curvedCeiling, isCave } from './dungeonCeilings.ts';
import { CORRIDOR, type DungeonLayout, openAt, SIDE_STEPS, styleAt, type StyleKey } from './dungeonLayout.ts';
import { uvOf } from './dungeonUv.ts';

/** The trim bands' heights at a wall's foot and head. */
export const BASE_M = 0.4;
export const HEAD_M = 0.3;
/** The record each face takes in a dungeon set, by its role. */
export const ROLE = { wall: 0, wallAlt: 1, floor: 2, ceiling: 3, trim: 4 } as const;
/** Archives that stand for no picture of their own: a flame's glow, drawn as a colour; the portal's face, which wears
 *  the end room's wall; candle wax; an ember's, a lantern's glass a crystal's and a fungus cap's glow; and still water,
 *  dark and catching the lights. */
export const COLOUR = {
  glow: -2,
  portal: -3,
  wax: -4,
  ember: -5,
  lanternGlass: -6,
  crystal: -7,
  fungus: -8,
  water: -9,
} as const;
/** The textures' ironwork (archive 93), for the torches' brackets and the cache's bands. */
export const IRON: Picture = [93, 0];
/** The portal's arch, metres: each post's width, the lintel's height, how far both stand off the wall, and how far
 *  off it the face stands, inside them. */
const ARCH = { post: 0.3, lintel: 0.3, proud: 0.18, face: 0.04 };

type Point = readonly [number, number, number];
type Picture = readonly [number, number];

/** A torch's bracket and flame, metres: the plate on the wall, the arm out to the torch, its cup, and the flame. */
const PLATE = { half: 0.06, low: -0.25, high: 0.05, thick: 0.03 };
const ARM = { half: 0.02, low: -0.17, high: -0.13 };
const CUP = { half: 0.06, low: -0.15, high: -0.07 };
const FLAME = { half: 0.06, low: -0.07, waist: -0.01, high: 0.2 };

/** A quad by its corners round its edge, facing `normal`, its UVs by its plane. */
function face(mesh: MeshBuilder, picture: Picture, corners: readonly Point[], normal: Point, top: number): void {
  mesh.quad(picture, corners, normal, corners.map(uvOf(normal, top)));
}

/** A box from `low` to `high`; its sides, and its top and bottom unless left out. */
export function box(mesh: MeshBuilder, picture: Picture, low: Point, high: Point, ends = true): void {
  const [west, north, bottom] = low;
  const [east, south, top] = high;
  const side = (a: Point, b: Point, normal: Point) =>
    face(mesh, picture, [a, b, [b[0], b[1], top], [a[0], a[1], top]], normal, top);
  side([west, north, bottom], [east, north, bottom], [0, -1, 0]);
  side([east, south, bottom], [west, south, bottom], [0, 1, 0]);
  side([west, south, bottom], [west, north, bottom], [-1, 0, 0]);
  side([east, north, bottom], [east, south, bottom], [1, 0, 0]);
  if (!ends) return;
  face(
    mesh,
    picture,
    [
      [west, north, top],
      [east, north, top],
      [east, south, top],
      [west, south, top],
    ],
    [0, 0, 1],
    top,
  );
  face(
    mesh,
    picture,
    [
      [west, north, bottom],
      [east, north, bottom],
      [east, south, bottom],
      [west, south, bottom],
    ],
    [0, 0, -1],
    top,
  );
}

/** The set a room or a corridor wears in a look (the first unless named) and its walls' record: a room whose number
 *  % 3 is 2 takes the look's second set, any other room and every corridor its main one; a room whose number is odd
 *  takes the second wall. */
export function lookOf(layout: DungeonLayout, room: number, look = 0): { set: number; wall: number } {
  const pictures = layout.looks[look]?.pictures ?? layout.pictures;
  if (room === CORRIDOR) return { set: pictures[0], wall: ROLE.wall };
  return { set: pictures[room % 3 === 2 ? 1 : 0], wall: room % 2 === 1 ? ROLE.wallAlt : ROLE.wall };
}

/** The set a cell wears, in its own look. */
export function lookAt(layout: DungeonLayout, cell: number): { set: number; wall: number } {
  return lookOf(layout, layout.cells[cell] ?? CORRIDOR, Math.max(0, layout.cellLooks[cell] ?? 0));
}

/** A wall on a cell's side from `low` up to `high`, facing into the cell, with trim at its foot and its head where
 *  asked; its picture's top meets the cell's ceiling, so a wall's courses line up along a room. */
function wall(
  mesh: MeshBuilder,
  look: { set: number; wall: number },
  where: { column: number; row: number; side: number; cell: number },
  [low, high]: readonly [number, number],
  { foot, head, top }: { foot: boolean; head: boolean; top: number },
): void {
  if (!(high - low > 1e-4)) return;
  const [east, south] = SIDE_STEPS[where.side] ?? [0, 0];
  const half = where.cell / 2;
  const [edgeX, edgeY] = [
    (where.column + 0.5) * where.cell + east * half,
    (where.row + 0.5) * where.cell + south * half,
  ];
  const left = [edgeX - south * half, edgeY + east * half] as const;
  const right = [edgeX + south * half, edgeY - east * half] as const;
  const band = (from: number, to: number, record: number) => {
    if (!(to - from > 1e-4)) return;
    const corners: Point[] = [
      [left[0], left[1], from],
      [right[0], right[1], from],
      [right[0], right[1], to],
      [left[0], left[1], to],
    ];
    face(mesh, [look.set, record], corners, [-east, -south, 0], top);
  };
  const footTop = foot ? Math.min(high, low + BASE_M) : low;
  const headLow = head ? Math.max(footTop, high - HEAD_M) : high;
  if (foot) band(low, footTop, ROLE.trim);
  band(footTop, headLow, look.wall);
  if (head) band(headLow, high, ROLE.trim);
}

/** A square pillar on a corner, floor to `height`, trimmed at its foot and its head. */
function pillar(
  mesh: MeshBuilder,
  look: { set: number; wall: number },
  x: number,
  y: number,
  height: number,
  half: number,
) {
  const bands: [number, number, number][] = [
    [0, BASE_M, ROLE.trim],
    [BASE_M, height - HEAD_M, look.wall],
    [height - HEAD_M, height, ROLE.trim],
  ];
  for (const [low, high, record] of bands)
    box(mesh, [look.set, record], [x - half, y - half, low], [x + half, y + half, high], false);
}

/** A doorway's frame: its jambs exactly the room's two boxes for it, and over the gap between them a lintel from the
 *  lintel's height up to the frame's. */
function doorFrame(
  mesh: MeshBuilder,
  look: { set: number; wall: number },
  jambs: readonly (readonly [number, number, number, number, number])[],
  lintel: number,
  height: number,
): void {
  for (const [minX, minY, maxX, maxY, top] of jambs)
    box(mesh, [look.set, look.wall], [minX, minY, 0], [maxX, maxY, top], false);
  const [first, second] = jambs;
  if (!first || !second || !(height > lintel + 1e-4)) return;
  const acrossX = Math.abs(first[0] - second[0]) > Math.abs(first[1] - second[1]);
  const [a, b] = (acrossX ? first[0] < second[0] : first[1] < second[1]) ? [first, second] : [second, first];
  const low: Point = acrossX ? [a[2], a[1], lintel] : [a[0], a[3], lintel];
  const high: Point = acrossX ? [b[0], a[3], height] : [a[2], b[1], height];
  const picture: Picture = [look.set, ROLE.trim];
  const [west, north] = low;
  const [east, south] = high;
  if (acrossX) {
    face(
      mesh,
      picture,
      [
        [west, north, lintel],
        [east, north, lintel],
        [east, north, height],
        [west, north, height],
      ],
      [0, -1, 0],
      height,
    );
    face(
      mesh,
      picture,
      [
        [west, south, lintel],
        [east, south, lintel],
        [east, south, height],
        [west, south, height],
      ],
      [0, 1, 0],
      height,
    );
  } else {
    face(
      mesh,
      picture,
      [
        [west, north, lintel],
        [west, south, lintel],
        [west, south, height],
        [west, north, height],
      ],
      [-1, 0, 0],
      height,
    );
    face(
      mesh,
      picture,
      [
        [east, north, lintel],
        [east, south, lintel],
        [east, south, height],
        [east, north, height],
      ],
      [1, 0, 0],
      height,
    );
  }
  face(
    mesh,
    picture,
    [
      [west, north, lintel],
      [east, north, lintel],
      [east, south, lintel],
      [west, south, lintel],
    ],
    [0, 0, -1],
    height,
  );
}

/** A torch's iron bracket on its wall, the edge of its cell on its side, unless its style's sconce holds it; and its
 *  flame. */
function torch(
  mesh: MeshBuilder,
  [x, y, z, side]: readonly [number, number, number, number],
  cell: number,
  bracket: boolean,
): void {
  const [east, south] = SIDE_STEPS[side] ?? [0, 0];
  const edge = (along: number, step: number) =>
    step === 0 ? along : (Math.floor(along / cell) + 0.5 + step / 2) * cell;
  const [wallX, wallY] = [edge(x, east), edge(y, south)];
  const iron = IRON;
  const across = (half: number, fromX: number, fromY: number, toX: number, toY: number, low: number, high: number) =>
    box(
      mesh,
      iron,
      [Math.min(fromX, toX) - half * Math.abs(south), Math.min(fromY, toY) - half * Math.abs(east), z + low],
      [Math.max(fromX, toX) + half * Math.abs(south), Math.max(fromY, toY) + half * Math.abs(east), z + high],
    );
  const plate = [wallX - east * PLATE.thick, wallY - south * PLATE.thick] as const;
  if (bracket) {
    across(PLATE.half, plate[0], plate[1], wallX, wallY, PLATE.low, PLATE.high);
    across(ARM.half, x, y, plate[0], plate[1], ARM.low, ARM.high);
    box(mesh, iron, [x - CUP.half, y - CUP.half, z + CUP.low], [x + CUP.half, y + CUP.half, z + CUP.high]);
  }
  const glow: Picture = [COLOUR.glow, 0];
  const ring: Point[] = [
    [x - FLAME.half, y, z + FLAME.waist],
    [x, y - FLAME.half, z + FLAME.waist],
    [x + FLAME.half, y, z + FLAME.waist],
    [x, y + FLAME.half, z + FLAME.waist],
  ];
  const tip: Point = [x, y, z + FLAME.high];
  const foot: Point = [x, y, z + FLAME.low];
  ring.forEach((corner, index) => {
    const next = ring[(index + 1) % ring.length] ?? corner;
    const out: Point = [corner[0] + next[0] - 2 * x, corner[1] + next[1] - 2 * y, 0];
    mesh.tri(
      glow,
      [corner, next, tip],
      [out[0], out[1], 0.3],
      [
        [0, 0],
        [1, 0],
        [0.5, 1],
      ],
    );
    mesh.tri(
      glow,
      [next, corner, foot],
      [out[0], out[1], -0.3],
      [
        [0, 0],
        [1, 0],
        [0.5, 1],
      ],
    );
  });
}

/** A door's opening on its wall: its foot's middle, its width and height, and the side of its cell it stands on. */
type Opening = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** A quad over an opening on its wall, facing into its cell, wearing `picture` once across it. */
function doorFace(mesh: MeshBuilder, { x, y, width, height }: Opening, side: number, picture: Picture): void {
  const [east, south] = SIDE_STEPS[side] ?? [0, 0];
  // Looking at the door from the room is looking along its side; the viewer's right is a quarter turn clockwise.
  const [rightX, rightY] = [-south * (width / 2), east * (width / 2)];
  const corners: Point[] = [
    [x - rightX, y - rightY, 0],
    [x + rightX, y + rightY, 0],
    [x + rightX, y + rightY, height],
    [x - rightX, y - rightY, height],
  ];
  const mapping = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  mesh.quad(picture, corners, [-east, -south, 0], mapping);
}

/** The return portal: a stone arch, two posts and a lintel standing off the end room's wall in its trim (unless its
 *  style's own arch stands there), round a face the shader shows dark while it is shut and glowing while it is open. */
function portal(mesh: MeshBuilder, layout: DungeonLayout, arch: boolean): void {
  const opening = layout.portal;
  const [east, south] = SIDE_STEPS[opening.side] ?? [0, 0];
  const trim: Picture = [lookOf(layout, layout.end, layout.rooms[layout.end]?.look ?? 0).set, ROLE.trim];
  const [acrossX, acrossY] = [Math.abs(south), Math.abs(east)];
  // A piece of the arch: from `from` to `to` along the wall from the opening's middle, off the wall by ARCH.proud.
  const piece = (from: number, to: number, low: number, high: number) => {
    const ends = [from, to].map((along) => [opening.x + acrossX * along, opening.y + acrossY * along]);
    const off = [opening.x - east * ARCH.proud, opening.y - south * ARCH.proud];
    const eastings = [...ends.map(([x]) => x ?? 0), off[0] ?? 0];
    const southings = [...ends.map(([, y]) => y ?? 0), off[1] ?? 0];
    box(
      mesh,
      trim,
      [Math.min(...eastings), Math.min(...southings), low],
      [Math.max(...eastings), Math.max(...southings), high],
    );
  };
  const half = opening.width / 2;
  if (arch) {
    piece(-half - ARCH.post, -half, 0, opening.height + ARCH.lintel);
    piece(half, half + ARCH.post, 0, opening.height + ARCH.lintel);
    piece(-half, half, opening.height, opening.height + ARCH.lintel);
  }
  const face = { ...opening, x: opening.x - east * ARCH.face, y: opening.y - south * ARCH.face };
  doorFace(mesh, face, opening.side, [COLOUR.portal, 0]);
}

/** What a dungeon's kits draw in the mesh's place: the styles whose pillars, brackets and portal arch they stand
 *  instead, and the cells whose floor a landmark lays itself. */
export type Kitted = { readonly styles: ReadonlySet<StyleKey>; readonly floorless: ReadonlySet<number> };
const UNKITTED: Kitted = { styles: new Set(), floorless: new Set() };

/** The whole floor's mesh, the exit door wearing `door`, and the return portal; `furnish` lays what stands in it,
 *  and `kitted` says what it draws instead of the mesh. */
export function dungeonMesh(
  layout: DungeonLayout,
  door: Picture,
  furnish: (mesh: MeshBuilder) => void = () => undefined,
  kitted: Kitted = UNKITTED,
): ForgedModel {
  const mesh = meshBuilder();
  const { cell, columns, rows, cells, ceilings } = layout;
  const heightOf = ceilingHeights(layout);
  // A cell whose ceiling is not flat over it: a vaulted or domed room's, or a cave's.
  const curved = (index: number) => {
    const room = cells[index] ?? CORRIDOR;
    const form = room >= 0 ? layout.rooms[room]?.ceiling : undefined;
    return form === 'vault' || form === 'dome' || isCave(layout, index);
  };
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      if (!openAt(layout, column, row)) continue;
      const look = lookAt(layout, index);
      const ceiling = ceilings[index] ?? 0;
      const height = heightOf(index);
      const [west, north] = [column * cell, row * cell];
      const square = (z: number): Point[] => [
        [west, north, z],
        [west + cell, north, z],
        [west + cell, north + cell, z],
        [west, north + cell, z],
      ];
      if (!kitted.floorless.has(index)) face(mesh, [look.set, ROLE.floor], square(0), [0, 0, 1], 0);
      if (curved(index)) curvedCeiling(mesh, [look.set, ROLE.ceiling], west, north, cell, height);
      else face(mesh, [look.set, ROLE.ceiling], square(ceiling), [0, 0, -1], ceiling);
      SIDE_STEPS.forEach(([east, south], side) => {
        const where = { column, row, side, cell };
        const trims = { foot: true, head: true, top: ceiling };
        const half = cell / 2;
        const [edgeX, edgeY] = [(column + 0.5) * cell + east * half, (row + 0.5) * cell + south * half];
        const edge = {
          from: [edgeX - south * half, edgeY + east * half] as const,
          to: [edgeX + south * half, edgeY - east * half] as const,
          facing: [-east, -south, 0] as const,
        };
        const next = besideOf(layout, column, row, side);
        if (next === null) {
          if (isCave(layout, index)) caveWall(mesh, [look.set, look.wall], where, ceiling);
          else wall(mesh, look, where, [0, ceiling], trims);
          // Over the wall's head, up to a vault, a dome or a cave's rock.
          return closeEdge(mesh, [look.set, look.wall], { ...edge, top: ceiling }, () => ceiling, height);
        }
        if (!curved(index) && !curved(next)) {
          const lower = ceilings[next] ?? ceiling;
          if (lower < ceiling) wall(mesh, look, where, [lower, ceiling], { ...trims, foot: false });
          return;
        }
        closeEdge(mesh, [look.set, look.wall], { ...edge, top: ceiling }, heightOf(next), height);
      });
    }
  layout.frames.forEach(([frameCell, , height], index) => {
    const look = lookAt(layout, frameCell);
    doorFrame(mesh, look, layout.boxes.slice(index * 2, index * 2 + 2), layout.doorway.lintel, height);
  });
  const cellOf = (x: number, y: number) => Math.floor(y / cell) * columns + Math.floor(x / cell);
  const kittedAt = (index: number) => {
    const style = styleAt(layout, index);
    return !!style && kitted.styles.has(style);
  };
  for (const [x, y, height] of layout.pillars)
    if (!kittedAt(cellOf(x, y))) pillar(mesh, lookAt(layout, cellOf(x, y)), x, y, height, layout.pillarHalf);
  for (const each of layout.torches) torch(mesh, each, cell, !kittedAt(cellOf(each[0], each[1])));
  doorFace(mesh, layout.exitDoor, layout.wayIn.side, door);
  const endStyle = layout.looks[layout.rooms[layout.end]?.look ?? 0]?.style ?? layout.style;
  portal(mesh, layout, !kitted.styles.has(endStyle));
  furnish(mesh);
  return mesh.model();
}
