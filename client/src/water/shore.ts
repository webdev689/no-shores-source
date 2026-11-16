import type { GroundPatch, Swell } from '../rules/landRules.ts';
import { heldSplineAt } from './spline.ts';
import { swellHeight } from './swell.ts';

/** The breakers' tuning, one swell rolling in to every shore. The GPU draws them from these same numbers. */
export const SHORE = {
  /** Seconds between breakers. */
  periodS: 9,
  /** Their height where they start to feel the bottom, metres, and that depth. */
  heightM: 0.9,
  fromDepthM: 8,
  /** They grow in from this depth. */
  startDepthM: 12,
  /** A wave breaks once its height reaches this share of the depth. */
  breakRatio: 0.78,
  /** How high a spent wave runs up the beach, metres, and the travel time over which that reach fades, seconds. */
  runUpM: 0.35,
  swashS: 5,
  /** The swash climbs the beach at this speed, metres a second: the travel time past the waterline. */
  climbMs: 3,
} as const;

export const GRAVITY = 9.81;
/** Fresh water is drawn this far under its level: a river's banks stand at its level for metres, and the land, not
 *  the water, should win there. */
export const FRESH_SINK_M = 0.05;
/** Between the samples, still water this high or more is fresh; lower, it is the sea's level under a bank. */
export const FRESH_LEVEL_M = 0.01;
/** A sample's distance past fresh water's edge where none is near, as the land's door gives it. */
export const FAR_FROM_FRESH_M = 1e6;
/** Travel times stop here, seconds: past it no breaker is drawn and the swell rolls on alone. */
const LONGEST_TRAVEL_S = 400;
/** The slow clock the breakers' groups drift by, seconds: the GPU's floats keep their precision under it. */
export const SLOW_CLOCK_S = 3600;

/** The water round the close-up, one value a sample of its patch. */
export interface ShoreField {
  readonly left: number;
  readonly top: number;
  readonly step: number;
  readonly width: number;
  readonly height: number;
  /** The seabed and ground, metres. */
  readonly heights: Float32Array;
  /** Where still water stands and its edge, two floats a sample (stillLevels). */
  readonly levels: Float32Array;
  /** Four floats a sample: a breaker's travel time to the waterline (seconds, negative up the beach), its slope east
   *  and south (seconds a metre), and 1 where the sample is sea. */
  readonly shore: Float32Array;
}

/** A queue of samples by time, smallest first. */
class Queue {
  private readonly times: number[] = [];
  private readonly samples: number[] = [];

  get size(): number {
    return this.times.length;
  }

  push(time: number, sample: number): void {
    let place = this.times.length;
    this.times.push(time);
    this.samples.push(sample);
    while (place > 0) {
      const parent = (place - 1) >> 1;
      if ((this.times[parent] ?? 0) <= time) break;
      this.swap(place, parent);
      place = parent;
    }
  }

  pop(): [number, number] {
    const top: [number, number] = [this.times[0] ?? 0, this.samples[0] ?? 0];
    const lastTime = this.times.pop() ?? 0;
    const lastSample = this.samples.pop() ?? 0;
    if (this.times.length === 0) return top;
    [this.times[0], this.samples[0]] = [lastTime, lastSample];
    let place = 0;
    for (;;) {
      const [left, right] = [place * 2 + 1, place * 2 + 2];
      let least = place;
      if (left < this.times.length && (this.times[left] ?? 0) < (this.times[least] ?? 0)) least = left;
      if (right < this.times.length && (this.times[right] ?? 0) < (this.times[least] ?? 0)) least = right;
      if (least === place) return top;
      this.swap(place, least);
      place = least;
    }
  }

