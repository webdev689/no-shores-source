// The dungeon's lights by where they can reach: the view cut into clusters, each a tile of the screen by a slice of
// its depth, each listing the lights whose reach touches it, so a lit fragment sums the few its cluster lists rather
// than every light of the frame. A light adds nothing past its reach, so the sum is the same.
import type { Light } from './dungeonLight.ts';

type Point = readonly [number, number, number];

/** The clusters: 16 columns of tiles across the screen, 9 rows of tiles up it, and 24 slices of depth. */
export const CLUSTER_GRID = { columns: 16, rows: 9, slices: 24 } as const;
export const CLUSTER_COUNT = CLUSTER_GRID.columns * CLUSTER_GRID.rows * CLUSTER_GRID.slices;
/** The depths the slices span, metres ahead of the eye, each slice the same factor deeper than the last: thin near
 *  the eye and wide far off, so a cluster is near a cube wherever it lies. Nearer than `near` is the first slice, and
 *  past `far` the last. */
export const SLICE_DEPTHS = { near: 0.25, far: 256 } as const;
/** How many slices a factor of e in depth spans. */
export const SLICES_PER_LOG = CLUSTER_GRID.slices / Math.log(SLICE_DEPTHS.far / SLICE_DEPTHS.near);
/** The most entries the lists hold in all: a frame that needs more lights every fragment by every light. */
export const MOST_LISTED = 65_536;
/** How much wider than its reach a light is listed, metres: far more than the GPU's rounding of a point within the
 *  slices, so a point a light reaches never finds a cluster that leaves it out. */
export const REACH_MARGIN_M = 0.01;
/** Where a cluster's word holds its list's length; below it, where its list starts past the clusters' words. */
const LENGTH_SHIFT = 24;
const LIST_START = (1 << LENGTH_SHIFT) - 1;
/** The nearest ahead any point is taken to lie, metres, here and in the shader: nearer than any near plane. */
const NEAREST_AHEAD = 1e-6;

/** Where each slice starts ahead of the eye, the first at the eye, and after the last the end of all. */
const SLICE_STARTS = Float64Array.from({ length: CLUSTER_GRID.slices + 1 }, (_unused, slice) =>
  slice === 0 ? 0 : slice === CLUSTER_GRID.slices ? Infinity : SLICE_DEPTHS.near * Math.exp(slice / SLICES_PER_LOG),
);

/** The tile a point lands in among `tiles`, by where it lies on the screen (-1 to 1), held to the grid. */
function tileOf(screen: number, tiles: number): number {
  return Math.min(tiles - 1, Math.max(0, Math.floor((screen + 1) * 0.5 * tiles)));
}

/** Where on the screen (-1 to 1) a side `side` metres off the middle of the view lands, between `from` and `to` metres
 *  ahead, at its least (`least`) or its most: a side lands farthest from the middle where it is nearest the eye, and
 *  nearest the middle where it is farthest. `factor` is where one metre at one metre ahead lands. */
function screenEdge(side: number, from: number, to: number, factor: number, least: boolean): number {
  return (factor * side) / (side >= 0 === least ? to : from);
}

/** Where a light lies in the eye's frame (across, up and ahead, metres) and how far it is listed as reaching, and how
 *  far across and up the screen one metre at one metre ahead lands. */
type Seen = { across: number; upward: number; ahead: number; reach: number; acrossScale: number; upScale: number };

/**
 * The tiles a light's sphere touches within one slice, as [first column, last column, first row, last row] into
 * `into` at `start`, or false for none. The sphere within the slice is held in a box as wide as its widest circle
 * there, and each of the box's edges is taken through the lens at the depth that puts it farthest out, down to the
 * nearest any point lies, so the first slice holds every point nearer than the slices begin.
 */
