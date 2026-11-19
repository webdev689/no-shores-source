// How a dungeon's pictures lie on its faces: in world metres, so neighbouring faces meet without a seam. A picture's
// top row comes first and is sampled at v = 0, so v grows down a wall and the picture stands upright on it.

type Point = readonly [number, number, number];

/** Metres one picture covers. */
export const TILE_M = 3.2;

/** A face's UV by its own plane: a floor or a ceiling by x and y, a wall along it and down from `top`, its picture's
 *  top row there. */
export function uvOf(normal: Point, top: number) {
  return ([x, y, z]: Point): [number, number] =>
    Math.abs(normal[2]) > 0.5
      ? [x / TILE_M, y / TILE_M]
      : [(Math.abs(normal[0]) > 0.5 ? y : x) / TILE_M, (top - z) / TILE_M];
}
