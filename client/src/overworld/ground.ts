/** A point on the map: metres east and south of the frame's north-west corner. */
export type Point2 = readonly [number, number];

/** A point or a direction in the world: metres east, south and up. */
export type Vec3 = readonly [number, number, number];

/** The ground's height in metres at a point on the map: negative under the sea, not finite where no land is known. */
export type HeightAt = (x: number, y: number) => number;

/** A grid of ground heights laid on the map, one value a cell, row by row from the north-west corner. A landmass's
 *  `LandView` is one. */
export interface HeightGrid {
  readonly width: number;
  readonly height: number;
  readonly leftM: number;
  readonly topM: number;
  readonly cellM: number;
  readonly heights: ArrayLike<number>;
}

/** Higher than any ground the land makes (its edits level ground up to 9 km), so a ray above it meets nothing. */
export const LAND_TOP_M = 10_000;

/** What a ray or a camera stands on: the ground, or the sea's surface at 0 over the seabed and wherever no land is
 *  known. */
export function surfaceAt(heightAt: HeightAt, x: number, y: number): number {
  const ground = heightAt(x, y);
  return Number.isFinite(ground) && ground > 0 ? ground : 0;
}

/** The ground of a set of grids: each point read from the first grid that holds it, bilinear between cell centres,
 *  not a number off all of them. */
export function landHeightAt(grids: readonly HeightGrid[]): HeightAt {
  return (x, y) => {
    for (const grid of grids) {
      const { width, height, leftM, topM, cellM, heights } = grid;
      if (x < leftM || y < topM || x >= leftM + width * cellM || y >= topM + height * cellM) continue;
      const column = Math.min(width - 1, Math.max(0, (x - leftM) / cellM - 0.5));
      const row = Math.min(height - 1, Math.max(0, (y - topM) / cellM - 0.5));
      const [left, top] = [Math.floor(column), Math.floor(row)];
      const [right, bottom] = [Math.min(width - 1, left + 1), Math.min(height - 1, top + 1)];
      const [across, down] = [column - left, row - top];
      const north = heights[top * width + left] * (1 - across) + heights[top * width + right] * across;
      const south = heights[bottom * width + left] * (1 - across) + heights[bottom * width + right] * across;
      return north * (1 - down) + south * down;
    }
    return Number.NaN;
  };
}