function tilesIn(slice: number, seen: Seen, into: Int16Array, start: number): boolean {
  const { across, upward, ahead, reach } = seen;
  const nearest = SLICE_STARTS[slice];
  const farthest = SLICE_STARTS[slice + 1];
  const gap = ahead < nearest ? nearest - ahead : ahead > farthest ? ahead - farthest : 0;
  if (gap >= reach) return false;
  const wide = Math.sqrt(reach * reach - gap * gap);
  const from = Math.max(nearest, ahead - reach, NEAREST_AHEAD);
  const to = Math.min(farthest, ahead + reach);
  const left = screenEdge(across - wide, from, to, seen.acrossScale, true);
  const right = screenEdge(across + wide, from, to, seen.acrossScale, false);
  const bottom = screenEdge(upward - wide, from, to, seen.upScale, true);
  const top = screenEdge(upward + wide, from, to, seen.upScale, false);
  if (left > 1 || right < -1 || bottom > 1 || top < -1) return false;
  into[start] = tileOf(left, CLUSTER_GRID.columns);
  into[start + 1] = tileOf(right, CLUSTER_GRID.columns);
  into[start + 2] = tileOf(bottom, CLUSTER_GRID.rows);
  into[start + 3] = tileOf(top, CLUSTER_GRID.rows);
  return true;
}

/**
 * The clusters as the page builds them each frame and the shader reads them, kept from frame to frame so a frame
 * allocates nothing: a word for each cluster, where its list starts past the clusters' words and, from bit 24, how
 * long it is; then the lists, each light by its place among the frame's lights.
 */
export class LightClusters {
  readonly words = new Uint32Array(CLUSTER_COUNT + MOST_LISTED);
  /** How many entries the last build listed in all: the words past the clusters' to upload. */
  listed = 0;
  private readonly lengths = new Uint16Array(CLUSTER_COUNT);
  /** Each light's tiles in each slice between the build's two passes, a first column of -1 for none. */
  private readonly tiles: Int16Array;
  private readonly seen: Seen = { across: 0, upward: 0, ahead: 0, reach: 0, acrossScale: 0, upScale: 0 };

  /** Room for `mostLights` lights, under 256, so a list's length fits its word. */
  constructor(mostLights: number) {
    this.tiles = new Int16Array(Math.min(mostLights, 255) * CLUSTER_GRID.slices * 4);
  }

  /**
   * Lists `lights` by the clusters each reaches, seen from `eye` through `fromEye`, a centred perspective as
   * `fromEyeMatrix` makes: its first two rows across and up the screen, its last how far ahead. False when the lists
   * would not fit, and every fragment is lit by every light.
   */
  build(lights: readonly Light[], fromEye: Float32Array, eye: Point): boolean {
    const { lengths, tiles, words, seen } = this;
    const { columns, rows, slices } = CLUSTER_GRID;
    const lens = fromEye;
    const count = Math.min(lights.length, tiles.length / (slices * 4));
    seen.acrossScale = Math.hypot(lens[0], lens[4], lens[8]);
    seen.upScale = Math.hypot(lens[1], lens[5], lens[9]);
    lengths.fill(0);
    this.listed = 0;
    let listed = 0;
    for (let index = 0; index < count; index++) {
      const { at, burning } = lights[index];
      const east = at[0] - eye[0];
      const south = at[1] - eye[1];
      const up = at[2] - eye[2];
      seen.across = (lens[0] * east + lens[4] * south + lens[8] * up) / seen.acrossScale;
      seen.upward = (lens[1] * east + lens[5] * south + lens[9] * up) / seen.upScale;
      seen.ahead = lens[3] * east + lens[7] * south + lens[11] * up;
      seen.reach = burning.reach + REACH_MARGIN_M;
      for (let slice = 0; slice < slices; slice++) {
        const start = (index * slices + slice) * 4;
        if (!tilesIn(slice, seen, tiles, start)) {
          tiles[start] = -1;
          continue;
        }
        for (let tileRow = tiles[start + 2]; tileRow <= tiles[start + 3]; tileRow++)
          for (let column = tiles[start]; column <= tiles[start + 1]; column++)
            lengths[column + (tileRow + slice * rows) * columns]++;
        listed += (tiles[start + 1] - tiles[start] + 1) * (tiles[start + 3] - tiles[start + 2] + 1);
      }
    }
    if (listed > MOST_LISTED) return false;
    // Each cluster's list starts where the one before it ends; its length counts up again as it is written.
    let first = 0;
    for (let cluster = 0; cluster < CLUSTER_COUNT; cluster++) {
      words[cluster] = first | (lengths[cluster] << LENGTH_SHIFT);
      first += lengths[cluster];
      lengths[cluster] = 0;
    }
    for (let index = 0; index < count; index++) {
      for (let slice = 0; slice < slices; slice++) {
        const start = (index * slices + slice) * 4;
        if (tiles[start] < 0) continue;
        for (let tileRow = tiles[start + 2]; tileRow <= tiles[start + 3]; tileRow++)
          for (let column = tiles[start]; column <= tiles[start + 1]; column++) {
            const cluster = column + (tileRow + slice * rows) * columns;
            words[CLUSTER_COUNT + (words[cluster] & LIST_START) + lengths[cluster]++] = index;
          }
      }
    }
    this.listed = listed;
    return true;
  }
}

