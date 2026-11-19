// How a dungeon's pictures lie on its faces: in world metres, so neighbouring faces meet without a seam. A picture's
// top row comes first and is sampled at v = 0, so v grows down a wall and the picture stands upright on it; its left
// column comes first, so u grows to the right of one facing the wall, whichever way it faces.

type Point = readonly [number, number, number];

/** Metres one picture covers. */
export const TILE_M = 3.2;

/** A face's UV by its own plane: a floor or a ceiling by x and y, a wall rightward along it as one faces it (x east,
 *  y south: facing north, east is on the right) and down from `top`, its picture's top row there. */
export function uvOf(normal: Point, top: number) {
  return ([x, y, z]: Point): [number, number] =>
    Math.abs(normal[2]) > 0.5
      ? [x / TILE_M, y / TILE_M]
      : [(x * normal[1] - y * normal[0]) / TILE_M, (top - z) / TILE_M];
}
