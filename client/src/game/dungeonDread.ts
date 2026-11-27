// The dread a dungeon is drawn with, by the page alone and only where no body meets it, so the rules never know it:
// blood pooled on floors and smeared down corridors, bones scattered in the dread rooms (`DREAD_ROLES`), chains and
// shrouded dead hung from high ceilings, handprints and scratches on walls, and eyes that catch the light far off in
// the dark and are gone as one comes near. A few rooms' torches stand cold, more the deeper a storey lies, and every
// dread room's but the way in's, the end's and a seal's. Each is drawn from where it stands (`kitHash`), so every
// machine draws the same.
import type { MeshBuilder } from '../models/model.ts';
import { type DungeonLayout, CORRIDOR, storeyUnder } from './dungeonLayout.ts';
import { cellAt, centreOf, isOpen, rockOn, SIDES, stepOf, wallPoint } from './dungeonCells.ts';
import { kitHash } from './dungeonKits.ts';
import { COLOUR, IRON } from './dungeonMesh.ts';
import type { StoreyPlane } from './dungeonStoreyPlanes.ts';

type Point = readonly [number, number, number];

/** The rooms whose purpose is dread (`crates/dungeon/src/banks.rs`). */
export const DREAD_ROLES: ReadonlySet<string> = new Set([
  'open-graves',
  'weeping-chamber',
  'slaughter-hall',
  'hanging-hall',
  'flaying-room',
  'starving-pit',
  'desecrated-chapel',
  'bleeding-altar',
  'nest',
  'gnawed-den',
  'sealed-drift',
  'drowned-shaft',
]);
/** The dread rooms whose ceilings hang chains and the shrouded dead. */
const HUNG_ROLES: ReadonlySet<string> = new Set([
  'slaughter-hall',
  'hanging-hall',
  'flaying-room',
  'weeping-chamber',
  'bleeding-altar',
]);
/** How likely a room's torches are cold, by its storey from the top; a dread room's, always but where it must be lit. */
const COLD_BY_STOREY = [0.04, 0.1, 0.18, 0.26, 0.34] as const;
/** How likely a cell holds each thing: in a dread room, in any other room by its storey, in a corridor. */
const CHANCE = {
  dreadPool: 0.3,
  pool: [0.015, 0.03, 0.05, 0.07, 0.09],
  smear: [0.02, 0.04, 0.06, 0.08, 0.1],
  bones: 0.28,
  marks: 0.18,
  eyes: [0, 0.015, 0.025, 0.035, 0.045],
} as const;
const UPWARD: Point = [0, 0, 1];
/** Nothing hangs lower than this over a floor (m), so it is always over a body's head. */
const HUNG_LOWEST_M = 2.3;
/** A pool's floor offset, over the floor's own face and under a body's step (m). */
const POOL_M = 0.012;

/** A number from 0 to 1 for a thing at a cell, the same everywhere. */
const drawOf = (layout: DungeonLayout, cell: number, salt: string) => kitHash(layout.name, cell, salt) / 4_294_967_296;

/** The storey a room stands on, by its own word or the top's. */
const storeyOfRoom = (layout: DungeonLayout, room: number) => layout.rooms[room]?.storey ?? 0;

/** The rooms whose torches stand cold: by chance, more the deeper a storey, and every dread room's; never the way in's,
 *  the end's or a seal's room, which must be lit to be read. */
export function coldRooms(layout: DungeonLayout): ReadonlySet<number> {
  const kept = new Set([layout.wayIn.room, layout.end, ...(layout.encounters?.seals ?? []).map((seal) => seal.room)]);
  const cold = new Set<number>();
  layout.rooms.forEach((room, number) => {
    if (kept.has(number)) return;
    const depth = Math.min(COLD_BY_STOREY.length - 1, storeyOfRoom(layout, number));
    const chance = DREAD_ROLES.has(room.role) ? 0.7 : COLD_BY_STOREY[depth];
    if (kitHash(layout.name, number, 'cold') / 4_294_967_296 < chance) cold.add(number);
  });
  return cold;
}