/** The same clusters in WGSL: `reaching(point)` names the lights that can reach a point, its cluster's list read from
 *  `clusters` or, in a frame whose lists did not fit, every light the view holds; `reaching_light` the nth of them. */
export const CLUSTER_WGSL = /* wgsl */ `
const CLUSTER_COLUMNS = ${CLUSTER_GRID.columns}.0;
const CLUSTER_ROWS = ${CLUSTER_GRID.rows}.0;
const CLUSTER_SLICES = ${CLUSTER_GRID.slices}.0;
const CLUSTER_COUNT = ${CLUSTER_COUNT}u;
const SLICES_NEAR = ${SLICE_DEPTHS.near};
const SLICES_PER_LOG = ${SLICES_PER_LOG};
const LIST_START = ${LIST_START}u;
const LENGTH_SHIFT = ${LENGTH_SHIFT}u;

// The cluster a point lies in, by where the eye's matrix takes it: across and up the screen before the divide, and how
// far ahead.
fn cluster_at(across: f32, upward: f32, ahead: f32) -> u32 {
  let column = clamp(floor((across / ahead + 1.0) * 0.5 * CLUSTER_COLUMNS), 0.0, CLUSTER_COLUMNS - 1.0);
  let row = clamp(floor((upward / ahead + 1.0) * 0.5 * CLUSTER_ROWS), 0.0, CLUSTER_ROWS - 1.0);
  let slice = clamp(floor(log(ahead / SLICES_NEAR) * SLICES_PER_LOG), 0.0, CLUSTER_SLICES - 1.0);
  return u32(column + (row + slice * CLUSTER_ROWS) * CLUSTER_COLUMNS);
}

// The lights that can reach a point: where they start among the clusters' words, how many, and 1 to read them there;
// or, in a frame whose lists did not fit, every light the view holds, in its order.
fn reaching(point: vec3f) -> vec3u {
  if view.lights.z < 0.5 {
    return vec3u(0u, u32(view.lights.x), 0u);
  }
  let clip = view.from_eye * vec4f(point - view.eye.xyz, 1.0);
  let word = clusters[cluster_at(clip.x, clip.y, max(clip.w, ${NEAREST_AHEAD}))];
  return vec3u(CLUSTER_COUNT + (word & LIST_START), word >> LENGTH_SHIFT, 1u);
}

// The number among the view's lights of the \`order\`th of those \`span\` names.
fn reaching_light(span: vec3u, order: u32) -> u32 {
  if span.z == 0u {
    return order;
  }
  return clusters[span.x + order];
}
`;
