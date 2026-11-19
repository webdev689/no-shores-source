import { SKY_WGSL } from '../sky/skyUniform.ts';
import { HULLS } from './hullMask.ts';
import { FRESH_LEVEL_M, FRESH_SINK_M, SHORE } from './shore.ts';

/** The most swell waves the GPU sums; crates/land/src/sea.rs makes ten. The wind's chop is twelve more. */
export const MOST_WAVES = 12;
export const CHOP_WAVES = 12;
/**
 * Noise is read at points measured from an anchor, a whole number of ANCHOR_M from the window's corner, near the
 * eye: GPU floats hold centimetres there. The noise repeats every 256 cells and every noise scale is a whole number
 * of quarters, so moving the anchor never moves the pattern.
 */
export const ANCHOR_M = 1024;
/** The land crate's coast blend (ground.rs COAST_BLEND_M) and the floor it keeps either side (SHORE_FLOOR_M), metres. */
export const COAST_BLEND_M = 1000;
export const SHORE_FLOOR_M = 0.5;
/** How far from the coast its distance is kept (relief.rs COAST_REACH_M), metres; further cells hold this. */
export const COAST_REACH_M = 6000;

/** The cells of a window, row by row: each one's height, distance from the painted coast and height carried over it. */
export interface WideCells {
  readonly width: number;
  readonly heights: Float32Array;
  readonly coast: Float32Array;
  readonly across: Float32Array;
}

/** The texels of the 1 km land's texture (rgba32float, read by WGSL wide_ground) for a rectangle of cells, row by
 *  row: height, distance from the coast, height carried over the coast, 0. */
export function wideTexels(
  cells: WideCells,
  rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): Float32Array {
  const { left, top, right, bottom } = rect;
  const width = right - left;
  const out = new Float32Array(width * (bottom - top) * 4);
  for (let row = top; row < bottom; row++) {
    for (let column = left; column < right; column++) {
      const [from, to] = [row * cells.width + column, ((row - top) * width + column - left) * 4];
      out[to] = cells.heights[from] ?? 0;
      out[to + 1] = cells.coast[from] ?? 0;
      out[to + 2] = cells.across[from] ?? 0;
    }
  }
  return out;
}

/**
 * Noise, the sky and the caustics: the WGSL the water and the land under it share. `cells` is cellular noise (the
 * distances to the nearest two of one jittered point a cell), each point dancing on its own clock when `time` moves.
 * Points are measured from the anchor (ANCHOR_M).
 */