/** Whether torch `torch` (x, y, z, side) of the whole layout stands in a cold room. */
export function coldTorch(layout: DungeonLayout, cold: ReadonlySet<number>, torch: readonly number[]): boolean {
  const [x = 0, y = 0, z = 0] = torch;
  const plane = layout.columns * layout.rows;
  const room = layout.cells[storeyUnder(layout, z) * plane + cellAt(layout, x, y)] ?? CORRIDOR;
  return room >= 0 && cold.has(room);
}

/** A face of `corners` in a plain colour, wound to face `toward` as the city's faces are, and lit by that facing. */
function patch(mesh: MeshBuilder, colour: number, corners: readonly Point[], toward: Point): void {
  const [first, second, third] = corners as [Point, Point, Point];
  const normal: Point = [
    (second[1] - first[1]) * (third[2] - first[2]) - (second[2] - first[2]) * (third[1] - first[1]),
    (second[2] - first[2]) * (third[0] - first[0]) - (second[0] - first[0]) * (third[2] - first[2]),
    (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]),
  ];
  const facing = normal[0] * toward[0] + normal[1] * toward[1] + normal[2] * toward[2] >= 0;
  const wound = facing ? corners : [...corners].reverse();
  const length = Math.hypot(...normal) || 1;
  const lit: Point = normal.map((part) => (facing ? part : -part) / length) as unknown as Point;
  const mapping = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].slice(0, wound.length);
  if (wound.length === 3) mesh.tri([colour, 0], wound, lit, mapping);
  else mesh.quad([colour, 0], wound, lit, mapping);
}

/** A pool lying on the floor round (x, y): a ragged ring of points, its edge drawn by `draw`, a fan from its middle. */
function pool(mesh: MeshBuilder, [x, y]: readonly [number, number], reach: number, draw: () => number): void {
  const points = 9;
  const rim = Array.from({ length: points }, (_none, nth) => {
    const turn = (nth / points) * Math.PI * 2;
    const out = reach * (0.55 + 0.45 * draw());
    return [x + Math.cos(turn) * out, y + Math.sin(turn) * out * (0.7 + 0.3 * draw()), POOL_M] as const;
  });
  rim.forEach((point, nth) =>
    patch(mesh, COLOUR.blood, [[x, y, POOL_M], point, rim[(nth + 1) % points] ?? point], UPWARD),
  );
}

/** A bar of `size` (its length along `turn`, radians from east, its width across and its height), its foot's middle
 *  at `at`: its top and four sides, each facing out. */
function bar(mesh: MeshBuilder, colour: number, [x, y, z]: Point, turn: number, size: Point): void {
  const [length, width, height] = size;
  const along: Point = [Math.cos(turn), Math.sin(turn), 0];
  const across: Point = [-Math.sin(turn), Math.cos(turn), 0];
  const corner = (first: number, second: number, up: number): Point => [
    x + along[0] * first * length * 0.5 + across[0] * second * width * 0.5,
    y + along[1] * first * length * 0.5 + across[1] * second * width * 0.5,
    z + up * height,
  ];
  patch(mesh, colour, [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)], UPWARD);
  for (const sign of [-1, 1]) {
    const endOut: Point = [along[0] * sign, along[1] * sign, 0];
    patch(mesh, colour, [corner(sign, -1, 0), corner(sign, 1, 0), corner(sign, 1, 1), corner(sign, -1, 1)], endOut);
    const sideOut: Point = [across[0] * sign, across[1] * sign, 0];
    patch(mesh, colour, [corner(-1, sign, 0), corner(1, sign, 0), corner(1, sign, 1), corner(-1, sign, 1)], sideOut);
  }
}

