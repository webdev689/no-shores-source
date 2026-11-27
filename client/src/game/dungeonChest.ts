// The dungeon's cache: the chest (models/chest.ts) in the dungeon's wood and iron, lit by its torches, its lid
// shut or swung open, where the room says it stands and the way it faces; and the chests the dungeon stands for the
// player to find (finds.ts), the same chest, each lid as far open as it has swung.
import { CHEST_OPEN_RAD, chestFaces, chestScale, chestTall } from '../models/chest.ts';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { IRON } from './dungeonMesh.ts';
import { uvOf } from './dungeonUv.ts';

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

/** How long a found chest's lid takes to swing open, seconds. Open, it is short of upright, so standing off its wall as
 *  the room stands it (crates/room finds.rs) it stays clear of every kit piece, none more than 0.3 m proud of a wall
 *  (tools/dungeon/envelope.py). */
const LID_OPEN_S = 0.6;
/** The chest's size: fitted within 0.9 m across and 0.5 m deep, the box the room stands a chest in (finds.rs). */
const SCALE = chestScale(0.9, 0.5);
const HALF_DEEP = 0.25;
const TALL = chestTall(SCALE);

/** A chest the dungeon stands for the player to find (finds.ts) as the cache's chest is built: from its front's
 *  middle, half its depth before the middle the room stands it at, its lid swung back as far as it has opened. */
export function foundChest(chest: {
  readonly at: readonly [number, number, number];
  readonly facing: number;
  readonly opened: number | null;
}): Cache {
  const lid = chest.opened === null ? 0 : Math.min(1, chest.opened / LID_OPEN_S) * CHEST_OPEN_RAD;
  const [x, y, z] = chest.at;
  const front = { x: x + Math.sin(chest.facing) * HALF_DEEP, y: y - Math.cos(chest.facing) * HALF_DEEP };
  return { ...front, z, bearing: chest.facing, open: chest.opened !== null, lid };
}

/** The cache read from a snapshot's numbers (x, y, z, bearing, 1 open or 0 shut); null where it holds none. */
export function cacheOf(numbers: readonly number[]): Cache | null {
  const [x, y, z, bearing, open] = numbers;
  if (x === undefined || y === undefined || z === undefined || bearing === undefined) return null;
  return { x, y, z, bearing, open: open === 1 };
}

/** The chest, its wood in `wood`, placed where the cache stands. */
export function chestMesh(cache: Cache, wood: readonly [number, number]): ForgedModel {
  return chestsMesh([cache], wood);
}

/** Every chest of `chests` built so, as one mesh. */
export function chestsMesh(chests: readonly Cache[], wood: readonly [number, number]): ForgedModel {
  const joined = meshBuilder();
  for (const cache of chests) addChest(joined, cache, wood);
  return joined.model();
}

/** Adds one chest to `joined`: its wood in `wood`, its hinge and latch in iron, its front's middle where the cache
 *  stands, facing its bearing. */
function addChest(joined: ReturnType<typeof meshBuilder>, cache: Cache, wood: readonly [number, number]): void {
  const [cosine, sine] = [Math.cos(cache.bearing), Math.sin(cache.bearing)];
  const middle = [cache.x - sine * HALF_DEEP, cache.y + cosine * HALF_DEEP] as const;
  // The chest's x across and y out of its front, the front looking along its bearing.
  const turned = ([x, y, z]: readonly number[], shift: boolean): [number, number, number] => [
    (shift ? middle[0] : 0) + (x ?? 0) * cosine + (y ?? 0) * sine,
    (shift ? middle[1] : 0) + (x ?? 0) * sine - (y ?? 0) * cosine,
    (shift ? cache.z : 0) + (z ?? 0),
  ];
  for (const face of chestFaces(SCALE, cache.lid ?? (cache.open ? CHEST_OPEN_RAD : 0))) {
    const corners = face.corners.map((corner) => turned(corner, true));
    const normal = turned(face.normal, false);
    const picture = face.part === 'hinge' || face.part === 'latch' ? IRON : wood;
    joined.tri([picture[0], picture[1]], corners, normal, corners.map(uvOf(normal, TALL)));
  }
}