export const SHARED_WGSL = /* wgsl */ `
const TAU = 6.2831853;
${SKY_WGSL}

fn hash2(cell: vec2f) -> vec2f {
  var bits = vec2u(vec2i(floor(cell)) & vec2i(255));
  bits = bits * 1664525u + 1013904223u;
  bits.x += bits.y * 1664525u;
  bits.y += bits.x * 1664525u;
  bits = bits ^ (bits >> vec2u(16u));
  bits.x += bits.y * 1664525u;
  bits.y += bits.x * 1664525u;
  bits = bits ^ (bits >> vec2u(16u));
  return vec2f(bits) / 4294967295.0;
}

fn value_noise(point: vec2f) -> f32 {
  let base = floor(point);
  let fraction = point - base;
  let ease = fraction * fraction * (3.0 - 2.0 * fraction);
  let top = mix(hash2(base).x, hash2(base + vec2f(1.0, 0.0)).x, ease.x);
  let bottom = mix(hash2(base + vec2f(0.0, 1.0)).x, hash2(base + vec2f(1.0, 1.0)).x, ease.x);
  return mix(top, bottom, ease.y);
}

fn cells(unbent: vec2f, time: f32) -> vec2f {
  // Bent by noise at the cells' own scale, so their walls are curves and never meet in straight-edged shards.
  let bend = vec2f(value_noise(unbent + vec2f(17.0, 3.0)), value_noise(unbent + vec2f(41.0, 29.0))) - 0.5;
  let finer = vec2f(value_noise(unbent * 2.0 + vec2f(7.0, 11.0)), value_noise(unbent * 2.0 + vec2f(23.0, 5.0))) - 0.5;
  let point = unbent + bend * 0.75 + finer * 0.3;
  let base = floor(point);
  let fraction = point - base;
  var nearest = vec2f(8.0);
  for (var row = -1; row <= 1; row++) {
    for (var column = -1; column <= 1; column++) {
      let offset = vec2f(f32(column), f32(row));
      let seed = hash2(base + offset);
      let dancing = 0.5 + 0.42 * sin(time * (0.6 + seed.yx) + TAU * seed);
      let distance_to = length(offset + dancing - fraction);
      if (distance_to < nearest.x) {
        nearest = vec2f(distance_to, nearest.x);
      } else if (distance_to < nearest.y) {
        nearest.y = distance_to;
      }
    }
  }
  return nearest;
}

// Light gathered by the rippling surface into a net of bright lines on the bed: two dancing cell layers' edges.
fn caustics(point: vec2f, time: f32) -> f32 {
  let first = cells(point * 0.5, time * 0.9);
  let second = cells(point * 1.25 + vec2f(5.3, 1.7), time * 1.25);
  let lines = 1.0 - smoothstep(0.0, 0.16, first.y - first.x);
  let finer = 1.0 - smoothstep(0.0, 0.11, second.y - second.x);
  return lines * 0.75 + finer * 0.45 + lines * finer;
}

const FRESH_SINK = ${FRESH_SINK_M};
const COAST_BLEND = ${COAST_BLEND_M.toFixed(1)};
const SHORE_FLOOR = ${SHORE_FLOOR_M};
const COAST_REACH = ${COAST_REACH_M.toFixed(1)};
const FRESH_LEVEL = ${FRESH_LEVEL_M};

// The value of a grid of samples at 'at', in samples from sample (0, 0), along Catmull-Rom splines through them (the
// land crate's own cubic), and its slope a sample east and south. Held between the lowest and the highest of the
// four samples round it (spline.ts heldSplineAt): a cubic through a pad's sheer step overshoots it by about 7 %.
fn spline_at(grid: texture_2d<f32>, at: vec2f) -> vec3f {
  let last = vec2i(textureDimensions(grid)) - 1;
  let base = floor(at);
  let t = at - base;
  let t2 = t * t;
  let t3 = t2 * t;
  var weights = array<vec2f, 4>(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2);
  var slopes = array<vec2f, 4>(-1.5 * t2 + 2.0 * t - 0.5, 4.5 * t2 - 5.0 * t, -4.5 * t2 + 4.0 * t + 0.5, 1.5 * t2 - t);
  var out = vec3f(0.0);
  var low = 3.4e38;
  var high = -3.4e38;
  for (var row = 0; row < 4; row++) {
    for (var column = 0; column < 4; column++) {
      let value = textureLoad(grid, clamp(vec2i(base) + vec2i(column - 1, row - 1), vec2i(0), last), 0).r;
      out += value * vec3f(weights[column].x * weights[row].y, slopes[column].x * weights[row].y, weights[column].x * slopes[row].y);
      if ((row == 1 || row == 2) && (column == 1 || column == 2)) {
        low = min(low, value);
        high = max(high, value);
      }
    }
  }
  let held = clamp(out.x, low, high);
  return select(out, vec3f(held, 0.0, 0.0), held != out.x);
}

// A height and its slope kept softly at SHORE_FLOOR or more: unchanged from twice that up, eased onto it below.
fn above_floor(value: vec3f) -> vec3f {
  let share = clamp(0.5 + 0.5 * (value.x - SHORE_FLOOR) / SHORE_FLOOR, 0.0, 1.0);
  return vec3f(mix(SHORE_FLOOR, value.x, share) + SHORE_FLOOR * share * (1.0 - share), value.yz * share);
}

// The 1 km land at 'at': height, slope a cell and distance from the painted coast, as the land crate's ground has it
// (ground.rs coast_meet): each cell holds its height, its distance from the painted coast (metres, positive on land)
// and its height carried over the coast from the other side. The land and the sea are splined apart, neither stepping
// at the coast, and met along the painted line, so the coast follows the line between the cells, never their squares.
struct Wide {
  // Height, slope a cell (a metre from ground_at) and metres from the painted coast.
  ground: vec4f,
  // The land's and the sea's own heights here, which the coast meets (coast_meet).
  sides: vec2f,
};

// The land and the sea met along the painted coast, 'distance' metres inland of it: ground.rs coast_meet.
fn coast_meet(land: f32, sea: f32, distance: f32) -> f32 {
  let near = smoothstep(0.0, COAST_BLEND, abs(distance));
  let side = 2.0 * smoothstep(-COAST_BLEND, COAST_BLEND, distance) - 1.0;
  return 0.5 * (land * (near + side) + sea * (near - side));
}

fn wide_ground(grid: texture_2d<f32>, at: vec2f) -> Wide {
  let last = vec2i(textureDimensions(grid)) - 1;
  let base = floor(at);
  let t = at - base;
  let t2 = t * t;
  let t3 = t2 * t;
  var weights = array<vec2f, 4>(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2);
  var slopes = array<vec2f, 4>(-1.5 * t2 + 2.0 * t - 0.5, 4.5 * t2 - 5.0 * t, -4.5 * t2 + 4.0 * t + 0.5, 1.5 * t2 - t);
  var land = vec3f(0.0);
  var sea = vec3f(0.0);
  var coast = vec3f(0.0);
  for (var row = 0; row < 4; row++) {
    for (var column = 0; column < 4; column++) {
      let cell = textureLoad(grid, clamp(vec2i(base) + vec2i(column - 1, row - 1), vec2i(0), last), 0).rgb;
      let weight = vec3f(weights[column].x * weights[row].y, slopes[column].x * weights[row].y, weights[column].x * slopes[row].y);
      let on_land = cell.r > 0.0;
      land += select(cell.b, cell.r, on_land) * weight;
      sea += select(cell.r, cell.b, on_land) * weight;
      coast += cell.g * weight;
    }
  }
  land = above_floor(land);
  sea = -above_floor(-sea);
  let near_at = clamp(abs(coast.x) / COAST_BLEND, 0.0, 1.0);
  let near = near_at * near_at * (3.0 - 2.0 * near_at);
  let near_slope = 6.0 * near_at * (1.0 - near_at) / COAST_BLEND * sign(coast.x);
  let side_at = clamp(0.5 + 0.5 * coast.x / COAST_BLEND, 0.0, 1.0);
  let side = 2.0 * side_at * side_at * (3.0 - 2.0 * side_at) - 1.0;
  let side_slope = 6.0 * side_at * (1.0 - side_at) / COAST_BLEND;
  let height = 0.5 * (land.x * (near + side) + sea.x * (near - side));
  let along = 0.5 * (land.x * (near_slope + side_slope) + sea.x * (near_slope - side_slope));
  let slope = 0.5 * (land.yz * (near + side) + sea.yz * (near - side)) + along * coast.yz;
  return Wide(vec4f(height, slope, coast.x), vec2f(land.x, sea.x));
}

// How much of a point is the close-up's: 1 inside it, easing to 0 across its outer 24 samples (0 with none shown).
fn close_share(close: texture_2d<f32>, close_at: vec2f, shown: bool) -> f32 {
  let size = vec2f(textureDimensions(close)) - 1.0;
  let inside = min(min(close_at.x, close_at.y), min(size.x - close_at.x, size.y - close_at.y));
  return select(0.0, smoothstep(1.0, 24.0, inside), shown);
}

// The ground at a point: height, slope a metre and distance from the painted coast. The close-up's spline is eased
// into the 1 km land's by 'share', so the two never meet in a step. 'wide_at' and 'close_at' are the point in each
// grid's samples.
fn ground_at(wide: texture_2d<f32>, wide_at: vec2f, cell: f32, close: texture_2d<f32>, close_at: vec2f, step: f32, share: f32) -> Wide {
  var far = wide_ground(wide, wide_at);
  far.ground *= vec4f(1.0, 1.0 / cell, 1.0 / cell, 1.0);
  if (share <= 0.0) { return far; }
  let near = spline_at(close, close_at) * vec3f(1.0, 1.0 / step, 1.0 / step);
  return Wide(vec4f(mix(far.ground.xyz, near, share), far.ground.w), far.sides);
}

// The value a grid holds at 'at', in samples from sample (0, 0), between its four nearest.
fn grid_at(grid: texture_2d<f32>, at: vec2f) -> vec4f {
  let last = vec2i(textureDimensions(grid)) - 1;
  let base = vec2i(floor(at));
  let fraction = at - floor(at);
  let a = textureLoad(grid, clamp(base, vec2i(0), last), 0);
  let b = textureLoad(grid, clamp(base + vec2i(1, 0), vec2i(0), last), 0);
  let c = textureLoad(grid, clamp(base + vec2i(0, 1), vec2i(0), last), 0);
  let d = textureLoad(grid, clamp(base + vec2i(1, 1), vec2i(0), last), 0);
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}

// The still water at a point: its level and 1 where it is fresh. The levels hold shore.ts's stillLevels (a surface
// and the edge, metres past it); past the edge the surface dips under the land as far as the edge runs, so the
// waterline lies on the edge between the samples. Fresh water is drawn FRESH_SINK under its own level; the sea at 0.
// Where the dip takes fresh water under the sea's level, the point is the sea's: dry land hides either, and a dip
// running far past a lake never drags the sea beside it under its bed. Also the level before the dip (z), where
// the water's mesh lies, its edge drawn by the pixel; and how far past the edge the point lies (w).
fn still_at(wide_levels: texture_2d<f32>, wide_at: vec2f, close_levels: texture_2d<f32>, close_at: vec2f, share: f32) -> vec4f {
  let still = mix(grid_at(wide_levels, wide_at).rg, grid_at(close_levels, close_at).rg, share);
  let surface = still.x - FRESH_SINK - max(still.y, 0.0);
  let fresh = still.x > FRESH_LEVEL && surface > 0.0;
  return vec4f(select(0.0, surface, fresh), select(0.0, 1.0, fresh), select(0.0, still.x - FRESH_SINK, fresh), still.y);
}

// How much of a pixel is under still water: across a pixel's rise of the ground ('across', metres) where the water
// stands 'over' it; in the close-up, fresh water's own edge (the land's, to the metre) rather than the ground's
// crossing of its level, which a river's sharp channel would set wavering between the samples.
// The edge is taken FRESH_SINK in, where the water is drawn, and no further out than 10 m, so where it runs off to
// "far from fresh water" its change across a pixel stays a step's, not a leap's.
fn wet_share(over: f32, across: f32, still: vec4f, share: f32) -> f32 {
  let by_ground = smoothstep(-0.5, 0.5, over / max(across, 0.02));
  let edge = min(still.w, 10.0) + FRESH_SINK;
  let by_edge = smoothstep(-0.5, 0.5, -edge / max(fwidth(edge), 1e-3));
  return mix(by_ground, by_edge, share * still.y);
}

// How much of the four samples round 'at' carry a mark (marks.ts), between 'first' and 'last' kinds: a soft edge
// along the samples, never their square.
fn marked(marks: texture_2d<u32>, at: vec2f, first: u32, last: u32) -> f32 {
  let top = vec2i(textureDimensions(marks)) - 1;
  let base = vec2i(floor(at));
  let fraction = at - floor(at);
  var cover = 0.0;
  for (var corner_index = 0; corner_index < 4; corner_index++) {
    let offset = vec2i(corner_index & 1, corner_index >> 1);
    let mark = textureLoad(marks, clamp(base + offset, vec2i(0), top), 0).r;
    let share = mix(1.0 - fraction.x, fraction.x, f32(offset.x)) * mix(1.0 - fraction.y, fraction.y, f32(offset.y));
    cover += select(0.0, share, mark >= first && mark <= last);
  }
  return smoothstep(0.3, 0.7, cover);
}

// The sky along 'direction'. 'blur' is how far apart, in radians, the rays a pixel gathers are: a reflection off
// waves too small to draw gathers a cone of them, so the clouds' detail finer than that averages out.
fn sky(direction: vec3f, slow_time: f32, blur: f32) -> vec3f {
  let up = direction.z;
  let zenith = sky_state.zenith.rgb;
  let horizon = sky_state.horizon.rgb;
  var colour = mix(horizon, zenith, sqrt(clamp(up, 0.0, 1.0)));
  colour = mix(colour, horizon * vec3f(0.58, 0.68, 0.78), 1.0 - smoothstep(-0.3, 0.0, up));
  if (up > 0.0) {
    let plane = direction.xy / (up + 0.08) * 0.9 + vec2f(slow_time * 0.004, slow_time * 0.0013);
    // How far the blur moves a point on the clouds' plane, furthest near the horizon, and each octave's share kept.
    let reach = blur * 0.9 / ((up + 0.08) * (up + 0.08));
    let keep = vec3f(1.0) - smoothstep(vec3f(0.25), vec3f(1.0), reach * vec3f(1.0, 2.3, 5.1));
    let weights = vec3f(0.55, 0.3, 0.15) * keep;
    let octaves = vec3f(value_noise(plane), value_noise(plane * 2.3), value_noise(plane * 5.1)) - 0.5;
    let puff = 0.5 + dot(weights, octaves);
    // The detail averaged away softens the clouds' edge, so however blurred they keep their mean cover (a sixth).
    let lost = length(vec3f(0.55, 0.3, 0.15) - weights) * 0.27;
    let cover = smoothstep(0.52 - lost, 0.78 + lost, puff) * smoothstep(0.0, 0.25, up);
    colour = mix(colour, vec3f(0.97, 0.97, 0.99) * (0.86 + 0.14 * puff), cover * 0.9);
  }
  let toward = max(dot(direction, sky_state.sun.xyz), 0.0);
  let sun_light = select(vec3f(0.0), sky_state.key_light.rgb, sky_state.sun.z > -0.02);
  return colour + sun_light * (pow(toward, 900.0) * 16.0 + pow(toward, 14.0) * 0.16);
}
`;