/** Bones scattered round (x, y): a few long bones lying every way, and a skull. */
function bones(mesh: MeshBuilder, [x, y]: readonly [number, number], draw: () => number): void {
  const count = 3 + Math.floor(draw() * 4);
  for (let bone = 0; bone < count; bone++) {
    const lies: Point = [x + (draw() - 0.5) * 1.4, y + (draw() - 0.5) * 1.4, 0];
    bar(mesh, COLOUR.bone, lies, draw() * Math.PI, [0.28 + draw() * 0.2, 0.045, 0.04]);
  }
  bar(mesh, COLOUR.bone, [x + (draw() - 0.5), y + (draw() - 0.5), 0], draw() * Math.PI, [0.18, 0.15, 0.14]);
}

/** A chain hung from `top` down to `low` over (x, y), its links turned each way in turn, a hook at its foot; and, one
 *  time in three where the ceiling is high, a shrouded body hung from the hook. */
function chain(mesh: MeshBuilder, [x, y]: readonly [number, number], top: number, low: number, draw: () => number) {
  const link = 0.09;
  for (let height = top; height > low; height -= link) {
    const turn = Math.round((top - height) / link) % 2 === 0 ? 0 : Math.PI / 2;
    bar(mesh, IRON[0], [x, y, height - link], turn, [0.05, 0.012, link]);
  }
  bar(mesh, IRON[0], [x, y, low - 0.12], 0, [0.12, 0.02, 0.12]);
  const shroudTop = low - 0.14;
  if (shroudTop - 1.3 >= HUNG_LOWEST_M && draw() < 0.34)
    bar(mesh, COLOUR.shroud, [x, y, shroudTop - 1.3], draw() * Math.PI, [0.34, 0.26, 1.3]);
}

/** Lays one storey's dread into `mesh`, from that storey's floor (`plane.layout`, as `storeyPlanes` cuts it). */
export function layDread(mesh: MeshBuilder, plane: StoreyPlane): void {
  const { layout, storey } = plane;
  const depth = Math.min(4, storey);
  const solidAt = (cell: number) => {
    const [x, y] = centreOf(layout, cell);
    return layout.boxes.some(([minX, minY, maxX, maxY]) => x > minX && x < maxX && y > minY && y < maxY);
  };
  layout.cells.forEach((kind, cell) => {
    if (!isOpen(layout, cell) || kind < CORRIDOR) return;
    let seed = kitHash(layout.name, cell, 'dread');
    const draw = () => {
      seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) >>> 0;
      seed ^= seed >>> 12;
      return (seed >>> 0) / 4_294_967_296;
    };
    const room = kind >= 0 ? layout.rooms[kind] : undefined;
    const dread = room !== undefined && DREAD_ROLES.has(room.role);
    const middle = centreOf(layout, cell);
    const chance = (salt: string) => drawOf(layout, cell, salt);
    if (room) {
      if (chance('pool') < (dread ? CHANCE.dreadPool : CHANCE.pool[depth]))
        pool(mesh, middle, 0.5 + draw() * 0.7, draw);
      if (dread && chance('bones') < CHANCE.bones && !solidAt(cell)) bones(mesh, middle, draw);
      const ceiling = layout.ceilings[cell] ?? 0;
      if (dread && HUNG_ROLES.has(room.role) && chance('chain') < 0.3 && ceiling > HUNG_LOWEST_M + 0.6)
        chain(mesh, middle, ceiling, HUNG_LOWEST_M + draw() * (ceiling - HUNG_LOWEST_M - 0.5), draw);
    } else if (chance('smear') < CHANCE.smear[depth]) smear(mesh, layout, cell, draw);
    for (const side of SIDES) {
      if (!rockOn(layout, cell, side)) continue;
      if ((dread || kind === CORRIDOR) && chance(`marks ${side}`) < CHANCE.marks * (dread ? 1 : 0.3))
        marks(mesh, layout, cell, side, draw);
      if (chance(`eyes ${side}`) < CHANCE.eyes[depth] * (dread ? 2 : 1)) eyes(mesh, layout, cell, side, draw);
    }
  });
}

