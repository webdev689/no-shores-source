import type { GroundPatch, LandView } from '../rules/landRules.ts';
import { FAR_FROM_FRESH_M, FRESH_LEVEL_M, FRESH_SINK_M, stillLevels } from '../water/shore.ts';
import { heldSplineAt } from '../water/spline.ts';
import { COAST_BLEND_M, SHORE_FLOOR_M } from '../water/waterCommon.ts';

/** What water stands at a point. */
export type WaterKind = 'dry' | 'sea' | 'lake' | 'river';
/** What a point is marked with: nothing, a road (3), a town (4) or a port (5), as the land's door marks them. */
export type GroundMark = 0 | 3 | 4 | 5;

/** The ground at a world point, as the scatter reads it. */
export interface GroundAt {
  /** Metres, as the land is drawn there. */
  readonly height: number;
  /** Rise over run. */
  readonly slope: number;
  readonly water: WaterKind;
  readonly mark: GroundMark;
  /** Metres inland of the sea's coast, when the source knows it; unknown counts as far. */
  readonly coastM?: number;
  /** Metres from the nearest fresh water's edge, when the source knows it; unknown counts as far. */
  readonly freshM?: number;
  /** The ground's rise a metre east and south, when the source knows it; unknown counts as level. */
  readonly rise?: readonly [number, number];
}

/** The ground at a world point (metres east and south). */
export type GroundSampler = (x: number, y: number) => GroundAt;
/** Whether the caller keeps a world point clear: a city, a node's plaza. */
export type Cleared = (x: number, y: number) => boolean;

/** Hermite smoothstep, as WGSL's. */
export const smooth = (low: number, high: number, value: number) => {
  const share = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return share * share * (3 - 2 * share);
};

/** A height and its slope held softly at the shore's floor or more, as the land crate and the GPU hold them. */
function aboveFloor(height: number, east: number, south: number): [number, number, number] {
  const share = Math.min(1, Math.max(0, 0.5 + (0.5 * (height - SHORE_FLOOR_M)) / SHORE_FLOOR_M));
  const held = SHORE_FLOOR_M + (height - SHORE_FLOOR_M) * share + SHORE_FLOOR_M * share * (1 - share);
  return [held, east * share, south * share];
}

const SPLINE = (t: number) => [
  -0.5 * t ** 3 + t * t - 0.5 * t,
  1.5 * t ** 3 - 2.5 * t * t + 1,
  -1.5 * t ** 3 + 2 * t * t + 0.5 * t,
  0.5 * t ** 3 - 0.5 * t * t,
];
const SPLINE_SLOPE = (t: number) => [
  -1.5 * t * t + 2 * t - 0.5,
  4.5 * t * t - 5 * t,
  -4.5 * t * t + 4 * t + 0.5,
  1.5 * t * t - t,
];

/**
 * The 1 km land at a world point as the GPU draws it (waterCommon.ts wide_ground): the land and the seabed splined
 * apart through the cells and met along the painted coast. Its height, slope a metre east and south, and metres from
 * the coast.
 */
export function wideGround(view: LandView, x: number, y: number): [number, number, number, number] {
  const [atX, atY] = [(x - view.leftM) / view.cellM - 0.5, (y - view.topM) / view.cellM - 0.5];
  const [column, row] = [Math.floor(atX), Math.floor(atY)];
  const [across, down] = [atX - column, atY - row];
  const [weightsX, weightsY, slopesX, slopesY] = [
    SPLINE(across),
    SPLINE(down),
    SPLINE_SLOPE(across),
    SPLINE_SLOPE(down),
  ];
  const [land, sea, coast] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let step = 0; step < 4; step++) {
    const cellRow = Math.min(view.height - 1, Math.max(0, row + step - 1));
    for (let side = 0; side < 4; side++) {
      const cell = cellRow * view.width + Math.min(view.width - 1, Math.max(0, column + side - 1));
      const [height, distance, carried] = [view.heights[cell] ?? 0, view.coast[cell] ?? 0, view.across[cell] ?? 0];
      const weight = [
        (weightsX[side] ?? 0) * (weightsY[step] ?? 0),
        (slopesX[side] ?? 0) * (weightsY[step] ?? 0),
        (weightsX[side] ?? 0) * (slopesY[step] ?? 0),
      ];
      for (let part = 0; part < 3; part++) {
        land[part] = (land[part] ?? 0) + (height > 0 ? height : carried) * (weight[part] ?? 0);
        sea[part] = (sea[part] ?? 0) + (height > 0 ? carried : height) * (weight[part] ?? 0);
        coast[part] = (coast[part] ?? 0) + distance * (weight[part] ?? 0);
      }
    }
  }
  const [landHeight, landEast, landSouth] = aboveFloor(land[0] ?? 0, land[1] ?? 0, land[2] ?? 0);
  const seaHeld = aboveFloor(-(sea[0] ?? 0), -(sea[1] ?? 0), -(sea[2] ?? 0)).map((value) => -value);
  const [seaHeight = 0, seaEast = 0, seaSouth = 0] = seaHeld;
  const distance = coast[0] ?? 0;
  const nearAt = Math.min(1, Math.abs(distance) / COAST_BLEND_M);
  const near = nearAt * nearAt * (3 - 2 * nearAt);
  const nearSlope = ((6 * nearAt * (1 - nearAt)) / COAST_BLEND_M) * Math.sign(distance);
  const sideAt = Math.min(1, Math.max(0, 0.5 + (0.5 * distance) / COAST_BLEND_M));
  const side = 2 * sideAt * sideAt * (3 - 2 * sideAt) - 1;
  const sideSlope = (6 * sideAt * (1 - sideAt)) / COAST_BLEND_M;
  const height = 0.5 * (landHeight * (near + side) + seaHeight * (near - side));
  const along = 0.5 * (landHeight * (nearSlope + sideSlope) + seaHeight * (nearSlope - sideSlope));
  const east = 0.5 * (landEast * (near + side) + seaEast * (near - side)) + along * (coast[1] ?? 0);
  const south = 0.5 * (landSouth * (near + side) + seaSouth * (near - side)) + along * (coast[2] ?? 0);
  return [height, east / view.cellM, south / view.cellM, distance];
}

