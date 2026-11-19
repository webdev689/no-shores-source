// A patrol's dungeon entrances: where each stands from its room's word (`Gear.dungeons`), its forged model lifted and
// turned as Daggerfall's dungeon blocks stand it, and its door, where E offers to enter.
import type { ForgedModel, MeshBuilder } from '../models/model.ts';
import type { PropTable } from '../models/tables.ts';

/** The four entrance models by their number (0 to 3), and the height each one's Daggerfall block stands it at: DUNGAA00
 *  stands 42000 at 2.5 m, DUNGAA01 42001 at 4.8 m, and the blocks stand 43601 at 0.775 m and 43602 at 0.475 m
 *  (content/world/rmb/places.json). */
export const ENTRANCE_MODELS: readonly number[] = [42000, 42001, 43601, 43602];
export const ENTRANCE_LIFTS_M: readonly number[] = [2.5, 4.8, 0.775, 0.475];
/** How near a door's middle E reaches it, metres across the ground. */
export const DOOR_REACH_M = 2.5;
/** How far before an entrance's door a player leaving its dungeon stands, metres, as the patrol's room stands them. */
export const BEFORE_DOOR_M = 1.5;

type Point = readonly [number, number, number];

/** An entrance as the room gives it: where it stands on the ground, the model's yaw (radians clockwise from north,
 *  turning its +z as an RMB block's yaw does) and which of the four models it is. */
export interface Entrance {
  readonly x: number;
  readonly y: number;
  readonly ground: number;
  readonly yaw: number;
  readonly model: number;
}

/** The entrances in a patrol's `Gear.dungeons`, five numbers each, in the dungeons' order. */
export function entrancesOf(numbers: readonly number[]): Entrance[] {
  const entrances: Entrance[] = [];
  for (let first = 0; first + 5 <= numbers.length; first += 5) {
    const [x = 0, y = 0, ground = 0, yaw = 0, model = 0] = numbers.slice(first, first + 5);
    entrances.push({ x, y, ground, yaw, model });
  }
  return entrances;
}

/** A model's point (x right, y up, z forward) turned by `yaw` into the world's east, south and up, as the city turns
 *  a forged model. */
export function turned([x, y, z]: Point, yaw: number): [number, number, number] {
  const [cosine, sine] = [Math.cos(yaw), Math.sin(yaw)];
  return [x * cosine + z * sine, x * sine - z * cosine, y];
}

/** Lays a forged model into `mesh` standing at `at` (east, south, up) turned by `yaw`, as the city stands a model;
 *  each triangle keeps its picture and is lit by its first corner's normal. */
export function layModel(mesh: MeshBuilder, model: ForgedModel, at: Point, yaw: number): void {
  const point = (vertex: number, from: Float32Array, shift: boolean) => {
    const [east, south, up] = turned(
      [from[vertex * 3] ?? 0, from[vertex * 3 + 1] ?? 0, from[vertex * 3 + 2] ?? 0],
      yaw,
    );
    return shift ? [east + at[0], south + at[1], up + at[2]] : [east, south, up];
  };
  for (const part of model.parts)
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const vertices = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const corners = vertices.map((vertex) => point(vertex, model.positions, true));
      const mapping = vertices.map((vertex) => [model.uvs[vertex * 2] ?? 0, model.uvs[vertex * 2 + 1] ?? 0]);
      mesh.tri([part.archive, part.record], corners, point(vertices[0] ?? 0, model.normals, false), mapping);
    }
}

/** Where an entrance's model stands: on its ground, lifted as its block lifts it. */
export function standOf(entrance: Entrance): [number, number, number] {
  return [entrance.x, entrance.y, entrance.ground + (ENTRANCE_LIFTS_M[entrance.model] ?? 0)];
}

/** An entrance's door: its quad's middle in the world and the way its face looks out, across the ground; null where
 *  the props' table gives its model no door. */
export function doorOf(entrance: Entrance, props: PropTable): { middle: Point; out: readonly [number, number] } | null {
  const door = props[ENTRANCE_MODELS[entrance.model] ?? -1]?.doors?.[0];
  if (!door) return null;
  const middle = turned(
    [(door.a[0] + door.c[0]) / 2, (door.a[1] + door.c[1]) / 2, (door.a[2] + door.c[2]) / 2],
    entrance.yaw,
  );
  const stand = standOf(entrance);
  const [outX, outY] = turned(door.n, entrance.yaw);
  const length = Math.hypot(outX, outY) || 1;
  return {
    middle: [stand[0] + middle[0], stand[1] + middle[1], stand[2] + middle[2]],
    out: [outX / length, outY / length],
  };
}

/** The number of the entrance whose door lies within reach of (x, y), the nearest first; null for none. */
export function entranceAt(entrances: readonly Entrance[], props: PropTable, x: number, y: number): number | null {
  let [found, nearest]: [number | null, number] = [null, DOOR_REACH_M];
  entrances.forEach((entrance, number) => {
    const door = doorOf(entrance, props);
    const away = door ? Math.hypot(door.middle[0] - x, door.middle[1] - y) : Infinity;
    if (away <= nearest) [found, nearest] = [number, away];
  });
  return found;
}

/** Where a player leaving a dungeon stands at its entrance: 1.5 m before its door, facing away from it (radians
 *  clockwise from north). */
export function beforeDoor(entrance: Entrance, props: PropTable): { x: number; y: number; facing: number } | null {
  const door = doorOf(entrance, props);
  if (!door) return null;
  const [outX, outY] = door.out;
  return {
    x: door.middle[0] + outX * BEFORE_DOOR_M,
    y: door.middle[1] + outY * BEFORE_DOOR_M,
    facing: Math.atan2(outX, -outY),
  };
}
