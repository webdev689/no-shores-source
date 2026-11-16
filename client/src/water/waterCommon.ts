import { FRESH_SINK_M, GRAVITY, SHORE, SLOW_CLOCK_S } from './shore.ts';

/** The most swell waves the GPU sums; crates/land/src/sea.rs makes ten. The wind's chop is eight more. */
export const MOST_WAVES = 12;
export const CHOP_WAVES = 8;
/**
 * Noise is read at points measured from an anchor, a whole number of ANCHOR_M from the window's corner, near the
 * eye: GPU floats hold centimetres there. The noise repeats every 256 cells and every noise scale is a whole number
 * of quarters, so moving the anchor never moves the pattern.
 */
export const ANCHOR_M = 1024;

/**
 * Noise, the sky and the caustics: the WGSL the water and the land under it share. `cells` is cellular noise (the
 * distances to the nearest two of one jittered point a cell), each point dancing on its own clock when `time` moves.
 * Points are measured from the anchor (ANCHOR_M).
 */
export const SHARED_WGSL = /* wgsl */ `
const TAU = 6.2831853;
const SUN = vec3f(-0.5417, 0.5417, 0.6428);
const SUN_LIGHT = vec3f(1.0, 0.94, 0.82);
const ZENITH = vec3f(0.20, 0.42, 0.80);
const HORIZON = vec3f(0.70, 0.81, 0.92);

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

fn cells(point: vec2f, time: f32) -> vec2f {
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

fn sky(direction: vec3f, slow_time: f32) -> vec3f {
  let up = direction.z;
  var colour = mix(HORIZON, ZENITH, sqrt(clamp(up, 0.0, 1.0)));
  colour = mix(colour, HORIZON * vec3f(0.58, 0.68, 0.78), 1.0 - smoothstep(-0.3, 0.0, up));
  if (up > 0.0) {
    let plane = direction.xy / (up + 0.08) * 0.9 + vec2f(slow_time * 0.004, slow_time * 0.0013);
    let puff = value_noise(plane) * 0.55 + value_noise(plane * 2.3) * 0.3 + value_noise(plane * 5.1) * 0.15;
    let cover = smoothstep(0.52, 0.78, puff) * smoothstep(0.0, 0.25, up);
    colour = mix(colour, vec3f(0.97, 0.97, 0.99) * (0.86 + 0.14 * puff), cover * 0.9);
  }
  let toward = max(dot(direction, SUN), 0.0);
  return colour + SUN_LIGHT * (pow(toward, 900.0) * 16.0 + pow(toward, 14.0) * 0.16);
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
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var scene_colour: texture_2d<f32>;
@group(0) @binding(2) var scene_depth: texture_depth_2d;
@group(0) @binding(3) var coarse_heights: texture_2d<f32>;
@group(0) @binding(4) var coarse_lakes: texture_2d<f32>;
@group(0) @binding(5) var patch_heights: texture_2d<f32>;
@group(0) @binding(6) var patch_levels: texture_2d<f32>;
@group(0) @binding(7) var patch_shore: texture_2d<f32>;
@group(0) @binding(8) var ripples: texture_2d<f32>;
@group(0) @binding(9) var smooth_sampler: sampler;

const GRAVITY = ${GRAVITY};
const SLOW_CLOCK = ${SLOW_CLOCK_S}.0;
const BREAK_PERIOD = ${SHORE.periodS}.0;
const BREAK_HEIGHT = ${SHORE.heightM};
const BREAK_FROM = ${SHORE.fromDepthM}.0;
const BREAK_START = ${SHORE.startDepthM}.0;
const BREAK_RATIO = ${SHORE.breakRatio};
const RUN_UP = ${SHORE.runUpM};
const SWASH_TIME = ${SHORE.swashS}.0;
const FRESH_SINK = ${FRESH_SINK_M};

const SEA_ABSORB = vec3f(0.42, 0.085, 0.06);
const SEA_BODY = vec3f(0.012, 0.15, 0.21);
const SEA_GLOW = vec3f(0.10, 0.60, 0.52);
const FRESH_ABSORB = vec3f(0.55, 0.24, 0.30);
const FRESH_BODY = vec3f(0.05, 0.19, 0.17);
const FOAM = vec3f(0.93, 0.96, 0.97);

// The value a grid of samples holds at a point of the window, between its four nearest: the grid's sample (0, 0)
// lies at 'corner', 'step' metres apart.
fn grid_at(grid: texture_2d<f32>, point: vec2f, corner: vec2f, step: f32) -> vec4f {
  let last = vec2i(textureDimensions(grid)) - 1;
  let at = (point - corner) / step;
  let base = vec2i(floor(at));
  let fraction = at - floor(at);
  let a = textureLoad(grid, clamp(base, vec2i(0), last), 0);
  let b = textureLoad(grid, clamp(base + vec2i(1, 0), vec2i(0), last), 0);
  let c = textureLoad(grid, clamp(base + vec2i(0, 1), vec2i(0), last), 0);
  let d = textureLoad(grid, clamp(base + vec2i(1, 1), vec2i(0), last), 0);
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}

// Fresh water's level at a point, and 1 where any of the four nearest samples holds some (0 and 0 where none does).
// A wet sample gives its level; a dry one standing at least that high (a bank) carries it, so the land draws the
// waterline; a dry one lower down (ground beside a river that runs above it) sinks the surface under itself.
fn fresh_at(grid: texture_2d<f32>, beds: texture_2d<f32>, point: vec2f, corner: vec2f, step: f32) -> vec2f {
  let last = vec2i(textureDimensions(grid)) - 1;
  let at = (point - corner) / step;
  let base = vec2i(floor(at));
  let fraction = at - floor(at);
  var levels: array<f32, 4>;
  var shares: array<f32, 4>;
  var weight = 0.0;
  var sum = 0.0;
  for (var corner_index = 0; corner_index < 4; corner_index++) {
    let offset = vec2i(corner_index & 1, corner_index >> 1);
    levels[corner_index] = textureLoad(grid, clamp(base + offset, vec2i(0), last), 0).r;
    shares[corner_index] = mix(1.0 - fraction.x, fraction.x, f32(offset.x)) * mix(1.0 - fraction.y, fraction.y, f32(offset.y));
    if (levels[corner_index] > 0.0) {
      weight += shares[corner_index];
      sum += shares[corner_index] * levels[corner_index];
    }
  }
  if (weight <= 0.0) { return vec2f(0.0); }
  let wet = sum / weight;
  var surface = 0.0;
  for (var corner_index = 0; corner_index < 4; corner_index++) {
    let offset = vec2i(corner_index & 1, corner_index >> 1);
    let bed = textureLoad(beds, clamp(base + offset, vec2i(0), last), 0).r;
    let dry = select(bed - 1.0, wet, bed >= wet - FRESH_SINK);
    surface += shares[corner_index] * select(dry, levels[corner_index], levels[corner_index] > 0.0);
  }
  return vec2f(surface, 1.0);
}

// How far inside the close-up a point lies, in samples; negative outside it or with none.
fn inside_patch(point: vec2f) -> f32 {
  if (frame.patch_area.w < 0.5) { return -1.0; }
  let at = (point - frame.patch_area.xy) / frame.patch_area.z;
  let size = vec2f(textureDimensions(patch_heights)) - 1.0;
  return min(min(at.x, at.y), min(size.x - at.x, size.y - at.y));
}

struct Water {
  bed: f32,
  level: f32,
  fresh: bool,
};

// The bed and the water's still level at a point: the close-up's where it reaches, the 1 km land's elsewhere.
fn water_at(point: vec2f) -> Water {
  var water: Water;
  if (inside_patch(point) > 1.0) {
    let step = frame.patch_area.z;
    water.bed = grid_at(patch_heights, point, frame.patch_area.xy, step).r;
    let fresh = fresh_at(patch_levels, patch_heights, point, frame.patch_area.xy, step);
    water.level = fresh.x;
    water.fresh = fresh.y > 0.0;
  } else {
    let corner = vec2f(frame.coarse_area.x * 0.5);
    water.bed = grid_at(coarse_heights, point, corner, frame.coarse_area.x).r;
    let fresh = fresh_at(coarse_lakes, coarse_heights, point, corner, frame.coarse_area.x);
    water.level = fresh.x;
    water.fresh = fresh.y > 0.0;
  }
  water.level = select(0.0, water.level - FRESH_SINK, water.fresh);
  return water;
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
fn breaker_at(point: vec2f, depth: f32, footprint: f32) -> Breaker {
  var breaker: Breaker;
  let inside = inside_patch(point);
  if (inside < 1.0) { return breaker; }
  let shore = grid_at(patch_shore, point, frame.patch_area.xy, frame.patch_area.z);
  let local = point - frame.patch_area.xy;
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
  let point = offset;
  let size = frame.ripple_area.w;
  let at = (point - frame.ripple_area.xy) / frame.ripple_area.z;
  let inside = min(min(at.x, at.y), min(size - at.x, size - at.y));
  if (inside < 2.0) { return vec3f(0.0); }
  let corner = frame.ripple_area.xy + vec2f(frame.ripple_area.z * 0.5);
  let step = frame.ripple_area.z;
  // Slopes over two cells either way, so the cells' corners do not show in the light.
  let across = step * 2.0;
  let height = grid_at(ripples, point, corner, step).r;
  let east = grid_at(ripples, point + vec2f(across, 0.0), corner, step).r - grid_at(ripples, point - vec2f(across, 0.0), corner, step).r;
  let south = grid_at(ripples, point + vec2f(0.0, across), corner, step).r - grid_at(ripples, point - vec2f(0.0, across), corner, step).r;
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
    slope += wave.xy / number * cos(angle) * 0.05 * fade * calm;
  }
  return slope;
}

// Foam's lace: high inside the bubbles' cells, low along their walls, drifting with 'drift'. Where 'amount' is small
// only the walls show; where it is 1 the foam is solid.
fn foam_cover(local: vec2f, drift: vec2f, amount: f32) -> f32 {
  let time = frame.eye.w;
  let warp = (vec2f(value_noise(local * 0.25), value_noise(local * 0.25 + vec2f(31.0, 17.0))) - 0.5) * 3.2
    + (vec2f(value_noise(local * 1.0), value_noise(local * 1.0 + vec2f(5.0, 9.0))) - 0.5) * 0.9;
  let large = cells(local * 0.75 + drift + warp, time * 0.35);
  let small = cells(local * 2.5 - drift * 1.6 + warp * 2.0 + vec2f(13.0, 7.0), time * 0.6);
  let walls = smoothstep(0.0, 0.55, large.y - large.x);
  let froth = smoothstep(0.0, 0.3, small.y - small.x);
  let patches = value_noise(local * 0.5 + drift * 0.6 + warp * 0.5);
  let pattern = walls * 0.42 + froth * 0.26 + patches * 0.32;
  return (1.0 - smoothstep(amount - 0.16, amount + 0.04, pattern)) * smoothstep(0.04, 0.2, amount);
}

// The ray from the eye through a pixel, its forward part 1, so a depth's forward distance scales it.
fn ray_through(pixel: vec2f) -> vec3f {
  let ndc = vec2f(pixel.x / frame.view.x * 2.0 - 1.0, 1.0 - pixel.y / frame.view.y * 2.0);
  let half = frame.forward.w;
  return frame.forward.xyz + frame.right.xyz * ndc.x * half * frame.right.w + frame.up.xyz * ndc.y * half;
}

// How far the scene drawn so far lies from the eye at a pixel, metres along the ray; a huge distance for the sky.
fn scene_distance(pixel: vec2f) -> f32 {
  let depth = textureLoad(scene_depth, vec2i(pixel), 0);
  if (depth <= 0.0) { return 1e9; }
  let forward = frame.depth_terms.y / (depth + frame.depth_terms.x);
  return forward * length(ray_through(pixel));
}

fn aerial(colour: vec3f, direction: vec3f, distance_to: f32) -> vec3f {
  let haze = 1.0 - exp(-distance_to / frame.view.z);
  return mix(colour, sky(vec3f(direction.xy, max(direction.z, 0.02)), frame.eye.w) * 0.95, haze);
}

// Light seen through 'distance_to' metres of water 'below' metres under its surface: the light the water scatters
// back, deeper blue the deeper it is, and the sun's shafts.
fn underwater_light(fresh: bool, below: f32) -> vec3f {
  let body = select(SEA_BODY, FRESH_BODY, fresh);
  return body * (2.4 + 1.2 * SUN.z) * exp(-0.045 * max(below, 0.0));
}

fn through_water(colour: vec3f, fresh: bool, below: f32, distance_to: f32) -> vec3f {
  let absorb = select(SEA_ABSORB, FRESH_ABSORB, fresh) * 0.55 + vec3f(0.035);
  let kept = exp(-absorb * distance_to);
  return colour * kept + underwater_light(fresh, below) * (1.0 - kept);
}
`;