/** A river's course as the land cuts it: corners cut twice (ground.rs chaikin), each segment's half width. */
interface RiverSegment {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly half: number;
}

/** Rivers' segments by the 1 km buckets they pass within reach of. */
const BUCKET_M = 1000;
/** How far from a river its distance is known: past this, a point is far from it. */
const RIVER_REACH_M = 400;

/** A course's corners cut once, Chaikin's way: each segment's quarter and three-quarter points, its ends kept. */
export function chaikin(points: readonly (readonly number[])[]): number[][] {
  if (points.length < 3) return points.map((point) => [...point]);
  const out: number[][] = [[...(points[0] ?? [])]];
  for (let index = 1; index < points.length; index++) {
    const [from = [], to = []] = [points[index - 1], points[index]];
    out.push(from.map((value, part) => value + ((to[part] ?? 0) - value) * 0.25));
    out.push(from.map((value, part) => value + ((to[part] ?? 0) - value) * 0.75));
  }
  out.push([...(points[points.length - 1] ?? [])]);
  return out;
}

/** The view's rivers, bucketed, and its lakes' still water (shore.ts stillLevels): made once a view. */
interface Waters {
  readonly buckets: Map<string, RiverSegment[]>;
  readonly levels: Float32Array;
}

const waters = new WeakMap<LandView, Waters>();

function watersOf(view: LandView): Waters {
  const known = waters.get(view);
  if (known) return known;
  const buckets = new Map<string, RiverSegment[]>();
  for (const river of view.rivers) {
    const course = chaikin(chaikin(river.points.map(([x, y], index) => [x, y, river.flow[index] ?? 0])));
    for (let index = 1; index < course.length; index++) {
      const [from = [], to = []] = [course[index - 1], course[index]];
      const flow = ((from[2] ?? 0) + (to[2] ?? 0)) / 2;
      const segment: RiverSegment = {
        from: [from[0] ?? 0, from[1] ?? 0],
        to: [to[0] ?? 0, to[1] ?? 0],
        half: (2.4 * Math.sqrt(flow) + 1.5) / 2,
      };
      const pad = segment.half + RIVER_REACH_M;
      const [west, east] = [
        Math.min(segment.from[0], segment.to[0]) - pad,
        Math.max(segment.from[0], segment.to[0]) + pad,
      ];
      const [north, south] = [
        Math.min(segment.from[1], segment.to[1]) - pad,
        Math.max(segment.from[1], segment.to[1]) + pad,
      ];
      for (let row = Math.floor(north / BUCKET_M); row <= Math.floor(south / BUCKET_M); row++) {
        for (let column = Math.floor(west / BUCKET_M); column <= Math.floor(east / BUCKET_M); column++) {
          const key = `${column},${row}`;
          const list = buckets.get(key) ?? [];
          list.push(segment);
          buckets.set(key, list);
        }
      }
    }
  }
  const levels = stillLevels(view.heights, view.lakes, null, view.width, view.height, 1);
  const made = { buckets, levels };
  waters.set(view, made);
  return made;
}