/**
 * The water's own WGSL: the frame every water pass reads, the swell, the breakers, the ripples and the foam. The
 * breakers' numbers are shore.ts's, so the drawn sea and a swimmer's bob come from the same tuning.
 */
export const WATER_WGSL = /* wgsl */ `
struct Frame {
  from_eye: mat4x4f,
  eye: vec4f,
  forward: vec4f,
  right: vec4f,
  up: vec4f,
  depth_terms: vec4f,
  view: vec4f,
  patch_area: vec4f,
  coarse_area: vec4f,
  grid: vec4f,
  ripple_area: vec4f,
  swell_terms: vec4f,
  local: vec4f,
  waves: array<vec4f, ${MOST_WAVES * 2}>,
  chop: array<vec4f, ${CHOP_WAVES}>,
  // Each ship's footprint: her middle from the eye, and the sine and cosine of her heading; then her fitted half
  // length and half beam, her way, and whether she is there.
  hulls: array<vec4f, ${HULLS * 2}>,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var scene_colour: texture_2d<f32>;
@group(0) @binding(2) var scene_depth: texture_2d<f32>;
@group(0) @binding(3) var coarse_heights: texture_2d<f32>;
@group(0) @binding(4) var coarse_lakes: texture_2d<f32>;
@group(0) @binding(5) var patch_heights: texture_2d<f32>;
@group(0) @binding(6) var patch_levels: texture_2d<f32>;
@group(0) @binding(7) var patch_shore: texture_2d<f32>;
@group(0) @binding(8) var ripples: texture_2d<f32>;
@group(0) @binding(9) var smooth_sampler: sampler;

const BREAK_PERIOD = ${SHORE.periodS}.0;
const BREAK_HEIGHT = ${SHORE.heightM};
const BREAK_FROM = ${SHORE.fromDepthM}.0;
const BREAK_START = ${SHORE.startDepthM}.0;
const BREAK_RATIO = ${SHORE.breakRatio};
const RUN_UP = ${SHORE.runUpM};
const SWASH_TIME = ${SHORE.swashS}.0;

const SEA_ABSORB = vec3f(0.42, 0.085, 0.06);
const SEA_BODY = vec3f(0.012, 0.15, 0.21);
const SEA_GLOW = vec3f(0.10, 0.60, 0.52);
const FRESH_ABSORB = vec3f(0.55, 0.24, 0.30);
const FRESH_BODY = vec3f(0.05, 0.19, 0.17);
const FOAM = vec3f(0.93, 0.96, 0.97);

// A point 'offset' metres from the eye in the close-up's samples (measured from the eye, for the floats' sake) and
// in the 1 km land's.
fn close_at(offset: vec2f) -> vec2f {
  return (offset + frame.local.zw) / frame.patch_area.z;
}

fn wide_at(offset: vec2f) -> vec2f {
  return (frame.eye.xy + offset) / frame.coarse_area.x - 0.5;
}

// How far inside the close-up a point lies, in samples; negative outside it or with none.
fn inside_patch(offset: vec2f) -> f32 {
  if (frame.patch_area.w < 0.5) { return -1.0; }
  let at = close_at(offset);
  let size = vec2f(textureDimensions(patch_heights)) - 1.0;
  return min(min(at.x, at.y), min(size.x - at.x, size.y - at.y));
}

struct Water {
  bed: f32,
  level: f32,
  fresh: bool,
};

// The bed and the water's still level at a point, read as the land's own drawing reads them: fresh water's level
// before its dip, as its mesh lies flat and its edge is drawn by the pixel.
fn water_at(offset: vec2f) -> Water {
  let share = close_share(patch_heights, close_at(offset), frame.patch_area.w > 0.5);
  let ground = ground_at(coarse_heights, wide_at(offset), frame.coarse_area.x, patch_heights, close_at(offset), frame.patch_area.z, share);
  let still = still_at(coarse_lakes, wide_at(offset), patch_levels, close_at(offset), share);
  return Water(ground.ground.x, still.z, still.y > 0.0);
}

fn reach(depth: f32) -> f32 {
  return smoothstep(frame.swell_terms.y, frame.swell_terms.x, depth);
}

struct Swell {
  shift: vec2f,
  height: f32,
  slope: vec2f,
  stretch: vec3f,
};

// The swell at the water whose rest is 'offset' metres from the eye: sea.rs's waves, each fading where 'footprint'
// (the metres a vertex or a pixel spans) is too coarse to hold it. 'stretch' holds the sideways carry's slopes.
fn swell_at(offset: vec2f, depth: f32, footprint: f32) -> Swell {
  var swell: Swell;
  let share = reach(depth);
  if (share <= 0.0) { return swell; }
  let count = u32(frame.swell_terms.z);
  for (var index = 0u; index < count; index++) {
    let first = frame.waves[index * 2u];
    let second = frame.waves[index * 2u + 1u];
    let fade = smoothstep(footprint * 2.5, footprint * 6.0, TAU / first.z) * share;
    if (fade <= 0.0) { continue; }
    let angle = first.z * dot(first.xy, offset) + first.w;
    let sine = sin(angle);
    let cosine = cos(angle);
    let amplitude = second.x * fade;
    let shift = second.y * fade;
    swell.shift += shift * first.xy * cosine;
    swell.height += amplitude * sine;
    swell.slope += amplitude * first.z * first.xy * cosine;
    let pinch = shift * first.z * sine;
    swell.stretch -= pinch * vec3f(first.x * first.x, first.y * first.y, first.x * first.y);
  }
  return swell;
}

fn swell_normal(swell: Swell) -> vec3f {
  let along_x = vec3f(1.0 + swell.stretch.x, swell.stretch.z, swell.slope.x);
  let along_y = vec3f(swell.stretch.z, 1.0 + swell.stretch.y, swell.slope.y);
  return normalize(cross(along_x, along_y));
}

fn breaker_profile(phase: f32, face: f32) -> vec2f {
  if (phase < 1.0 - face) {
    let along = phase / (1.0 - face);
    return vec2f(1.0 - 2.0 * smoothstep(0.0, 1.0, along), -12.0 * along * (1.0 - along) / (1.0 - face));
  }
  let along = (phase - (1.0 - face)) / face;
  return vec2f(-1.0 + 2.0 * smoothstep(0.0, 1.0, along), 12.0 * along * (1.0 - along) / face);
}

struct Breaker {
  height: f32,
  broken: f32,
  phase: f32,
  face: f32,
  slope: vec2f,
  toward_shore: vec2f,
};

// The breakers at a point of the close-up in water 'depth' deep (0 up the beach): shore.ts's breaker, with the
// slope its travel time gives, faded out toward the close-up's edge and where 'footprint' metres are too coarse.
fn breaker_at(offset: vec2f, depth: f32, footprint: f32) -> Breaker {
  var breaker: Breaker;
  let inside = inside_patch(offset);
  if (inside < 1.0) { return breaker; }
  let shore = grid_at(patch_shore, close_at(offset));
  let local = close_at(offset) * frame.patch_area.z;
  let slow = frame.eye.w;
  let sets = 1.0 + 0.25 * sin(0.019 * local.x + 0.13 * slow) * sin(0.023 * local.y - 0.09 * slow);
  let turn = (frame.swell_terms.w + shore.x) / BREAK_PERIOD;
  breaker.phase = fract(turn);
  let shoal = 1.0 - smoothstep(1.5, BREAK_FROM, depth);
  breaker.face = 0.5 - 0.36 * shoal;
  let profile = breaker_profile(breaker.phase, breaker.face);
  let grow = 1.0 - smoothstep(BREAK_FROM, BREAK_START, depth);
  let rising = BREAK_HEIGHT * sets * grow * pow(BREAK_FROM / max(depth, 0.3), 0.25);
  let limit = BREAK_RATIO * max(depth, 0.0);
  breaker.broken = smoothstep(0.75, 1.0, rising / max(limit, 0.001));
  let wave = min(rising, limit);
  let swash = RUN_UP * sets * exp(-abs(shore.x) / SWASH_TIME);
  let edge = smoothstep(1.0, 12.0, inside) * (1.0 - smoothstep(2.0, 10.0, footprint));
  breaker.height = (0.5 * wave * profile.x + swash * (0.5 + 0.5 * profile.x)) * edge;
  breaker.slope = (0.5 * wave + 0.5 * swash) * profile.y / BREAK_PERIOD * shore.yz * edge;
  breaker.toward_shore = -normalize(shore.yz + vec2f(1e-6, 0.0));
  breaker.broken *= edge;
  return breaker;
}

// The ripples bodies stir, at a point 'offset' metres from the eye (the field's corner is measured from the eye too,
// since its cells are finer than a float's step this far from the window's corner): their height and slope,
// metres; nothing outside the field.
fn ripple_at(offset: vec2f) -> vec3f {
  let size = frame.ripple_area.w;
  let step = frame.ripple_area.z;
  let from_corner = (offset - frame.ripple_area.xy) / step;
  let inside = min(min(from_corner.x, from_corner.y), min(size - from_corner.x, size - from_corner.y));
  if (inside < 2.0) { return vec3f(0.0); }
  // Cell centres lie half a cell in; slopes are taken over two cells either way, so the cells do not show in the light.
  let at = from_corner - 0.5;
  let across = step * 2.0;
  let height = grid_at(ripples, at).r;
  let east = grid_at(ripples, at + vec2f(2.0, 0.0)).r - grid_at(ripples, at - vec2f(2.0, 0.0)).r;
  let south = grid_at(ripples, at + vec2f(0.0, 2.0)).r - grid_at(ripples, at - vec2f(0.0, 2.0)).r;
  return vec3f(height, east / (2.0 * across), south / (2.0 * across)) * smoothstep(2.0, 16.0, inside);
}

// The wind's small waves on the surface, too small for the mesh: their slope at a point from the anchor. Each has
// a whole number of waves along the anchor's step. Rivers carry theirs downstream with their 'flow' (metres a
// second); 'calm' scales them, 1 at sea.
fn chop_slope(local: vec2f, flow: vec2f, calm: f32, footprint: f32) -> vec2f {
  let time = frame.eye.w;
  var slope = vec2f(0.0);
  for (var index = 0; index < ${CHOP_WAVES}; index++) {
    let wave = frame.chop[index];
    let number = length(wave.xy);
    let fade = smoothstep(footprint * 1.5, footprint * 4.0, TAU / number);
    let angle = dot(wave.xy, local - flow * time) - wave.z * time + wave.w;
    // Strengths from 0.55 to 1.15 of the mean, so no two waves cross evenly into a grid.
    let strength = 0.55 + 0.6 * fract(f32(index) * 0.754877 + 0.31);
    slope += wave.xy / number * cos(angle) * 0.042 * strength * fade * calm;
  }
  return slope;
}

// Foam's lace: high inside the bubbles' cells, low along their walls, drifting with 'drift'. Where 'amount' is small
// only the walls show; where it is 1 the foam is solid.
fn foam_cover(local: vec2f, drift: vec2f, amount: f32, footprint: f32) -> f32 {
  let time = frame.eye.w;
  let warp = (vec2f(value_noise(local * 0.25), value_noise(local * 0.25 + vec2f(31.0, 17.0))) - 0.5) * 3.2
    + (vec2f(value_noise(local * 1.0), value_noise(local * 1.0 + vec2f(5.0, 9.0))) - 0.5) * 0.9;
  let large = cells(local * 0.75 + drift + warp, time * 0.35);
  let small = cells(local * 2.5 - drift * 1.6 + warp * 2.0 + vec2f(13.0, 7.0), time * 0.6);
  // Each scale of lace gives way to its mean as a pixel's footprint nears its cells (1.3 m, 0.4 m), so cells smaller
  // than a pixel never sparkle.
  let walls = mix(smoothstep(0.0, 0.55, large.y - large.x), 0.6, smoothstep(0.3, 0.9, footprint));
  let froth = mix(smoothstep(0.0, 0.3, small.y - small.x), 0.75, smoothstep(0.08, 0.3, footprint));
  let patches = value_noise(local * 0.5 + drift * 0.6 + warp * 0.5);
  let pattern = walls * 0.42 + froth * 0.26 + patches * 0.32;
  // The lace's edge is at least a pixel wide, so it never flickers where its cells grow small on screen.
  let soft = max(0.2, fwidth(pattern) * 1.5);
  return (1.0 - smoothstep(amount - soft * 0.8, amount + soft * 0.2, pattern)) * smoothstep(0.04, 0.2, amount);
}

// The ray from the eye through a pixel, its forward part 1, so a depth's forward distance scales it.
fn ray_through(pixel: vec2f) -> vec3f {
  let ndc = vec2f(pixel.x / frame.view.x * 2.0 - 1.0, 1.0 - pixel.y / frame.view.y * 2.0);
  let half = frame.forward.w;
  return frame.forward.xyz + frame.right.xyz * ndc.x * half * frame.right.w + frame.up.xyz * ndc.y * half;
}

// How far the scene drawn so far lies from the eye at a pixel, metres along the ray; a huge distance for the sky.
fn scene_distance(pixel: vec2f) -> f32 {
  let depth = textureLoad(scene_depth, vec2i(pixel), 0).r;
  if (depth <= 0.0) { return 1e9; }
  let forward = frame.depth_terms.y / (depth + frame.depth_terms.x);
  return forward * length(ray_through(pixel));
}

fn aerial(colour: vec3f, direction: vec3f, distance_to: f32) -> vec3f {
  let haze = 1.0 - exp(-distance_to / frame.view.z);
  return mix(colour, sky(vec3f(direction.xy, max(direction.z, 0.02)), frame.eye.w, 0.0) * 0.95, haze);
}

// Light seen through 'distance_to' metres of water 'below' metres under its surface: the light the water scatters
// back, deeper blue the deeper it is, and the sun's shafts.
fn underwater_light(fresh: bool, below: f32) -> vec3f {
  let body = select(SEA_BODY, FRESH_BODY, fresh);
  return body * (2.4 * sky_level() + 1.2 * key_toward().z * sky_state.key.w) * exp(-0.045 * max(below, 0.0));
}

fn through_water(colour: vec3f, fresh: bool, below: f32, distance_to: f32) -> vec3f {
  let absorb = select(SEA_ABSORB, FRESH_ABSORB, fresh) * 0.55 + vec3f(0.035);
  let kept = exp(-absorb * distance_to);
  return colour * kept + underwater_light(fresh, below) * (1.0 - kept);
}
`;