/** A smear dragged along a corridor's cell: three strokes, each wandering from the last. */
function smear(mesh: MeshBuilder, layout: DungeonLayout, cell: number, draw: () => number): void {
  const [x, y] = centreOf(layout, cell);
  const along = SIDES.find((side) => !rockOn(layout, cell, side)) ?? 0;
  const [east, south] = stepOf(along);
  const half = layout.cell / 2;
  let [fromX, fromY] = [x - east * half, y - south * half];
  for (let stroke = 0; stroke < 3; stroke++) {
    const wide = 0.12 + draw() * 0.12;
    const [toX, toY] = [
      fromX + east * half * 0.66 + south * (draw() - 0.5) * 0.3,
      fromY + south * half * 0.66 + east * (draw() - 0.5) * 0.3,
    ];
    const [acrossX, acrossY] = [-south * wide, east * wide];
    const corners: Point[] = [
      [fromX - acrossX, fromY - acrossY, POOL_M],
      [toX - acrossX, toY - acrossY, POOL_M],
      [toX + acrossX, toY + acrossY, POOL_M],
      [fromX + acrossX, fromY + acrossY, POOL_M],
    ];
    patch(mesh, COLOUR.blood, corners, UPWARD);
    [fromX, fromY] = [toX, toY];
  }
}

/** Marks on a wall: a handprint, or four scratches dragged down it. */
function marks(mesh: MeshBuilder, layout: DungeonLayout, cell: number, side: number, draw: () => number): void {
  const [wallX, wallY] = wallPoint(layout, cell, side);
  const [east, south] = stepOf(side);
  const out: Point = [-east, -south, 0];
  const [alongX, alongY] = [-south, east];
  const off = 0.012;
  const shift = (draw() - 0.5) * layout.cell * 0.6;
  const [x, y] = [wallX - east * off + alongX * shift, wallY - south * off + alongY * shift];
  const quad = (centreAlong: number, low: number, high: number, wide: number) => {
    const [middleX, middleY] = [x + alongX * centreAlong, y + alongY * centreAlong];
    const corners: Point[] = [
      [middleX - alongX * wide, middleY - alongY * wide, low],
      [middleX + alongX * wide, middleY + alongY * wide, low],
      [middleX + alongX * wide, middleY + alongY * wide, high],
      [middleX - alongX * wide, middleY - alongY * wide, high],
    ];
    patch(mesh, COLOUR.blood, corners, out);
  };
  if (draw() < 0.5) {
    const height = 1.0 + draw() * 0.6;
    quad(0, height, height + 0.13, 0.05);
    for (let finger = 0; finger < 4; finger++) quad(-0.045 + finger * 0.03, height + 0.13, height + 0.21, 0.009);
    return;
  }
  const top = 1.2 + draw() * 0.6;
  for (let scratch = 0; scratch < 4; scratch++) quad(scratch * 0.05, top - 0.55 - draw() * 0.2, top, 0.008);
}

/** Two eyes low against a wall, catching the light far off; the shader takes them back into the dark as the eye nears. */
function eyes(mesh: MeshBuilder, layout: DungeonLayout, cell: number, side: number, draw: () => number): void {
  const [wallX, wallY] = wallPoint(layout, cell, side);
  const [east, south] = stepOf(side);
  const [alongX, alongY] = [-south, east];
  const off = 0.3 + draw() * 0.5;
  const [x, y] = [wallX - east * off, wallY - south * off];
  const height = 0.5 + draw() * 1.1;
  const out: Point = [-east, -south, 0];
  const size = 0.022;
  for (const apart of [-0.05, 0.05]) {
    const [middleX, middleY] = [x + alongX * apart, y + alongY * apart];
    const corners: Point[] = [
      [middleX - alongX * size, middleY - alongY * size, height - size],
      [middleX + alongX * size, middleY + alongY * size, height - size],
      [middleX + alongX * size, middleY + alongY * size, height + size],
      [middleX - alongX * size, middleY - alongY * size, height + size],
    ];
    patch(mesh, COLOUR.eyes, corners, out);
  }
}