/** How far a point lies outside the nearest river's channel, metres (negative inside); Infinity past its reach. */
function riverEdge(view: LandView, x: number, y: number): number {
  let nearest = Infinity;
  for (const { from, to, half } of watersOf(view).buckets.get(
    `${Math.floor(x / BUCKET_M)},${Math.floor(y / BUCKET_M)}`,
  ) ?? []) {
    const [alongX, alongY] = [to[0] - from[0], to[1] - from[1]];
    const length = alongX * alongX + alongY * alongY;
    const share = length > 0 ? Math.min(1, Math.max(0, ((x - from[0]) * alongX + (y - from[1]) * alongY) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - from[0] - alongX * share, y - from[1] - alongY * share) - half);
  }
  return nearest;
}

/** A grid's value between its four nearest samples; `stride` floats a sample, the `part`th of them. */
function between(
  values: ArrayLike<number>,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
  stride = 1,
  part = 0,
) {
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  const [across, down] = [gridX - column, gridY - row];
  const valueAt = (columnAt: number, rowAt: number) =>
    values[
      (Math.min(height - 1, Math.max(0, rowAt)) * width + Math.min(width - 1, Math.max(0, columnAt))) * stride + part
    ] ?? 0;
  const top = valueAt(column, row) * (1 - across) + valueAt(column + 1, row) * across;
  const bottom = valueAt(column, row + 1) * (1 - across) + valueAt(column + 1, row + 1) * across;
  return top * (1 - down) + bottom * down;
}

/** The lake's surface over a point of the 1 km land, as the GPU's still_at finds it, or null where none stands. */
function lakeAt(view: LandView, x: number, y: number): number | null {
  const [gridX, gridY] = [(x - view.leftM) / view.cellM - 0.5, (y - view.topM) / view.cellM - 0.5];
  const { levels } = watersOf(view);
  const level = between(levels, view.width, view.height, gridX, gridY, 2, 0);
  const surface = level - FRESH_SINK_M - Math.max(0, between(levels, view.width, view.height, gridX, gridY, 2, 1));
  return level > FRESH_LEVEL_M && surface > 0 ? surface : null;
}

/** A shore's rise over run, for how far a point above a lake lies from its water: a gentle bank's. */
const SHORE_RISE = 0.04;

/**
 * The ground the scatter reads, from a landmass's 1 km land and, where it reaches, the exact close patch round the
 * camera (eased into the 1 km land over its outer 24 samples, as the GPU draws it). Inside the patch it knows the
 * roads, towns and ports; beyond, the caller's `cleared` keeps them bare. Make it once per view and patch.
 */
export function landSampler(view: LandView, patch: GroundPatch | null): GroundSampler {
  return (x, y) => {
    const [wideHeight, east, south, coastM] = wideGround(view, x, y);
    let [height, slope, riseEast, riseSouth] = [wideHeight, Math.hypot(east, south), east, south];
    const lake = lakeAt(view, x, y);
    let share = 0;
    let mark: GroundMark = 0;
    let freshEdge: number | null = null;
    if (patch) {
      const [gridX, gridY] = [(x - patch.left) / patch.step, (y - patch.top) / patch.step];
      const inside = Math.min(gridX, gridY, patch.width - 1 - gridX, patch.height - 1 - gridY);
      share = smooth(1, 24, inside);
      if (share > 0) {
        const exact = (atX: number, atY: number) => heldSplineAt(patch.heights, patch.width, patch.height, atX, atY);
        const exactEast = (exact(gridX + 0.5, gridY) - exact(gridX - 0.5, gridY)) / patch.step;
        const exactSouth = (exact(gridX, gridY + 0.5) - exact(gridX, gridY - 0.5)) / patch.step;
        height += (exact(gridX, gridY) - height) * share;
        slope += (Math.hypot(exactEast, exactSouth) - slope) * share;
        riseEast += (exactEast - riseEast) * share;
        riseSouth += (exactSouth - riseSouth) * share;
        const sample = Math.round(gridY) * patch.width + Math.round(gridX);
        const marked = patch.marks[sample] ?? 0;
        if (share > 0.5 && (marked === 3 || marked === 4 || marked === 5)) mark = marked;
        freshEdge = between(patch.edges, patch.width, patch.height, gridX, gridY);
      }
    }
    let water: GroundAt['water'] = 'dry';
    let freshM: number;
    if (share > 0.5 && freshEdge !== null) {
      freshM = freshEdge >= FAR_FROM_FRESH_M / 2 ? Infinity : freshEdge;
      if (freshM < 0) water = lake !== null ? 'lake' : 'river';
      else if (height < 0) water = 'sea';
    } else {
      const river = riverEdge(view, x, y);
      const aboveLake = lake === null ? Infinity : (height - lake) / Math.max(slope, SHORE_RISE);
      freshM = Math.min(river, aboveLake);
      if (coastM < 0 || height < 0) water = 'sea';
      else if (lake !== null && lake > height) water = 'lake';
      else if (river < 0) water = 'river';
    }
    return { height, slope, water, mark, coastM, freshM, rise: [riseEast, riseSouth] };
  };
}
