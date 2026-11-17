import { SHADOW_CAST_WGSL, SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { MOSS_LEAF } from './trees.ts';

/** The frame's uniform floats: the view-projection, the anchor, the wind, the snow line and the biome's ground. */
export const FRAME_FLOATS = 32;
/** The segments of a plant's contact shade, a fan round its middle. */
export const SHADE_SEGMENTS = 10;

/** What the plants' passes share: their terms, their instances, and where each vertex stands. */
const PLANTS = /* wgsl */ `
${SHARED_WGSL}

struct Frame {
  from_eye: mat4x4f,
  // The anchor from the eye (east, south), the eye's drawn height negated, and the heights' exaggeration.
  anchor: vec4f,
  // Seconds, the wind's way (east, south), and the gusts' phase at the anchor.
  wind: vec4f,
  // The snow line, metres.
  land: vec4f,
  // The biome's low ground, and 1 when it is known.
  ground: vec4f,
};

struct Form {
  // The near mesh's range, the reach, the crossfade band, and 1 for the far mesh.
  ranges: vec4f,
  // Where the far plants start thinning, the share kept at the reach, and the sway at the top, metres.
  thin: vec4f,
  // The contact shade's radius and the crown's height at size 1, metres, and how dark its middle is.
  shade: vec4f,
};

struct Instance {
  // Its foot from its tile's corner (east, south), the foot's height and its turn.
  place: vec4f,
  // Its width and height scales, its tint (-1..1) and its rank (0..1).
  look: vec4f,
  // The ground's rise a metre east and south, its tile's number, and the ground's height at its foot.
  ground: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> form: Form;
@group(0) @binding(2) var<storage, read> instances: array<Instance>;
@group(0) @binding(3) var<storage, read> list: array<u32>;
@group(0) @binding(4) var<storage, read> corners: array<vec2f>;

struct Vertex {
  @location(0) position: vec3f,
  // The normal, and how much the vertex is leaf.
  @location(1) normal: vec4f,
  // The colour, and how far up the plant it sways.
  @location(2) colour: vec4f,
};

const NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const AMBIENT = 0.35;
const SNOW = vec3f(0.94, 0.95, 0.97);
// The ambient's tint from below (light bounced off the ground) and from above (the sky).
const BOUNCE = vec3f(0.95, 0.9, 0.76);
const SKYLIGHT = vec3f(1.0, 1.02, 1.08);
// How far a gust travels in a second, as a phase a metre and a second.
const GUST_PER_M = 0.035;
const GUST_PER_S = 1.4;
// Moss is known by its leaf share, and hangs only as far as a stone's throw: past that it is too fine to read.
const MOSS = ${MOSS_LEAF};
const MOSS_REACH = 150.0;

// An instance's foot from the anchor, and from the eye with its height as drawn.
struct Foot {
  item: Instance,
  anchored: vec2f,
  from_eye: vec3f,
};

fn foot_of(which: u32) -> Foot {
  let item = instances[list[which]];
  let anchored = corners[u32(item.ground.z)] + item.place.xy;
  let from_eye = vec3f(anchored + frame.anchor.xy, item.place.z * frame.anchor.w + frame.anchor.z);
  return Foot(item, anchored, from_eye);
}

// How much of a plant is left by the reach and the thinning at a distance: steep ground thins far plants more, so a
// mountainside reads as a scatter of trees fading out, not a speckle.
fn kept_share(item: Instance, distance: f32) -> vec2f {
  let flank = smoothstep(0.3, 0.6, length(item.ground.xy)) * smoothstep(500.0, 1500.0, distance);
  let keep = (1.0 - (1.0 - form.thin.y) * smoothstep(form.thin.x, form.ranges.y, distance)) * (1.0 - 0.85 * flank);
  let left = (1.0 - smoothstep(form.ranges.y * 0.85, form.ranges.y, distance)) * clamp((keep + 0.05 - item.look.w) * 20.0, 0.0, 1.0);
  return vec2f(keep, left);
}

// A plant's vertex where it stands this frame, measured from the eye, or culled: by its detail's range across the
// ground, by the reach and the thinning, and moss past a stone's throw.
struct Standing {
  point: vec3f,
  culled: bool,
  item: Instance,
  size: vec3f,
  turn: vec2f,
  cover: vec2f,
  distance: f32,
};

fn standing_of(vertex: Vertex, which: u32) -> Standing {
  var out: Standing;
  let foot = foot_of(which);
  let item = foot.item;
  out.item = item;
  // The detail changes by the distance across the ground, as the packing chose each tile's details; the reach and
  // the thinning by the distance from the eye, which is never less, so they only ever take away.
  let across = length(foot.from_eye.xy);
  let distance = length(foot.from_eye);
  out.distance = distance;
  let far = form.ranges.w > 0.5;
  let near_share = 1.0 - smoothstep(form.ranges.x - form.ranges.z, form.ranges.x, across);
  let kept = kept_share(item, distance);
  out.cover = vec2f(near_share, kept.y);
  let moss = abs(vertex.normal.w - MOSS) < 0.04 && distance > MOSS_REACH;
  out.culled = select(near_share, 1.0 - near_share, far) <= 0.0 || kept.y <= 0.0 || moss;
  // The far plants left standing widen to fill the gaps of those thinned out.
  let grow = select(1.0, inverseSqrt(max(kept.x, 0.05)), far);
  let size = vec3f(item.look.x * grow, item.look.x * grow, item.look.y * (1.0 + (grow - 1.0) * 0.3));
  out.size = size;
  let local = vertex.position * size;
  let turn = vec2f(cos(item.place.w), sin(item.place.w));
  out.turn = turn;
  var offset = vec2f(turn.x * local.x - turn.y * local.y, turn.y * local.x + turn.x * local.y);
  // Most trunks stand near upright and a few lean a little more, each its own way, read from its rank's digits.
  let tilt_way = fract(item.look.w * 7.31) * TAU;
  let tilt = select(0.0, fract(item.look.w * 13.7) * fract(item.look.w * 3.3) * 0.09, form.thin.z > 0.0);
  offset += vec2f(cos(tilt_way), sin(tilt_way)) * tilt * local.z;
  // Gusts roll downwind across the land; each plant also rocks on its own beat, its leaves trembling.
  let gust = 0.6 + 0.4 * sin(frame.wind.w + dot(foot.anchored, frame.wind.yz) * GUST_PER_M - frame.wind.x * GUST_PER_S);
  let sway = 0.35 * sin(frame.wind.x * 2.3 + item.look.w * 40.0);
  let bend = vertex.colour.a * form.thin.z * item.look.y * (gust + sway);
  offset += frame.wind.yz * bend;
  let tremble = vertex.normal.w * 0.03 * sin(frame.wind.x * 7.0 + dot(vertex.position, vec3f(3.1, 2.3, 1.7)));
  out.point = foot.from_eye + vec3f(offset, local.z - abs(bend) * 0.2 + tremble);
  return out;
}
`;

/**
 * The plants, drawn instanced: each instance's slot is read from the list, and its foot placed from its tile's
 * corner, measured from an anchor beside the eye, so the GPU's floats keep their centimetres however far the world
 * reaches. Lit as the land is lit, its ambient bounced warm from the ground under a crown and cool from the sky over
 * it, with a little sun through the leaves, in the sun's shadows. A plant fades by its samples, not by blending: the
 * near mesh hands its samples to the far one across the crossfade band, each taking exactly what the other leaves, and
 * both give theirs up toward the reach and as the far ones thin out. Four samples and a dither over two pixels give
 * seventeen steps.
 */
export const NATURE_SHADER = /* wgsl */ `
${PLANTS}
${SHADOW_WGSL}

struct Shaded {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) normal: vec3f,
  @location(2) leaf: f32,
  // The near mesh's share, and what the reach and the thinning leave, the same over the whole plant.
  @location(3) @interpolate(flat) cover: vec2f,
  @location(4) @interpolate(flat) snow: f32,
  @location(5) from_eye: vec3f,
};

@vertex
fn plant_vertex(vertex: Vertex, @builtin(instance_index) which: u32) -> Shaded {
  var out: Shaded;
  let standing = standing_of(vertex, which);
  out.cover = standing.cover;
  if (standing.culled) {
    out.clip = NOWHERE;
    return out;
  }
  let item = standing.item;
  let size = standing.size;
  let turn = standing.turn;
  let distance = standing.distance;
  let point = standing.point;
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.from_eye = point;
  let scaled = normalize(vertex.normal.xyz / size);
  out.normal = vec3f(turn.x * scaled.x - turn.y * scaled.y, turn.y * scaled.x + turn.x * scaled.y, scaled.z);
  out.leaf = vertex.normal.w;
  // The tint turns foliage warmer and yellower one way, deeper and cooler the other; bark only lightens or darkens.
  let tint = item.look.z;
  let hue = select(vec3f(0.9, 0.98, 1.05), vec3f(1.12, 1.05, 0.8), tint > 0.0);
  let tinted = mix(vec3f(1.0), hue, abs(tint) * vertex.normal.w);
  let own = vertex.colour.rgb * tinted * (1.0 + 0.08 * tint * (1.0 - vertex.normal.w));
  // Far off, a plant's colour leans toward the biome's ground, so a far forest sits in its land.
  let lean = select(0.0, 0.35 * smoothstep(900.0, form.ranges.y, distance), frame.ground.w > 0.5);
  out.colour = mix(own, frame.ground.rgb * 0.85, lean);
  out.snow = smoothstep(frame.land.x - 100.0, frame.land.x + 50.0, item.place.z);
  return out;
}

// The samples a share of a pixel covers: 'share' of four, dithered over two pixels, starting at a sample that turns
// with the pixel, so neighbouring pixels leave different samples open.
fn coverage(share: f32, pixel: vec2u, turn: u32) -> u32 {
  let dither = array<f32, 4>(0.125, 0.625, 0.875, 0.375);
  let count = u32(clamp(floor(share * 4.0 + dither[(pixel.x & 1u) + 2u * (pixel.y & 1u)]), 0.0, 4.0));
  let run = (1u << count) - 1u;
  let start = (pixel.x + 3u * pixel.y + turn) & 3u;
  return ((run << start) | (run >> (4u - start))) & 15u;
}

struct Drawn {
  @location(0) colour: vec4f,
  @builtin(sample_mask) mask: u32,
};

@fragment
fn plant_fragment(shaded: Shaded, @builtin(front_facing) front: bool) -> Drawn {
  let pixel = vec2u(shaded.clip.xy);
  let near_mask = coverage(shaded.cover.x, pixel, 0u);
  let own = select(near_mask, ~near_mask & 15u, form.ranges.w > 0.5);
  let mask = own & coverage(shaded.cover.y, pixel, 2u);
  if (mask == 0u) {
    discard;
  }
  // A blade or frond seen from behind keeps its upward lean: its normals lean up to light it as the ground it covers.
  var normal = normalize(shaded.normal);
  if (!front) {
    normal = vec3f(-normal.xy, normal.z);
  }
  // The sun as the shadow map lets it through: a tree under another's crown, or in a wall's shadow, is in shade.
  let sun = sunlit(shaded.from_eye, normal);
  let direct = max(dot(normal, SUN), 0.0) * sun;
  let ambient = AMBIENT * mix(BOUNCE, SKYLIGHT, normal.z * 0.5 + 0.5);
  // Leaves pass on the sky and the ground's bounce, and the sun behind them: a crown's underside is green, never black.
  let through = shaded.leaf * (0.2 + 0.3 * max(-dot(normal, SUN), 0.0) * sun);
  var colour = shaded.colour * (ambient + (1.0 - AMBIENT) * direct) + shaded.colour * SUN_LIGHT * through;
  let settled = shaded.snow * smoothstep(0.35, 0.75, normal.z);
  colour = mix(colour, SNOW * (AMBIENT + (1.0 - AMBIENT) * direct), settled);
  return Drawn(vec4f(colour, 1.0), mask);
}

struct Shade {
  @builtin(position) clip: vec4f,
  // 0 at the shade's middle, 1 at its rim; and how dark its middle is.
  @location(0) out_from_middle: f32,
  @location(1) @interpolate(flat) darkness: f32,
};

// A plant's contact shade: a soft dark disc on the ground under it, leaning a little the way the sun throws shadows,
// laid on the ground's slope at its foot. With no shadows drawn, it is what keeps a plant from looking pasted on.
@vertex
fn shade_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) which: u32) -> Shade {
  var out: Shade;
  let foot = foot_of(which);
  let item = foot.item;
  let distance = length(foot.from_eye);
  let fade = (1.0 - smoothstep(form.ranges.x * 0.4, form.ranges.x * 0.75, distance)) * kept_share(item, distance).y;
  if (fade <= 0.0 || form.shade.x <= 0.0) {
    out.clip = NOWHERE;
    return out;
  }
  let corner = index % 3u;
  let angle = f32(index / 3u + select(0u, 1u, corner == 2u)) / ${SHADE_SEGMENTS}.0 * TAU;
  let rim = select(1.0, 0.0, corner == 0u);
  let lean = -SUN.xy / SUN.z * form.shade.y * item.look.y * 0.35;
  let offset = lean + vec2f(cos(angle), sin(angle)) * form.shade.x * item.look.x * rim;
  let ground = item.ground.w + dot(item.ground.xy, offset) + 0.12;
  let point = vec3f(foot.from_eye.xy + offset, ground * frame.anchor.w + frame.anchor.z);
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.out_from_middle = rim;
  out.darkness = form.shade.z * fade;
  return out;
}

@fragment
fn shade_fragment(shade: Shade) -> @location(0) vec4f {
  let soft = 1.0 - shade.out_from_middle * shade.out_from_middle;
  return vec4f(0.0, 0.0, 0.0, shade.darkness * soft * soft);
}
`;

/** The near plants' depth along the sun, for the shadow map: placed and swaying as they are drawn. */
export const NATURE_CAST_SHADER = /* wgsl */ `
${PLANTS}
${SHADOW_CAST_WGSL}

@vertex
fn plant_cast(vertex: Vertex, @builtin(instance_index) which: u32) -> @builtin(position) vec4f {
  let standing = standing_of(vertex, which);
  if (standing.culled || form.ranges.w > 0.5) {
    return NOWHERE;
  }
  return shadow.from_eye * vec4f(standing.point, 1.0);
}
`;
