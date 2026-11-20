// The fires' WGSL. Every part is a quad from one instance, facing the eye, and every part is drawn on a grid of texels
// fixed in metres and coloured from a stepped palette, as the game's pixel-art figures and ships are. A tongue of flame
// is a solid of revolution round its leaning axis, drawn as the outline of that solid seen from the eye, so from
// beside, above or below it keeps its body. Smoke is a rolling ball, lit orange from below while young; a wisp is a
// torn-off bit of flame; an ember is a spark one or two texels square; a glow is the light a fire throws round it,
// drawn only into the light layer, where it reads the scene's depth back into the point drawn at each pixel and lights
// it by how near it stands to the fire, so only what stands round a fire is lit, never the sea or the sky past it.
import { LIGHT } from '../combat/lightLayer.ts';
import { FIRE_TEXELS_PER_METRE } from './flameParts.ts';

/** Each part's kind. */
export const PART = { smoke: 0, tongue: 1, ember: 2, glow: 3, wisp: 4 } as const;
/** The instance's fourth float carries its kind plus this many times its noise seed, one of `NOISE_SEEDS`. */
export const PART_KINDS = 8;
export const NOISE_SEEDS = 997;

export const FLAMES_WGSL = /* wgsl */ `
struct View { from_eye: mat4x4f, to_eye: mat4x4f, time: vec4f }
@group(0) @binding(0) var<uniform> view: View;

struct Part {
  @location(0) place: vec4f,  // from the eye, then the kind and its noise seed
  @location(1) shape: vec4f,  // width or radius, height, then the lean east and south
  @location(2) colour: vec4f, // colour, or what else the kind needs (its frame's moment, its age), then strength
}
struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f, // metres across and up the quad from its middle
  @location(1) colour: vec4f,
  @location(2) @interpolate(flat) kind_seed: vec2f,
  @location(3) @interpolate(flat) light: vec4f, // a glow's fire, from the eye, then its reach
  @location(4) @interpolate(flat) form: vec4f,  // a tongue's width, height, seen length and end-on share; smoke's ups
}

const CORNERS = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
const TEXELS = ${FIRE_TEXELS_PER_METRE.toFixed(1)};

fn mixed(value: u32) -> u32 {
  var state = value * 747796405u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (state >> 22u) ^ state;
}
fn corner_value(cell: vec2f, seed: f32) -> f32 {
  let whole = vec2i(cell);
  return f32(mixed((bitcast<u32>(whole.x) * 1597334677u) ^ mixed(bitcast<u32>(whole.y) ^ u32(seed)))) / 4294967296.0;
}
fn noise2(point: vec2f, seed: f32) -> f32 {
  let base = floor(point);
  let part = point - base;
  let eased = part * part * (3.0 - 2.0 * part);
  return mix(mix(corner_value(base, seed), corner_value(base + vec2f(1.0, 0.0), seed), eased.x),
    mix(corner_value(base + vec2f(0.0, 1.0), seed), corner_value(base + vec2f(1.0, 1.0), seed), eased.x), eased.y);
}
// The middle of the texel a point falls in, on the fire's grid fixed in metres.
fn texel(local: vec2f) -> vec2f {
  return (floor(local * TEXELS) + 0.5) / TEXELS;
}

// The screen's rectangle round a fire's light: every corner of the box round its sphere projected, or the whole
// screen when the eye stands too near the box for that.
fn light_rect(centre: vec3f, reach: f32) -> vec4f {
  var low = vec2f(1.0);
  var high = vec2f(-1.0);
  for (var corner = 0u; corner < 8u; corner++) {
    let signs = vec3f(f32(corner & 1u), f32((corner >> 1u) & 1u), f32((corner >> 2u) & 1u)) * 2.0 - 1.0;
    let clip = view.from_eye * vec4f(centre + signs * reach, 1.0);
    if (clip.w < 0.05) { return vec4f(-1.0, -1.0, 1.0, 1.0); }
    low = min(low, clip.xy / clip.w);
    high = max(high, clip.xy / clip.w);
  }
  return vec4f(clamp(low, vec2f(-1.0), vec2f(1.0)), clamp(high, vec2f(-1.0), vec2f(1.0)));
}

@vertex fn part_vertex(@builtin(vertex_index) index: u32, part: Part) -> Out {
  let corner = CORNERS[index];
  let matrix = view.from_eye;
  let right = normalize(vec3f(matrix[0].x, matrix[1].x, matrix[2].x));
  let up = normalize(vec3f(matrix[0].y, matrix[1].y, matrix[2].y));
  let kind = u32(part.place.w) % ${PART_KINDS}u;
  var out: Out;
  out.colour = part.colour;
  out.kind_seed = vec2f(f32(kind), f32(u32(part.place.w) / ${PART_KINDS}u));
  if (kind == ${PART.glow}u) {
    let rect = light_rect(part.place.xyz, part.shape.x);
    out.position = vec4f(mix(rect.xy, rect.zw, corner * 0.5 + 0.5), 0.5, 1.0);
    out.light = vec4f(part.place.xyz, part.shape.x);
    return out;
  }
  var middle = part.place.xyz;
  var across = right;
  var upward = up;
  var half = vec2f(part.shape.x);
  if (kind == ${PART.tongue}u) {
    // The quad faces the eye from the flame's middle; up it runs the axis as the eye sees it, which shrinks to
    // nothing seen end on, when the flame is drawn as the round it then shows.
    let axis = vec3f(part.shape.zw, 1.0) * part.shape.y;
    middle = part.place.xyz + axis * 0.5;
    let toward = -normalize(middle);
    let seen = axis - toward * dot(axis, toward);
    let length_seen = length(seen);
    if (length_seen > part.shape.y * 0.02) { upward = seen / length_seen; }
    across = normalize(cross(upward, toward));
    let end_on = abs(dot(axis, toward)) / length(axis);
    out.form = vec4f(part.shape.x, part.shape.y, length_seen, end_on);
    half = vec2f(part.shape.x * 1.5, length_seen * 0.5 + part.shape.x * 1.3);
    // Seen end on, the quad stands at the flame's nearer end, not its middle, so a fire sunk into a deck still
    // shows over it from above; it shrinks as it comes nearer so the eye sees it the same size.
    let distance = length(middle);
    let nearer = min(abs(dot(axis, toward)) * 0.5, distance * 0.5);
    let corner_seen = corner * half;
    let shrink = (distance - nearer) / distance;
    let world = middle + toward * nearer + (across * corner_seen.x + upward * corner_seen.y) * shrink;
    out.position = matrix * vec4f(world, 1.0);
    out.local = corner_seen;
    return out;
  } else if (kind == ${PART.ember}u) {
    // A spark never shrinks below about a pixel and a half, so one far off still shows.
    half = vec2f(max(part.shape.x, length(middle) * 0.0007));
  } else if (kind == ${PART.smoke}u) {
    out.form = vec4f(right.z, up.z, -normalize(middle).z, 0.0);
  }
  let world = middle + (across * corner.x * half.x + upward * corner.y * half.y);
  out.position = matrix * vec4f(world, 1.0);
  out.local = corner * half;
  return out;
}

// The fire's palette, stepped as the game's pixel art is: deep red at the rim, through red and orange to a yellow
// and a pale heart. A heat of nothing is no flame.
fn palette(heat: f32) -> vec4f {
  if (heat < 0.06) { return vec4f(0.0); }
  if (heat < 0.24) { return vec4f(0.5, 0.07, 0.03, 1.0); }
  if (heat < 0.46) { return vec4f(0.86, 0.22, 0.04, 1.0); }
  if (heat < 0.68) { return vec4f(1.0, 0.52, 0.09, 1.0); }
  if (heat < 0.86) { return vec4f(1.0, 0.82, 0.3, 1.0); }
  return vec4f(1.0, 0.96, 0.74, 1.0);
}

// How wide a tongue stands a share up its height, in its widths: a teardrop narrowing to its tip.
fn girth(up_share: f32) -> f32 {
  return pow(1.0 - up_share, 0.6) * min(1.0, up_share * 5.0 + 0.35);
}

// A tongue's heat at a texel: the most of each slice of the flame's solid, a ring seen as an ellipse as the eye sees
// it, from its root to its tip. The slice level with the texel draws the flame from beside, the rest from above.
fn tongue_heat(local: vec2f, form: vec4f, seed: f32, time: f32) -> f32 {
  let width = form.x;
  let length_seen = form.z;
  let end_on = form.w;
  let scaled = local / width;
  let lick = (noise2(vec2f(scaled.y * 1.6 - time * 4.5, seed), seed) - 0.5) * 0.9;
  var level = 0.3;
  if (length_seen > width * 0.02) { level = clamp(local.y / length_seen + 0.5, 0.0, 1.0); }
  let point = vec2f(local.x - lick * width * level, local.y);
  var heat = 0.0;
  for (var slice = 0u; slice <= 10u; slice++) {
    var share = f32(slice) / 10.0;
    if (slice == 10u) { share = level; }
    let radius = max(width * girth(share), 1.0e-4);
    let centre = (share - 0.5) * length_seen;
    let depth_seen = max(radius * end_on, length_seen * 0.08);
    let inside = 1.0 - length(vec2f(point.x / radius, (point.y - centre) / depth_seen));
    heat = max(heat, clamp(inside * 1.8, 0.0, 1.0) * (1.0 - 0.7 * share));
  }
  // The flame tears near its tip, holes rising through it.
  let tear = noise2(vec2f(scaled.x * 2.2, scaled.y * 2.2 - time * 6.0), seed + 17.0);
  return heat - max(tear - 0.45, 0.0) * 1.6 * level;
}

fn shaded(in: Out) -> vec4f {
  let kind = u32(in.kind_seed.x);
  let seed = in.kind_seed.y;
  if (kind == ${PART.ember}u) {
    let glow = in.colour.a;
    if (glow < 0.08) { return vec4f(0.0); }
    return palette(0.2 + glow * 0.75);
  }
  let local = texel(in.local);
  if (kind == ${PART.tongue}u) {
    return palette(tongue_heat(local, in.form, seed, in.colour.r));
  }
  let radius = max(in.colour.a, 1.0e-4);
  if (kind == ${PART.wisp}u) {
    // A wisp is a little flame of its own: a drop pointing up, its edge torn.
    let shape = local / radius;
    let drop = vec2f(shape.x / (1.0 - 0.45 * clamp(shape.y, -1.0, 1.0)), shape.y * 0.8 + 0.2);
    let torn = noise2(shape * 2.5 + vec2f(seed, -in.colour.g * 5.0), seed);
    return palette((1.0 - length(drop)) * in.colour.r * 1.5 + (torn - 0.5) * 0.45);
  }
  // Smoke: a ball rolling as it rises, its edge broken; lit orange from below while near the flames, dark grey to
  // black as it climbs, and cut to a few steps of cover so it reads as drawn.
  let age = in.colour.r;
  let warmth = in.colour.g;
  let across = local / max(radius, 1.0e-4);
  let turn = age * 2.5 + seed;
  let rolled = mat2x2f(cos(turn), sin(turn), -sin(turn), cos(turn)) * across;
  let edge = 0.68 + 0.32 * noise2(rolled * 2.4 + vec2f(seed * 1.7, 0.0), seed);
  let reach = length(across) / edge;
  let cover = floor(in.colour.b * 3.0 + 0.5) / 3.0;
  if (reach >= 1.0 || cover <= 0.0) { return vec4f(0.0); }
  let facing = sqrt(max(0.0, 1.0 - reach * reach));
  let normal = across / edge;
  let downward = -(normal.x * in.form.x + normal.y * in.form.y + facing * in.form.z);
  let lit = warmth * clamp(downward * 1.4, 0.0, 1.0);
  var colour = vec3f(0.06, 0.055, 0.055);
  if (age < 0.3) { colour = vec3f(0.19, 0.17, 0.16); } else if (age < 0.6) { colour = vec3f(0.12, 0.11, 0.105); }
  if (downward < -0.45) { colour *= 1.35; }
  if (reach > 0.88) { colour *= 0.6; }
  if (lit > 0.6) { colour = vec3f(0.72, 0.3, 0.08); } else if (lit > 0.3) { colour = vec3f(0.42, 0.16, 0.06); }
  return vec4f(colour * cover, cover);
}

@group(0) @binding(1) var depths: texture_2d<f32>;

// Over the finished picture: hidden where the scene's depth (reversed, nearer is more) stands nearer.
@fragment fn over_fragment(in: Out) -> @location(0) vec4f {
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  let colour = shaded(in);
  if (colour.a <= 0.0) { discard; }
  return colour;
}

// The light pass is a quarter of the picture each way: each of its pixels reads the scene's depth at its block's
// middle, as the light layer's own depth does.
@fragment fn light_fragment(in: Out) -> @location(0) vec4f {
  let size = vec2i(textureDimensions(depths));
  let pixel = min(vec2i(in.position.xy) * ${LIGHT.scale} + ${LIGHT.scale / 2}, size - 1);
  let depth = textureLoad(depths, pixel, 0).r;
  if (depth <= 0.0) { discard; }
  let ndc = (vec2f(pixel) + 0.5) / vec2f(size) * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);
  let seen = view.to_eye * vec4f(ndc, depth, 1.0);
  let near = length(seen.xyz / seen.w - in.light.xyz) / in.light.w;
  if (near >= 1.0) { discard; }
  // A fire's glow is light itself, so it is added as it is rather than only where its colour passes white-hot.
  return vec4f(in.colour.rgb * (1.0 - near) * in.colour.a, 0.0);
}
`;
