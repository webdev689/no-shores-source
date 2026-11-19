// What the layouts lay on the land, painted for the terrain to draw (groundColour.ts `painted`): the paths and a
// block's dirt in one channel, its paving in the next, and in a third the claim of a layout whose cliffs wear chalk
// (and the skirt of land past its ring where they stand),
// each as a signed distance from its edge, so the terrain draws their edges where they lie between its texels,
// ragged and soft, in its own ground's grain.
import { tileUvs } from '../layout/layoutPlan.ts';
import { layoutBounds, type LaidTile, type NodeLayout, PATH_WIDTH_M } from '../layout/layouts.ts';
import type { GroundPaint } from '../terrain/groundColour.ts';
import { CORNERS, ISLES } from '../textures/recipes/ground.ts';

/** The finest a texel is and the most texels a side, so a window of layouts stays a few tens of megabytes. */
const FINEST_M = 1;
const MOST_TEXELS = 4096;
/** How far past its ring a chalk layout's cliffs stand and wear chalk, metres: the land its carving reads. */
const CHALK_SKIRT_M = 40;
/** Bytes a texel: dirt, paving, chalk, and one spare (the texture's format has four). */
const CHANNELS = 4;
/** How far a distance reaches each way in a byte, metres: 128 at the edge, 32 a metre. */
const REACH_M = 4;
/** The runs through a building, whose floors are laid, and how far either side of their way, metres. */
const RUN_FLOORS = new Set(['keep', 'mine', 'undercroft']);
const RUN_FLOOR_HALF_M = 3;
/** A block's tile side, metres (seat.rs TILE_M). */
const TILE_M = 6.4;
/** The town records (textures' ground.ts TOWN): paving, and ground paved across part of it. */
const PAVED: Readonly<Record<number, number>> = { 46: 1, 47: 0.6, 55: 0.6 };
const PLOUGHED = 54;

type Channels = { dirt: number; paving: number };

/** How much of each channel a ground class is: dirt for dirt, paving for stone. */
const classOf = (letter: string | undefined): Channels => ({
  dirt: letter === 'D' ? 1 : 0,
  paving: letter === 'S' ? 1 : 0,
});

/** A tile's channels at its world corners (north-west, north-east, south-east, south-west), as its record's classes
 *  lie at the picture's corners, turned as the tile is. */
export function tileCorners(tile: Pick<LaidTile, 'byte' | 'turns'>): Channels[] {
  const record = tile.byte & 63;
  const paved = PAVED[record];
  if (paved !== undefined) return Array.from({ length: 4 }, () => ({ dirt: 1 - paved, paving: paved }));
  if (record === PLOUGHED || record === 1) return Array.from({ length: 4 }, () => ({ dirt: 1, paving: 0 }));
  if (record === 3) return Array.from({ length: 4 }, () => ({ dirt: 0, paving: 1 }));
  const isle = ISLES[record];
  const corners = CORNERS[record] ?? (isle ? isle[0].repeat(4) : 'GGGG');
  const inner = classOf(isle?.[1]);
  return tileUvs(tile.byte, tile.turns).map(([across, down]) => {
    const own = classOf(corners[Math.round(down) * 2 + Math.round(across)]);
    return isle ? { dirt: (own.dirt + inner.dirt) / 2, paving: (own.paving + inner.paving) / 2 } : own;
  });
}