  private swap(first: number, second: number): void {
    [this.times[first], this.times[second]] = [this.times[second] ?? 0, this.times[first] ?? 0];
    [this.samples[first], this.samples[second]] = [this.samples[second] ?? 0, this.samples[first] ?? 0];
  }
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * The quickest time from the waterline to each sample of one side of it (the sea, or the land), crossing a sample at
 * `slowness` seconds a metre: Dijkstra over the samples and their eight neighbours. A sample beside the waterline
 * starts at the time to the point between them where the ground crosses 0.
 */
function timesFromWaterline(
  patch: Pick<ShoreField, 'width' | 'height' | 'step' | 'heights'>,
  isSea: Uint8Array,
  side: 0 | 1,
  slowness: (sample: number) => number,
): Float64Array {
  const { width, height, step, heights } = patch;
  const times = new Float64Array(width * height).fill(Infinity);
  const queue = new Queue();
  for (let sample = 0; sample < times.length; sample++) {
    if (isSea[sample] !== side) continue;
    const [column, row] = [sample % width, Math.floor(sample / width)];
    for (const [across, down] of NEIGHBOURS.slice(0, 4)) {
      const [nextColumn, nextRow] = [column + across, row + down];
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
      const other = nextRow * width + nextColumn;
      if (isSea[other] === side) continue;
      const [here, there] = [heights[sample] ?? 0, heights[other] ?? 0];
      const share = Math.abs(here) / Math.max(1e-6, Math.abs(here) + Math.abs(there));
      times[sample] = Math.min(times[sample] ?? Infinity, share * step * slowness(sample));
    }
    if (Number.isFinite(times[sample])) queue.push(times[sample] ?? 0, sample);
  }
  while (queue.size > 0) {
    const [time, sample] = queue.pop();
    if (time > (times[sample] ?? 0)) continue;
    const [column, row] = [sample % width, Math.floor(sample / width)];
    for (const [across, down] of NEIGHBOURS) {
      const [nextColumn, nextRow] = [column + across, row + down];
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
      const other = nextRow * width + nextColumn;
      if (isSea[other] !== side) continue;
      const length = step * Math.hypot(across, down);
      const next = time + (length * (slowness(sample) + slowness(other))) / 2;
      if (next < (times[other] ?? Infinity)) {
        times[other] = next;
        queue.push(next, other);
      }
    }
  }
  return times;
}

/**
 * The water round a close-up: where it stands, and how the breakers travel in. A breaker's speed is shallow water's,
 * the square root of gravity times depth, so its crests (the moments it takes to reach the waterline) bunch up as the
 * sea shoals and bend round a headland.
 */
export function shoreField(patch: GroundPatch): ShoreField {
  const { width, height, step, heights, water } = patch;
  const count = width * height;
  const isSea = new Uint8Array(count);
  for (let sample = 0; sample < count; sample++)
    isSea[sample] = (heights[sample] ?? 0) < 0 && !(water[sample] ?? 0) ? 1 : 0;
  const field = { width, height, step, heights };
  const seaTimes = timesFromWaterline(
    field,
    isSea,
    1,
    (sample) => 1 / Math.sqrt(GRAVITY * Math.max(0.3, -(heights[sample] ?? 0))),
  );
  const landTimes = timesFromWaterline(field, isSea, 0, () => 1 / SHORE.climbMs);
  const raw = new Float64Array(count);
  for (let sample = 0; sample < count; sample++) {
    raw[sample] = isSea[sample]
      ? Math.min(seaTimes[sample] ?? Infinity, LONGEST_TRAVEL_S)
      : -Math.min(landTimes[sample] ?? Infinity, LONGEST_TRAVEL_S);
  }
  // One pass of a box blur within each side smooths the steps eight directions leave in the fronts.
  const travel = new Float64Array(count);
  for (let sample = 0; sample < count; sample++) {
    const [column, row] = [sample % width, Math.floor(sample / width)];
    let [sum, weight] = [raw[sample] ?? 0, 1];
    for (const [across, down] of NEIGHBOURS) {
      const [nextColumn, nextRow] = [column + across, row + down];
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
      const other = nextRow * width + nextColumn;
      if (isSea[other] !== isSea[sample]) continue;
      sum += raw[other] ?? 0;
      weight += 1;
    }
    travel[sample] = sum / weight;
  }
  const shore = new Float32Array(count * 4);
  for (let sample = 0; sample < count; sample++) {
    const [column, row] = [sample % width, Math.floor(sample / width)];
    const travelAt = (nextColumn: number, nextRow: number) =>
      travel[Math.min(height - 1, Math.max(0, nextRow)) * width + Math.min(width - 1, Math.max(0, nextColumn))] ?? 0;
    const span = (low: number, high: number) => (high - low) * step;
    const east =
      (travelAt(column + 1, row) - travelAt(column - 1, row)) /
      span(Math.max(0, column - 1), Math.min(width - 1, column + 1));
    const south =
      (travelAt(column, row + 1) - travelAt(column, row - 1)) /
      span(Math.max(0, row - 1), Math.min(height - 1, row + 1));
    const value = travel[sample] ?? 0;
    const capped = Math.abs(value) >= LONGEST_TRAVEL_S - 1;
    shore.set([value, capped ? 0 : east, capped ? 0 : south, isSea[sample] ?? 0], sample * 4);
  }
  const levels = stillLevels(heights, water, patch.edges, width, height, 2);
  return { left: patch.left, top: patch.top, step, width, height, heights, levels, shore };
}

/**
 * Each sample's still water as two floats: fresh water's surface, carried `rings` samples past its wet samples (0, the
 * sea's level under all land, elsewhere), and how far past the water's edge the sample lies, metres. `edges` are the
 * land's own (rivers and lakes alike); without them a sample's edge is its height above the carried surface, a lake's
 * shore. Drawn, the surface dips under the land as far as the edge runs past it, so the waterline lies on the edge
 * itself, smooth wherever the samples fall. A lake's 1 km cells carry it one ring, as far as the land's lakes reach.
 */
export function stillLevels(
  heights: Float32Array,
  water: Float32Array,
  edges: Float32Array | null,
  width: number,
  height: number,
  rings: number,
): Float32Array {
  let levels = Float32Array.from(water, (surface) => Math.max(0, surface));
  for (let pass = 0; pass < rings; pass++) {
    const next = levels.slice();
    for (let sample = 0; sample < levels.length; sample++) {
      if ((levels[sample] ?? 0) > 0) continue;
      const [column, row] = [sample % width, Math.floor(sample / width)];
      for (const [across, down] of NEIGHBOURS) {
        const [nextColumn, nextRow] = [column + across, row + down];
        if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
        next[sample] = Math.max(next[sample] ?? 0, levels[nextRow * width + nextColumn] ?? 0);
      }
    }
    levels = next;
  }
  const out = new Float32Array(levels.length * 2);
  for (const [sample, level] of levels.entries()) {
    // The land's own edge wherever it gives one, carried or not, so the edge runs on smoothly past the carried level.
    const edge = edges?.[sample] ?? (level > 0 ? (heights[sample] ?? 0) - level : FAR_FROM_FRESH_M);
    out.set([level, edge], sample * 2);
  }
  return out;
}

const smoothstep = (low: number, high: number, value: number) => {
  const fraction = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return fraction * fraction * (3 - 2 * fraction);
};

/** A breaker's profile through one period, `phase` 0..1 from its crest: the back falls slowly, the face (the last
 *  `face` of the period) rises fast. 1 at the crest, -1 in the trough. */
export function breakerProfile(phase: number, face: number): number {
  if (phase < 1 - face) return 1 - 2 * smoothstep(0, 1, phase / (1 - face));
  return -1 + 2 * smoothstep(0, 1, (phase - (1 - face)) / face);
}

/** How the breakers along a shore rise and fall in sets, about 1 at (x, y) metres from the patch's corner. */
export function breakerSets(x: number, y: number, time: number): number {
  const slow = time % SLOW_CLOCK_S;
  return 1 + 0.25 * Math.sin(0.019 * x + 0.13 * slow) * Math.sin(0.023 * y - 0.09 * slow);
}

/** The breakers at a point `travel` seconds from the waterline in water `depth` metres deep (0 up the beach), with
 *  `sets` from breakerSets, at `time`: the water's height from still water and how broken it is, 0 to 1. */
export function breaker(travel: number, depth: number, sets: number, time: number): { height: number; broken: number } {
  const turn = ((time % SHORE.periodS) + travel) / SHORE.periodS;
  const phase = turn - Math.floor(turn);
  const shoal = 1 - smoothstep(1.5, SHORE.fromDepthM, depth);
  const profile = breakerProfile(phase, 0.5 - 0.36 * shoal);
  const grow = 1 - smoothstep(SHORE.fromDepthM, SHORE.startDepthM, depth);
  const swell = SHORE.heightM * sets * grow * (SHORE.fromDepthM / Math.max(depth, 0.3)) ** 0.25;
  const limit = SHORE.breakRatio * Math.max(depth, 0);
  const broken = smoothstep(0.75, 1, swell / Math.max(limit, 1e-3));
  const swash = SHORE.runUpM * sets * (0.5 + 0.5 * profile) * Math.exp(-Math.abs(travel) / SHORE.swashS);
  return { height: 0.5 * Math.min(swell, limit) * profile + swash, broken };
}

/** What water is at a point of the close-up: none, the sea or fresh water, its surface now (waves and all) and the
 *  bed under it. Null off the close-up. */
export function waterUnder(
  field: ShoreField,
  swell: Swell | undefined,
  world: { readonly x: number; readonly y: number },
  time: number,
): { kind: 'dry' | 'sea' | 'fresh'; surface: number; bed: number } | null {
  const [gridX, gridY] = [(world.x - field.left) / field.step, (world.y - field.top) / field.step];
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  if (column < 0 || row < 0 || column >= field.width - 1 || row >= field.height - 1) return null;
  const [across, down] = [gridX - column, gridY - row];
  const weights = [(1 - across) * (1 - down), across * (1 - down), (1 - across) * down, across * down];
  const corners = [row * field.width + column, row * field.width + column + 1];
  corners.push((corners[0] ?? 0) + field.width, (corners[1] ?? 0) + field.width);
  const blend = (values: ArrayLike<number>, stride = 1, offset = 0) =>
    corners.reduce((sum, sample, index) => sum + (weights[index] ?? 0) * (values[sample * stride + offset] ?? 0), 0);
  const bed = heldSplineAt(field.heights, field.width, field.height, gridX, gridY);
  const level = blend(field.levels, 2, 0);
  // As the GPU's still_at: fresh water dipping under the sea's level is the sea's.
  const freshSurface = level - FRESH_SINK_M - Math.max(0, blend(field.levels, 2, 1));
  if (level > FRESH_LEVEL_M && freshSurface > 0) {
    return { kind: freshSurface > bed ? 'fresh' : 'dry', surface: freshSurface, bed };
  }
  const depth = Math.max(0, -bed);
  const sets = breakerSets(world.x - field.left, world.y - field.top, time);
  const shore = breaker(blend(field.shore, 4, 0), depth, sets, time).height;
  const surface = (swell ? swellHeight(swell, world.x, world.y, time, depth) : 0) + shore;
  return { kind: surface > bed ? 'sea' : 'dry', surface, bed };
}
