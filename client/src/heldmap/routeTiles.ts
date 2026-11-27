// The held map's route binned to tiles of the map, so the ink's shader measures each pixel against only the legs of
// the route that pass near its tile (heldMapView.ts), not against all of them: a long voyage has a hundred and more.
import type { Rect } from './heldMapLaw.ts';

/** A tile's side, device pixels. */
export const TILE_PX = 32;
/** How near a leg must pass a tile's pixels to be measured there, device pixels: past 1.8 a leg inks nothing, and
 *  the rest is room for the GPU's rounding. */
const REACH_PX = 3;
/** A tile's legs, a bit each in four words: bit `leg` set where the leg from point `leg` to the next passes near. */
export const TILE_WORDS = 4;

/** The legs near each tile of the map `ink` (device pixels), the route's points four floats each (`routeOf`: where
 *  each lies, metres), `points` of them, the map showing `view` (its top-left, metres, and device pixels a metre):
 *  the tiles across and down, and each tile's mask of legs, row by row. The tiles reach a little past the map's far
 *  edges, so every pixel on it has one. */
export function routeTiles(
  route: Float32Array,
  points: number,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  ink: Rect,
): { readonly columns: number; readonly rows: number; readonly masks: Uint32Array } {
  const columns = Math.floor(Math.max(0, ink.width) / TILE_PX) + 1;
  const rows = Math.floor(Math.max(0, ink.height) / TILE_PX) + 1;
  const masks = new Uint32Array(columns * rows * TILE_WORDS);
  const legs = Math.min(points - 1, TILE_WORDS * 32);
  const onScreen = (point: number) => [
    ((route[point * 4] ?? 0) - view.left) * view.scale,
    ((route[point * 4 + 1] ?? 0) - view.top) * view.scale,
  ];
  // A pixel within REACH_PX of the leg lies in a tile whose middle is within half its diagonal more.
  const near = (TILE_PX * Math.SQRT2) / 2 + REACH_PX;
  for (let leg = 0; leg < legs; leg++) {
    const [fromX = 0, fromY = 0] = onScreen(leg);
    const [toX = 0, toY = 0] = onScreen(leg + 1);
    const tileOf = (pixels: number, most: number) => Math.min(most - 1, Math.max(0, Math.floor(pixels / TILE_PX)));
    const [left, right] = [tileOf(Math.min(fromX, toX) - near, columns), tileOf(Math.max(fromX, toX) + near, columns)];
    const [top, bottom] = [tileOf(Math.min(fromY, toY) - near, rows), tileOf(Math.max(fromY, toY) + near, rows)];
    if (Math.max(fromX, toX) < -near || Math.max(fromY, toY) < -near) continue;
    for (let row = top; row <= bottom; row++)
      for (let column = left; column <= right; column++) {
        const middle = [(column + 0.5) * TILE_PX, (row + 0.5) * TILE_PX] as const;
        if (apart(middle, [fromX, fromY], [toX, toY]) > near) continue;
        const word = (row * columns + column) * TILE_WORDS + Math.floor(leg / 32);
        masks[word] = (masks[word] ?? 0) | (1 << (leg % 32));
      }
  }
  return { columns, rows, masks };
}

/** How far a point lies from the leg between two others. */
function apart(
  [x, y]: readonly [number, number],
  [fromX, fromY]: readonly [number, number],
  [toX, toY]: readonly [number, number],
): number {
  const [alongX, alongY] = [toX - fromX, toY - fromY];
  const length = alongX * alongX + alongY * alongY;
  const share = length > 0 ? Math.min(1, Math.max(0, ((x - fromX) * alongX + (y - fromY) * alongY) / length)) : 0;
  return Math.hypot(x - fromX - alongX * share, y - fromY - alongY * share);
}