/** Paints the layouts within `reach` of a point, in window metres from the window's corner (`corner`, world). */
export function paintOfLayouts(
  layouts: readonly NodeLayout[],
  centre: readonly [number, number],
  reach: number,
  corner: readonly [number, number],
): GroundPaint | null {
  const near = layouts.filter((layout) => layout.paths.length || layout.tiles.length || layout.stone === 'chalk');
  if (!near.length) return null;
  const spare = REACH_M + 2;
  const bounds = near
    .map((layout) => {
      const grow = layout.stone === 'chalk' ? CHALK_SKIRT_M : 0;
      const [west, north, east, south] = layoutBounds(layout);
      return [west - grow, north - grow, east + grow, south + grow] as const;
    })
    .reduce(
      ([west, north, east, south], [wide, high, far, low]) => [
        Math.max(Math.min(west, wide - spare), centre[0] - reach),
        Math.max(Math.min(north, high - spare), centre[1] - reach),
        Math.min(Math.max(east, far + spare), centre[0] + reach),
        Math.min(Math.max(south, low + spare), centre[1] + reach),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
  const [west, north, east, south] = bounds;
  if (!(east > west && south > north)) return null;
  const texelM = Math.max(FINEST_M, (east - west) / MOST_TEXELS, (south - north) / MOST_TEXELS);
  const [width, height] = [Math.ceil((east - west) / texelM), Math.ceil((south - north) / texelM)];
  const texels = new Uint8Array(width * height * CHANNELS);
  // Each texel keeps the largest distance any feature gives it: the union of every path and street.
  const lay = (channel: number, column: number, row: number, metres: number) => {
    if (column < 0 || row < 0 || column >= width || row >= height) return;
    const value = Math.max(0, Math.min(255, Math.round(128 + metres * (128 / REACH_M))));
    const index = (row * width + column) * CHANNELS + channel;
    if (value > texels[index]) texels[index] = value;
  };
  const texelOf = (x: number, y: number) => [(x - west) / texelM - 0.5, (y - north) / texelM - 0.5] as const;
  for (const layout of near) {
    if (layout.stone === 'chalk')
      paintClaim(layout.ring, [west, north, texelM, width, height], (column, row, metres) =>
        lay(2, column, row, metres + CHALK_SKIRT_M),
      );
    for (const path of layout.paths) {
      const half = PATH_WIDTH_M[path.tier] / 2;
      for (let k = 0; k + 1 < path.points.length; k++) {
        const [from, to] = [path.points[k], path.points[k + 1]];
        const [lowX, lowY] = texelOf(
          Math.min(from[0], to[0]) - half - REACH_M,
          Math.min(from[1], to[1]) - half - REACH_M,
        );
        const [highX, highY] = texelOf(
          Math.max(from[0], to[0]) + half + REACH_M,
          Math.max(from[1], to[1]) + half + REACH_M,
        );
        for (let row = Math.floor(lowY); row <= Math.ceil(highY); row++) {
          for (let column = Math.floor(lowX); column <= Math.ceil(highX); column++) {
            const [x, y] = [west + (column + 0.5) * texelM, north + (row + 0.5) * texelM];
            lay(0, column, row, half - offLine([x, y], from, to));
          }
        }
      }
    }
    // A building run's floor: a keep's and an undercroft's paved, a mine's trodden earth, over its beats and along
    // its passages as wide as its rooms and galleries.
    for (const run of layout.runs ?? []) {
      if (!RUN_FLOORS.has(run.kind)) continue;
      const channel = run.kind === 'mine' ? 0 : 1;
      const shapes: [readonly [number, number], readonly [number, number], number][] = [
        ...run.beats.map(
          (beat) =>
            [beat.at, beat.at, beat.radius * 0.9] as [readonly [number, number], readonly [number, number], number],
        ),
        ...run.line
          .slice(1)
          .map(
            (to, k) =>
              [run.line[k] ?? to, to, RUN_FLOOR_HALF_M] as [
                readonly [number, number],
                readonly [number, number],
                number,
              ],
          ),
      ];
      for (const [from, to, half] of shapes) {
        const [lowX, lowY] = texelOf(
          Math.min(from[0], to[0]) - half - REACH_M,
          Math.min(from[1], to[1]) - half - REACH_M,
        );
        const [highX, highY] = texelOf(
          Math.max(from[0], to[0]) + half + REACH_M,
          Math.max(from[1], to[1]) + half + REACH_M,
        );
        for (let row = Math.floor(lowY); row <= Math.ceil(highY); row++) {
          for (let column = Math.floor(lowX); column <= Math.ceil(highX); column++) {
            const [x, y] = [west + (column + 0.5) * texelM, north + (row + 0.5) * texelM];
            lay(channel, column, row, half - offLine([x, y], from, to));
          }
        }
      }
    }
    // The tiles' classes at their corners, which neighbouring tiles share, read across each tile and the cells round
    // it, so a street meets the next tile without a seam and fades out across the first tile not laid.
    const lattice = new Map<string, Channels>();
    const keyOf = (x: number, y: number) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
    const cells = new Map<string, readonly [number, number]>();
    for (const tile of layout.tiles) {
      const half = TILE_M / 2;
      const spots = [
        [tile.at[0] - half, tile.at[1] - half],
        [tile.at[0] + half, tile.at[1] - half],
        [tile.at[0] + half, tile.at[1] + half],
        [tile.at[0] - half, tile.at[1] + half],
      ] as const;
      tileCorners(tile).forEach((channels, k) => {
        const key = keyOf(...spots[k]);
        const known = lattice.get(key) ?? { dirt: 0, paving: 0 };
        lattice.set(key, {
          dirt: Math.max(known.dirt, channels.dirt),
          paving: Math.max(known.paving, channels.paving),
        });
      });
      for (let east = -1; east <= 1; east++)
        for (let south = -1; south <= 1; south++) {
          const middle = [tile.at[0] + east * TILE_M, tile.at[1] + south * TILE_M] as const;
          cells.set(keyOf(...middle), middle);
        }
    }
    for (const [middleX, middleY] of cells.values()) {
      const half = TILE_M / 2;
      const cornerAt = (x: number, y: number) => lattice.get(keyOf(x, y)) ?? { dirt: 0, paving: 0 };
      const [northWest, northEast, southEast, southWest] = [
        cornerAt(middleX - half, middleY - half),
        cornerAt(middleX + half, middleY - half),
        cornerAt(middleX + half, middleY + half),
        cornerAt(middleX - half, middleY + half),
      ];
      if (![northWest, northEast, southEast, southWest].some((each) => each.dirt || each.paving)) continue;
      const [lowX, lowY] = texelOf(middleX - half, middleY - half);
      const [highX, highY] = texelOf(middleX + half, middleY + half);
      for (let row = Math.ceil(lowY); row <= Math.floor(highY); row++) {
        for (let column = Math.ceil(lowX); column <= Math.floor(highX); column++) {
          const [x, y] = [west + (column + 0.5) * texelM, north + (row + 0.5) * texelM];
          const [across, down] = [(x - middleX) / TILE_M + 0.5, (y - middleY) / TILE_M + 0.5];
          for (const [channel, key] of [
            [0, 'dirt'],
            [1, 'paving'],
          ] as const) {
            const share =
              (northWest[key] * (1 - across) + northEast[key] * across) * (1 - down) +
              (southWest[key] * (1 - across) + southEast[key] * across) * down;
            lay(channel, column, row, (share - 0.5) * TILE_M);
          }
        }
      }
    }
  }
  return { west: west - corner[0], north: north - corner[1], texelM, width, height, texels };
}

/** How far a point lies from a line between two points. */
function offLine(point: readonly [number, number], from: readonly [number, number], to: readonly [number, number]) {
  const [spanX, spanY] = [to[0] - from[0], to[1] - from[1]];
  const length = spanX * spanX + spanY * spanY;
  const along =
    length > 0 ? Math.min(1, Math.max(0, ((point[0] - from[0]) * spanX + (point[1] - from[1]) * spanY) / length)) : 0;
  return Math.hypot(point[0] - from[0] - spanX * along, point[1] - from[1] - spanY * along);
}

/** Calls `lay` for each texel of a ring's claim and the metres past it that chalk reaches, with its distance from the
 *  ring's edge (positive inside), as the grid `[west, north, texelM, width, height]` has its texels. */
function paintClaim(
  ring: readonly (readonly [number, number])[],
  [west, north, texelM, width, height]: readonly [number, number, number, number, number],
  lay: (column: number, row: number, metres: number) => void,
) {
  const [lowX, lowY, highX, highY] = [
    Math.min(...ring.map((point) => point[0])) - CHALK_SKIRT_M - REACH_M,
    Math.min(...ring.map((point) => point[1])) - CHALK_SKIRT_M - REACH_M,
    Math.max(...ring.map((point) => point[0])) + CHALK_SKIRT_M + REACH_M,
    Math.max(...ring.map((point) => point[1])) + CHALK_SKIRT_M + REACH_M,
  ];
  for (
    let row = Math.max(0, Math.floor((lowY - north) / texelM));
    row < Math.min(height, Math.ceil((highY - north) / texelM));
    row++
  )
    for (
      let column = Math.max(0, Math.floor((lowX - west) / texelM));
      column < Math.min(width, Math.ceil((highX - west) / texelM));
      column++
    ) {
      const [x, y] = [west + (column + 0.5) * texelM, north + (row + 0.5) * texelM];
      let near = Infinity;
      let inside = false;
      for (let k = 0; k < ring.length; k++) {
        const [from, to] = [ring[k], ring[(k + 1) % ring.length]];
        near = Math.min(near, offLine([x, y], from, to));
        if (from[1] > y !== to[1] > y && x < from[0] + ((y - from[1]) * (to[0] - from[0])) / (to[1] - from[1]))
          inside = !inside;
      }
      lay(column, row, inside ? near : -near);
    }
}
