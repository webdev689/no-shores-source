// What the layouts lay on the land, painted for the terrain to draw (groundColour.ts `painted`): the paths and a
// block's dirt in one channel, its paving in the next, and, where a layout's brief gives it chalk and its zone meets
// the window, a third that holds its claim and the fade band its cliffs stand in. Each is a signed distance from its
// edge, so the terrain draws the edges where they lie between its texels, ragged and soft, in its own ground's grain.
import { claimField, type Grid, type Wing } from './claimField.ts';
import { tileUvs } from '../layout/layoutPlan.ts';
import { layoutBounds, type LaidTile, type NodeLayout, PATH_WIDTH_M } from '../layout/layouts.ts';
import type { GroundPaint } from '../terrain/groundColour.ts';
import { CORNERS, ISLES } from '../textures/recipes/ground.ts';

/** The finest a texel is and the most texels a side, so a window of layouts stays a few tens of megabytes. */
const FINEST_M = 1;
const MOST_TEXELS = 4096;
/** How far past its claim a layout's cliffs stand, metres: where its carving fades back to the land (land's FADE_M). */
const CHALK_FADE_M = 140;
/** The cell chalk's distances are worked in, metres: its fade is 140 m and its edge soft, so a few metres do. */
const CHALK_CELL_M = 8;
/** Bytes a texel where chalk is painted: dirt, paving, chalk, and one the texture's format needs. */
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
  const window = [centre[0] - reach, centre[1] - reach, centre[0] + reach, centre[1] + reach] as const;
  const chalkBoxes = new Map(
    layouts.flatMap((layout) => {
      const box = chalkBox(layout)?.map((side, k) => side + (k < 2 ? -CHALK_FADE_M : CHALK_FADE_M));
      const meets = box && box[0] < window[2] && box[2] > window[0] && box[1] < window[3] && box[3] > window[1];
      return meets ? [[layout, box as [number, number, number, number]] as const] : [];
    }),
  );
  const near = layouts.filter((layout) => layout.paths.length || layout.tiles.length || chalkBoxes.has(layout));
  if (!near.length) return null;
  const spare = REACH_M + 2;
  const bounds = near
    .map((layout) => {
      const [west, north, east, south] = chalkBoxes.get(layout) ?? layoutBounds(layout);
      return [west, north, east, south] as const;
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
  const channels = chalkBoxes.size ? CHANNELS : 2;
  const texels = new Uint8Array(width * height * channels);
  // Each texel keeps the largest distance any feature gives it: the union of every path and street.
  const lay = (channel: number, column: number, row: number, metres: number) => {
    if (column < 0 || row < 0 || column >= width || row >= height) return;
    const value = Math.max(0, Math.min(255, Math.round(128 + metres * (128 / REACH_M))));
    const index = (row * width + column) * channels + channel;
    if (value > texels[index]) texels[index] = value;
  };
  const texelOf = (x: number, y: number) => [(x - west) / texelM - 0.5, (y - north) / texelM - 0.5] as const;
  for (const layout of near) {
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
  for (const [layout, box] of chalkBoxes)
    paintChalk(layout, box, layouts, { west, north, texelM, width, height }, [texels, channels]);
  return { west: west - corner[0], north: north - corner[1], texelM, width, height, texels, channels };
}

/** How far a point lies from a line between two points. */
function offLine(point: readonly [number, number], from: readonly [number, number], to: readonly [number, number]) {
  const [spanX, spanY] = [to[0] - from[0], to[1] - from[1]];
  const length = spanX * spanX + spanY * spanY;
  const along =
    length > 0 ? Math.min(1, Math.max(0, ((point[0] - from[0]) * spanX + (point[1] - from[1]) * spanY) / length)) : 0;
  return Math.hypot(point[0] - from[0] - spanX * along, point[1] - from[1] - spanY * along);
}

/** A layout whose brief gives it chalk and whose claim is known: that claim and its wings. */
function chalkOf(layout: NodeLayout) {
  const claim = layout.sculpt?.claim;
  return layout.stone === 'chalk' && claim?.length
    ? { claim, wings: (layout.sculpt?.wings ?? []) as readonly Wing[] }
    : null;
}

/** The box of a chalk layout's claim and wings, west, north, east, south, or null for any other. */
function chalkBox(layout: NodeLayout): [number, number, number, number] | null {
  const own = chalkOf(layout);
  if (!own) return null;
  const eastings = [
    ...own.claim.map((point) => point[0]),
    ...own.wings.flatMap((wing) => [Math.min(wing[0], wing[2]) - wing[4], Math.max(wing[0], wing[2]) + wing[4]]),
  ];
  const southings = [
    ...own.claim.map((point) => point[1]),
    ...own.wings.flatMap((wing) => [Math.min(wing[1], wing[3]) - wing[4], Math.max(wing[1], wing[3]) + wing[4]]),
  ];
  return [Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)];
}

/** Lays a chalk layout's claim, its wings and the fade band past them (its `box`) in the chalk channel, except what
 *  lies in another layout's claim, so chalk never paints a neighbour. The distances are worked in coarse cells over
 *  the box alone and read between their centres for each texel. */
function paintChalk(
  layout: NodeLayout,
  box: readonly [number, number, number, number],
  layouts: readonly NodeLayout[],
  whole: Grid,
  [texels, channels]: readonly [Uint8Array, number],
) {
  const own = chalkOf(layout);
  if (!own) return;
  const [first, last] = [
    [
      Math.max(0, Math.floor((box[0] - whole.west) / whole.texelM)),
      Math.max(0, Math.floor((box[1] - whole.north) / whole.texelM)),
    ],
    [
      Math.min(whole.width, Math.ceil((box[2] - whole.west) / whole.texelM)),
      Math.min(whole.height, Math.ceil((box[3] - whole.north) / whole.texelM)),
    ],
  ];
  if (last[0] <= first[0] || last[1] <= first[1]) return;
  const cell = Math.max(CHALK_CELL_M, whole.texelM);
  const grid: Grid = {
    west: whole.west + first[0] * whole.texelM,
    north: whole.north + first[1] * whole.texelM,
    texelM: cell,
    width: Math.ceil(((last[0] - first[0]) * whole.texelM) / cell),
    height: Math.ceil(((last[1] - first[1]) * whole.texelM) / cell),
  };
  const field = claimField([own.claim], own.wings, grid);
  const others = layouts
    .filter((other) => other !== layout && other.sculpt?.claim?.length)
    .map((other) => other.sculpt?.claim ?? []);
  const next = others.length ? claimField(others, [], grid) : null;
  const values = new Float32Array(field.length);
  for (let k = 0; k < values.length; k++) values[k] = Math.min(field[k] + CHALK_FADE_M, next ? -next[k] : Infinity);
  const [lastColumn, lastRow] = [grid.width - 1, grid.height - 1];
  const scale = 128 / REACH_M;
  for (let row = first[1]; row < last[1]; row++) {
    const down = Math.max(0, ((row - first[1] + 0.5) * whole.texelM) / cell - 0.5);
    const above = Math.min(lastRow, Math.floor(down));
    const [share, upper, lower] = [down - above, above * grid.width, Math.min(lastRow, above + 1) * grid.width];
    // A run of texels between the same four cell centres: wholly outside or inside the painted reach it is skipped
    // or filled, and only the band at an edge is read between the centres.
    for (let column = first[0]; column < last[0];) {
      const left = Math.min(
        lastColumn,
        Math.floor(Math.max(0, ((column - first[0] + 0.5) * whole.texelM) / cell - 0.5)),
      );
      const right = Math.min(lastColumn, left + 1);
      const end =
        left >= lastColumn
          ? last[0]
          : Math.min(last[0], first[0] + Math.ceil(((left + 1.5) * cell) / whole.texelM - 0.5));
      const [northWest, northEast] = [values[upper + left], values[upper + right]];
      const [southWest, southEast] = [values[lower + left], values[lower + right]];
      const least = Math.min(northWest, northEast, southWest, southEast);
      const most = Math.max(northWest, northEast, southWest, southEast);
      if (most > -REACH_M)
        for (; column < end; column++) {
          const across = Math.max(0, ((column - first[0] + 0.5) * whole.texelM) / cell - 0.5);
          const along = across - left;
          const metres =
            least >= REACH_M
              ? REACH_M
              : (northWest * (1 - along) + northEast * along) * (1 - share) +
                (southWest * (1 - along) + southEast * along) * share;
          const value = metres * scale + 128;
          if (value <= 0) continue;
          const index = (row * whole.width + column) * channels + 2;
          const byte = value >= 255 ? 255 : Math.round(value);
          if (byte > texels[index]) texels[index] = byte;
        }
      column = Math.max(column, end);
    }
  }
}
