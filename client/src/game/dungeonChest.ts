// The dungeon's cache: a chest of wooden boxes bound in iron, its lid shut or thrown back, where the room says it
// stands and the way it faces; and the chests the dungeon stands for the player to find (finds.ts), the same chest,
// each lid as far open as it has swung.
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { box, IRON } from './dungeonMesh.ts';

/** The cache as a room's snapshot gives it: where it stands, the way it faces (radians clockwise from north), and
 *  whether it stands open; or how far its lid has swung back (radians), for a chest opening. */
export interface Cache {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly bearing: number;
  readonly open: boolean;
  readonly lid?: number;
}

/** How long a found chest's lid takes to swing back, seconds, and how far, radians: short of upright, so standing off
 *  its wall as the room stands it (crates/room finds.rs) the open lid stays clear of every kit piece, none more than
 *  0.3 m proud of a wall (tools/dungeon/envelope.py). */
const LID_OPEN_S = 0.6;
const LID_RAD = 1.35;

/** A chest the dungeon stands for the player to find (finds.ts) as the cache's chest is built: from its front's
 *  middle, half its depth before the middle the room stands it at, its lid swung back as far as it has opened. */
export function foundChest(chest: {
  readonly at: readonly [number, number, number];
  readonly facing: number;
  readonly opened: number | null;
}): Cache {
  const lid = chest.opened === null ? 0 : Math.min(1, chest.opened / LID_OPEN_S) * LID_RAD;
  const [x, y, z] = chest.at;
  const half = BODY.depth / 2;
  const front = { x: x + Math.sin(chest.facing) * half, y: y - Math.cos(chest.facing) * half };
  return { ...front, z, bearing: chest.facing, open: chest.opened !== null, lid };
}

/** The chest's body, its lid, its iron bands and how far its lid is thrown back open, metres and radians. */
const BODY = { half: 0.45, depth: 0.5, height: 0.42 };
const LID = 0.14;
const BAND = { half: 0.04, proud: 0.012 };
const BANDS_AT = [-0.3, 0.3];
const LOCK = { half: 0.06, low: 0.28, high: 0.46 };
const OPENED = 1.9;

/** The cache read from a snapshot's numbers (x, y, z, bearing, 1 open or 0 shut); null where it holds none. */
export function cacheOf(numbers: readonly number[]): Cache | null {
  const [x, y, z, bearing, open] = numbers;
  if (x === undefined || y === undefined || z === undefined || bearing === undefined) return null;
  return { x, y, z, bearing, open: open === 1 };
}

/** The chest built from boxes, wood in `wood` and bands of iron, placed where the cache stands. */
export function chestMesh(cache: Cache, wood: readonly [number, number]): ForgedModel {
  return chestsMesh([cache], wood);
}

/** Every chest of `chests` built so, as one mesh. */
export function chestsMesh(chests: readonly Cache[], wood: readonly [number, number]): ForgedModel {
  const joined = meshBuilder();
  for (const cache of chests) addChest(joined, cache, wood);
  return joined.model();
}

/** Adds one chest to `joined`. */
function addChest(joined: ReturnType<typeof meshBuilder>, cache: Cache, wood: readonly [number, number]): void {
  // Built with x to its right, y to its back and z up, its front's middle at its foot at the origin.
  const body = meshBuilder();
  const lid = meshBuilder();
  const iron = IRON;
  const back = BODY.depth;
  box(body, wood, [-BODY.half, 0, 0], [BODY.half, back, BODY.height]);
  box(lid, wood, [-BODY.half, 0, BODY.height], [BODY.half, back, BODY.height + LID]);
  for (const across of BANDS_AT) {
    const [left, right] = [across - BAND.half, across + BAND.half];
    box(body, iron, [left, -BAND.proud, 0], [right, back + BAND.proud, BODY.height]);
    box(lid, iron, [left, -BAND.proud, BODY.height], [right, back + BAND.proud, BODY.height + LID + BAND.proud]);
  }
  box(lid, iron, [-LOCK.half, -BAND.proud * 2, LOCK.low], [LOCK.half, 0, LOCK.high]);
  const lidTurn = cache.lid ?? (cache.open ? OPENED : 0);
  const hinge = [back, BODY.height] as const;
  const [cosine, sine] = [Math.cos(cache.bearing), Math.sin(cache.bearing)];
  // Its right and its back in the world; with z up the turn keeps every face wound as it was.
  const place = ([x, y, z]: readonly number[], shift: boolean): [number, number, number] => [
    (shift ? cache.x : 0) + x * cosine - y * sine,
    (shift ? cache.y : 0) + x * sine + y * cosine,
    (shift ? cache.z : 0) + z,
  ];
  const opened = ([x, y, z]: readonly number[]): number[] => {
    const [along, up] = [y - hinge[0], z - hinge[1]];
    return [
      x,
      hinge[0] + along * Math.cos(lidTurn) + up * Math.sin(lidTurn),
      hinge[1] - along * Math.sin(lidTurn) + up * Math.cos(lidTurn),
    ];
  };
  for (const [built, turn] of [
    [body.model(), (point: readonly number[]) => [...point]],
    [lid.model(), opened],
  ] as const) {
    for (const part of built.parts)
      for (let index = part.start; index < part.start + part.count; index += 3) {
        const vertices = [0, 1, 2].map((offset) => built.indices[index + offset] ?? 0);
        const corners = vertices.map((vertex) =>
          place(turn([0, 1, 2].map((axis) => built.positions[vertex * 3 + axis] ?? 0)), true),
        );
        const first = vertices[0] ?? 0;
        // A normal turns as the points do, without their shift.
        const tip = turn([0, 1, 2].map((axis) => built.normals[first * 3 + axis] ?? 0));
        const origin = turn([0, 0, 0]);
        const normal = place(
          [0, 1, 2].map((axis) => (tip[axis] ?? 0) - (origin[axis] ?? 0)),
          false,
        );
        const mapping = vertices.map((vertex) => [built.uvs[vertex * 2] ?? 0, built.uvs[vertex * 2 + 1] ?? 0]);
        joined.tri([part.archive, part.record], corners, normal, mapping);
      }
  }
}
