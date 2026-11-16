import { SHARED_WGSL } from '../water/waterCommon.ts';

/** The frame's uniform floats: the view-projection, the anchor, the wind and the land's snow line. */
export const FRAME_FLOATS = 28;

/**
 * The plants, drawn instanced: each instance placed from the packing's anchor, which is measured from the eye, so
 * the GPU's floats keep their centimetres however far the world reaches. Lit as the land is lit, with a little sun
 * through the leaves. A plant fades by its samples, not by blending: the near mesh hands its samples to the far
 * one across the crossfade band, each taking exactly what the other leaves, and both give theirs up toward the
 * reach and as the far ones thin out. Four samples and a dither over two pixels give seventeen steps.
 */
export const NATURE_SHADER = /* wgsl */ `
${SHARED_WGSL}

struct Frame {
  from_eye: mat4x4f,
  // The anchor from the eye (east, south), the eye's drawn height negated, and the heights' exaggeration.
  anchor: vec4f,
  // Seconds, the wind's way (east, south), and the gusts' phase at the anchor.
  wind: vec4f,
  // The snow line, metres.
  land: vec4f,
};

struct Form {
  // The near mesh's range, the reach, the crossfade band, and 1 for the far mesh.
  ranges: vec4f,
  // Where the far plants start thinning, the share kept at the reach, and the sway at the top, metres.
  thin: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> form: Form;

struct Vertex {
  @location(0) position: vec3f,
  // The normal, and how much the vertex is leaf.
  @location(1) normal: vec4f,
  // The colour, and how far up the plant it sways.
  @location(2) colour: vec4f,
  // The instance: its foot from the anchor (east, south), its foot's height and its turn.
  @location(3) place: vec4f,
  // Its width and height scales, its tint (-1..1) and its rank (0..1).
  @location(4) look: vec4f,
};

struct Shaded {
  @builtin(position) clip: vec4f,
  @location(0) colour: vec3f,
  @location(1) normal: vec3f,
  @location(2) leaf: f32,
  // The near mesh's share, and what the reach and the thinning leave, the same over the whole plant.
  @location(3) @interpolate(flat) cover: vec2f,
  @location(4) @interpolate(flat) snow: f32,
};

const NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const AMBIENT = 0.35;
const SNOW = vec3f(0.94, 0.95, 0.97);
// How far a gust travels in a second, as a phase a metre and a second.
const GUST_PER_M = 0.035;
const GUST_PER_S = 1.4;

@vertex
fn plant_vertex(vertex: Vertex) -> Shaded {
  var out: Shaded;
  let foot = vertex.place.xy + frame.anchor.xy;
  // The detail changes by the distance across the ground, as the packing chose each tile's details; the reach and
  // the thinning by the distance from the eye, which is never less, so they only ever take away.
  let across = length(foot);
  let distance = length(vec3f(foot, vertex.place.z * frame.anchor.w + frame.anchor.z));
  let far = form.ranges.w > 0.5;
  let near_share = 1.0 - smoothstep(form.ranges.x - form.ranges.z, form.ranges.x, across);
  let keep = 1.0 - (1.0 - form.thin.y) * smoothstep(form.thin.x, form.ranges.y, distance);
  let left = (1.0 - smoothstep(form.ranges.y * 0.85, form.ranges.y, distance)) * clamp((keep + 0.05 - vertex.look.w) * 20.0, 0.0, 1.0);
  out.cover = vec2f(near_share, left);
  if (select(near_share, 1.0 - near_share, far) <= 0.0 || left <= 0.0) {
    out.clip = NOWHERE;
    return out;
  }
  // The far plants left standing widen to fill the gaps of those thinned out.
  let grow = select(1.0, inverseSqrt(max(keep, 0.05)), far);
  let size = vec3f(vertex.look.x * grow, vertex.look.x * grow, vertex.look.y * (1.0 + (grow - 1.0) * 0.3));
  let local = vertex.position * size;
  let turn = vec2f(cos(vertex.place.w), sin(vertex.place.w));
  var offset = vec2f(turn.x * local.x - turn.y * local.y, turn.y * local.x + turn.x * local.y);
  // Gusts roll downwind across the land; each plant also rocks on its own beat, its leaves trembling.
  let gust = 0.6 + 0.4 * sin(frame.wind.w + dot(vertex.place.xy, frame.wind.yz) * GUST_PER_M - frame.wind.x * GUST_PER_S);
  let rock = 0.35 * sin(frame.wind.x * 2.3 + vertex.look.w * 40.0);
  let bend = vertex.colour.a * form.thin.z * vertex.look.y * (gust + rock);
  offset += frame.wind.yz * bend;
  let tremble = vertex.normal.w * 0.03 * sin(frame.wind.x * 7.0 + dot(vertex.position, vec3f(3.1, 2.3, 1.7)));
  let point = vec3f(foot + offset, vertex.place.z * frame.anchor.w + frame.anchor.z + local.z - abs(bend) * 0.2 + tremble);
  out.clip = frame.from_eye * vec4f(point, 1.0);
  let scaled = normalize(vertex.normal.xyz / size);
  out.normal = vec3f(turn.x * scaled.x - turn.y * scaled.y, turn.y * scaled.x + turn.x * scaled.y, scaled.z);
  out.leaf = vertex.normal.w;
  // The tint turns foliage warmer and yellower one way, deeper and cooler the other; bark only lightens or darkens.
  let tint = vertex.look.z;
  let hue = select(vec3f(0.9, 0.98, 1.05), vec3f(1.12, 1.05, 0.8), tint > 0.0);
  let tinted = mix(vec3f(1.0), hue, abs(tint) * vertex.normal.w);
  out.colour = vertex.colour.rgb * tinted * (1.0 + 0.08 * tint * (1.0 - vertex.normal.w));
  out.snow = smoothstep(frame.land.x - 100.0, frame.land.x + 50.0, vertex.place.z);
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
  let direct = max(dot(normal, SUN), 0.0);
  // The sky lights tops more than undersides; leaves pass on a little of the sky and the sun behind them.
  let skyward = 0.85 + 0.15 * normal.z;
  let through = shaded.leaf * (0.08 + 0.3 * max(-dot(normal, SUN), 0.0));
  var colour = shaded.colour * (AMBIENT * skyward + (1.0 - AMBIENT) * direct) + shaded.colour * SUN_LIGHT * through;
  let settled = shaded.snow * smoothstep(0.35, 0.75, normal.z);
  colour = mix(colour, SNOW * (AMBIENT + (1.0 - AMBIENT) * direct), settled);
  return Drawn(vec4f(colour, 1.0), mask);
}
`;
