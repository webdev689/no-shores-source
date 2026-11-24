import { SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { MEADOW_SLOTS } from './meadowAtlas.ts';
import { CELL_M, CLEAR_SQUARES, GRID, TUFTS } from './meadowField.ts';
import {
  BOXES,
  BREEZE_MS,
  BUSH,
  CLUSTER_M,
  DRY,
  FLOWERS,
  GREEN,
  GREEN_EDGE,
  GUST,
  HEIGHT_M,
  LEAN_PER_PUSH,
  LUMA,
  LUSH,
  PATCH_SCALE,
  SHARES,
  SHIFT,
  SHORT,
  STANDING_LEAN,
  TONE,
  VARIANTS,
} from './meadowLaw.ts';
import { GUST_PER_M, PLANT_LIGHT_WGSL, SWAY } from './natureShader.ts';

/** The frame's uniform floats: the view-projection, the anchor, the wind, the snow line and reach, and the ground. */
export const MEADOW_FRAME_FLOATS = 32;
/** Vertices a tuft is drawn with near (three cards) and far (the near set's first two). */
export const NEAR_VERTICES = 18;
export const FAR_VERTICES = 12;
/** Past this share of the reach a cell draws its tufts' far cards; each near tuft lets its third go at its own
 *  distance over the band below it. */
export const FAR_FROM = 0.3;
const FAR_BAND = 0.05;

const list = (values: readonly number[]) => values.map((value) => value.toFixed(6)).join(', ');
const vec3 = (values: readonly number[]) => `vec3f(${list(values)})`;

/**
 * The meadow, drawn instanced: each instance a tuft of a cell, `instance_index` its cell's slot times `TUFTS` and
 * its number in the cell. Where it stands in its cell, which of the owner's sprites it wears and how tall come of a
 * hash of its cell and number; how lush its patch is, of noise over the cells; whether it grows, of its cell's grid.
 * Each tuft is three crossed cards turned its own way, fixed in the world, each cut to its sprite's drawn box, its foot
 * following the slope, swaying in the plants' own wind. Its colours are the owner's, moved by the ground under them
 * (meadowLaw.ts `texelOver`), lit as the plants are, and given way to the ground's colour far off. It fades by its
 * samples toward the reach, a tuft's share of the cell thinning first, so far cells hold fewer.
 */
export const MEADOW_SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${PLANT_LIGHT_WGSL}

struct MeadowFrame {
  from_eye: mat4x4f,
  // The anchor from the eye (east, south), the eye's drawn height negated, and the heights' exaggeration.
  anchor: vec4f,
  // Seconds, the wind's way (east, south), and the gusts' phase at the anchor.
  wind: vec4f,
  // The snow line, how hard the wind bends the plants (1 a fresh breeze), how gusty it is, and the reach, metres.
  land: vec4f,
  // The biome's low ground, and 1 when it is known.
  ground: vec4f,
};

@group(0) @binding(0) var<uniform> frame: MeadowFrame;
// Each slot's cell: its north-west corner from the anchor (east, south) and its place, whole cells east and south.
@group(0) @binding(1) var<storage, read> meadow_cells: array<vec4f>;
// Each slot's grid, row by row from the north-west: the ground's height and how much of it is grass.
@group(0) @binding(2) var<storage, read> meadow_grids: array<vec2f>;
@group(0) @binding(3) var atlas: texture_2d<f32>;
@group(0) @binding(4) var nearest: sampler;
// Each cell's kept-clear mask (meadowField.ts), a word a row of its squares, a bit a square: no tuft stands in one.
@group(0) @binding(5) var<storage, read> meadow_clear: array<u32>;

const MEADOW_CELL_M = ${CELL_M.toFixed(1)};
const MEADOW_GRID = ${GRID}u;
const MEADOW_CLEAR = ${CLEAR_SQUARES}u;
const MEADOW_TUFTS = ${TUFTS}u;
const MEADOW_SLOTS = ${MEADOW_SLOTS.toFixed(1)};
const MEADOW_NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const MEADOW_PI = 3.14159265;
// Each sprite's drawn box (u from its left, v up from its foot), card scale, stiffness and share of the wind.
const MEADOW_BOXES = array<vec4f, 5>(${BOXES.map((box) => `vec4f(${list([box.u0, box.u1, box.v0, box.v1])})`).join(', ')});
const MEADOW_SCALES = array<f32, 5>(${list(VARIANTS.map((variant) => variant.scale))});
const MEADOW_STIFF = array<f32, 5>(${list(VARIANTS.map((variant) => variant.stiff))});
const MEADOW_SWAY = array<f32, 5>(${list(VARIANTS.map((variant) => variant.sway))});
// The pick's shares at the poor and the lush end (bush, flowers, dry, short), and a patch's scale.
const MEADOW_POOR = vec4f(${list([SHARES.bush[0], SHARES.flowers[0], SHARES.dry[0], SHARES.short[0]])});
const MEADOW_RICH = vec4f(${list([SHARES.bush[1], SHARES.flowers[1], SHARES.dry[1], SHARES.short[1]])});
const MEADOW_PATCH = vec2f(${list(PATCH_SCALE)});
const MEADOW_LUSH = vec2f(${list(LUSH)});
const MEADOW_HEIGHT_M = vec2f(${list(HEIGHT_M)});
// The ground the art is drawn for, the span its ratio is held to, and how much hue a green texel takes.
const MEADOW_ART_GROUND = ${vec3(GREEN.map((value, channel) => value / (TONE[channel] ?? 1)))};
const MEADOW_SHIFT = vec2f(${list(SHIFT)});
const MEADOW_GREEN_EDGE = ${GREEN_EDGE.toFixed(1)};
const MEADOW_LUMA_WEIGHTS = vec3f(${list(LUMA)});
// How far a gust travels a metre and a second, as the plants' (natureShader.ts), and a fresh breeze, m/s, that
// leans a tuft's top this much a metre a second over its height (meadowLaw.ts).
const MEADOW_GUST_PER_M = ${GUST_PER_M};
const MEADOW_GUST_PER_S = ${SWAY.gustPerS.toFixed(2)};
const MEADOW_BREEZE_MS = ${BREEZE_MS.toFixed(1)};
const MEADOW_LEAN_PER_PUSH = ${LEAN_PER_PUSH};
const MEADOW_GUST = vec2f(${list(GUST)});
const MEADOW_CLUSTER_M = ${CLUSTER_M};
const MEADOW_STANDING = ${(STANDING_LEAN * 2).toFixed(3)};
const MEADOW_FAR_FROM = ${FAR_FROM.toFixed(3)};
const MEADOW_FAR_BAND = ${FAR_BAND.toFixed(3)};

fn meadow_hash(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

// The next draw of a tuft's seed, 0..1.
fn meadow_draw(seed: ptr<function, u32>) -> f32 {
  *seed = meadow_hash(*seed);
  return f32(*seed >> 8u) / 16777216.0;
}

fn meadow_corner_draw(x: i32, y: i32, salt: u32) -> f32 {
  return f32(meadow_hash((bitcast<u32>(x) * 73856093u) ^ (bitcast<u32>(y) * 19349663u) ^ salt) >> 8u) / 16777216.0;
}

// Noise over a lattice of 'span' cells, smooth between its corners: whole patches lush or poor.
fn meadow_patch(cell: vec2i, local: vec2f, span: i32, salt: u32) -> f32 {
  let low = vec2i(floor(vec2f(cell) / f32(span)));
  let within = (vec2f(cell - low * span) * MEADOW_CELL_M + local) / (MEADOW_CELL_M * f32(span));
  let eased = within * within * (3.0 - 2.0 * within);
  let top = mix(meadow_corner_draw(low.x, low.y, salt), meadow_corner_draw(low.x + 1, low.y, salt), eased.x);
  let bottom = mix(meadow_corner_draw(low.x, low.y + 1, salt), meadow_corner_draw(low.x + 1, low.y + 1, salt), eased.x);
  return mix(top, bottom, eased.y);
}

// The cell's ground at a point of it (metres east and south of its corner): height, grass share and the rise a metre
// east and south.
fn meadow_ground(slot: u32, local: vec2f) -> vec4f {
  let step = MEADOW_CELL_M / f32(MEADOW_GRID - 1u);
  let at = clamp(local / step, vec2f(0.0), vec2f(f32(MEADOW_GRID - 1u) - 0.001));
  let low = vec2u(floor(at));
  let share = at - vec2f(low);
  let base = slot * MEADOW_GRID * MEADOW_GRID;
  let a = meadow_grids[base + low.y * MEADOW_GRID + low.x];
  let b = meadow_grids[base + low.y * MEADOW_GRID + low.x + 1u];
  let c = meadow_grids[base + (low.y + 1u) * MEADOW_GRID + low.x];
  let d = meadow_grids[base + (low.y + 1u) * MEADOW_GRID + low.x + 1u];
  let mixed = mix(mix(a, b, share.x), mix(c, d, share.x), share.y);
  let rise = vec2f(mix(b.x - a.x, d.x - c.x, share.y), mix(c.x - a.x, d.x - b.x, share.x)) / step;
  return vec4f(mixed, rise);
}

struct MeadowShaded {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) normal: vec3f,
  @location(2) from_eye: vec3f,
  // Its patch's tint, how far it has given way to the ground, how much of it is left by the fade, and the shade at
  // its foot.
  @location(3) look: vec4f,
  // The card's face, turned to the eye.
  @location(4) face: vec3f,
  @location(5) @interpolate(flat) tuft: u32,
};

fn meadow_tuft(vertex: u32, instance: u32, cards: u32) -> MeadowShaded {
  var out: MeadowShaded;
  out.clip = MEADOW_NOWHERE;
  let slot = instance / MEADOW_TUFTS;
  let number = instance % MEADOW_TUFTS;
  let cell = meadow_cells[slot];
  let key = vec2i(i32(round(cell.z)), i32(round(cell.w)));
  var seed = meadow_hash((bitcast<u32>(key.x) * 2654435761u) ^ (bitcast<u32>(key.y) * 40503u) ^ (number * 2246822519u));
  let jitter = meadow_draw(&seed) * 2.0 * MEADOW_PI;
  let cluster = meadow_draw(&seed) * meadow_draw(&seed) * MEADOW_CLUSTER_M;
  let local = vec2f(meadow_draw(&seed), meadow_draw(&seed)) * MEADOW_CELL_M + vec2f(cos(jitter), sin(jitter)) * cluster;
  let ground = meadow_ground(slot, local);
  if (meadow_draw(&seed) >= ground.y) { return out; }
  let square = vec2u(clamp(local * (f32(MEADOW_CLEAR) / MEADOW_CELL_M), vec2f(0.0), vec2f(f32(MEADOW_CLEAR) - 1.0)));
  if (((meadow_clear[slot * MEADOW_CLEAR + square.y] >> square.x) & 1u) == 1u) { return out; }
  let anchored = cell.xy + local;
  let root = vec3f(anchored + frame.anchor.xy, ground.x * frame.anchor.w + frame.anchor.z);
  let distance = length(root);
  let reach = frame.land.w;
  // A far cell holds fewer: its tufts past their share of what the fade leaves are not drawn at all.
  let fade = 1.0 - smoothstep(0.55 * reach, reach, distance);
  let share = f32(number) / f32(MEADOW_TUFTS);
  if (share > fade * 1.15) { return out; }
  let card = vertex / 6u;
  let yaw = meadow_draw(&seed) * MEADOW_PI;
  if (cards == 3u && card == 2u && distance > reach * (MEADOW_FAR_FROM - MEADOW_FAR_BAND + MEADOW_FAR_BAND * fract(yaw * 64.0))) {
    return out;
  }
  let height = MEADOW_HEIGHT_M.x + meadow_draw(&seed) * MEADOW_HEIGHT_M.y;
  let own_tint = meadow_draw(&seed);
  let clump = 0.66 * meadow_patch(key, local, 1, 17u) + 0.34 * meadow_patch(key, local, 4, 31u);
  let tint = clamp(own_tint + (clump - own_tint) * 0.55, 0.0, 1.0);
  // Which sprite, by the draw and how lush the patch is (meadowLaw.ts pick).
  let lush = smoothstep(MEADOW_LUSH.x, MEADOW_LUSH.y, tint);
  let shares = mix(MEADOW_POOR, MEADOW_RICH, lush);
  let pick = meadow_draw(&seed);
  var variant = 0u;
  if (pick < shares.x) {
    variant = ${BUSH}u;
  } else if (pick < shares.x + shares.y) {
    variant = ${FLOWERS}u;
  } else if (pick < shares.x + shares.y + shares.z) {
    variant = ${DRY}u;
  } else if ((pick - shares.x - shares.y - shares.z) / (1.0 - shares.x - shares.y - shares.z) < shares.w) {
    variant = ${SHORT}u;
  }
  let side = height * MEADOW_SCALES[variant] * mix(MEADOW_PATCH.x, MEADOW_PATCH.y, lush);
  let standing = (vec2f(meadow_draw(&seed), meadow_draw(&seed)) - 0.5) * MEADOW_STANDING * MEADOW_STIFF[variant];
  let mirrored = meadow_draw(&seed) < 0.5;
  // Gusts roll downwind across the land, as through the plants.
  let gusting = 0.25 + 0.5 * frame.land.z;
  let rolling = frame.wind.w + dot(anchored, frame.wind.yz) * MEADOW_GUST_PER_M - frame.wind.x * MEADOW_GUST_PER_S;
  let gust = 1.0 - gusting + gusting * sin(rolling + meadow_draw(&seed) * 0.6);
  let push = frame.land.y * MEADOW_BREEZE_MS * (MEADOW_GUST.x + MEADOW_GUST.y * gust);
  let lean = standing + frame.wind.yz * push * MEADOW_LEAN_PER_PUSH * MEADOW_SWAY[variant];
  // The card's corner, cut to the sprite's drawn box, and the card turned its own way, a mirrored one a half-turn.
  let corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let corner = corners[vertex % 6u];
  let box = MEADOW_BOXES[variant];
  let across = box.x + corner.x * (box.y - box.x);
  let up = box.z + corner.y * (box.w - box.z);
  let turn = yaw + f32(card) * MEADOW_PI / 3.0 + select(0.0, MEADOW_PI, (card % 2u == 1u) != mirrored);
  let way = vec2f(cos(turn), sin(turn));
  let offset = way * (across - 0.5) * side + lean * up * up * side;
  // The foot follows the slope: each corner stands as high as the ground under it.
  let lift = dot(offset, ground.zw) * frame.anchor.w;
  let point = root + vec3f(offset, up * side + lift);
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.uv = vec2f((f32(variant) + across) / MEADOW_SLOTS, 1.0 - up);
  let level = normalize(vec3f(-ground.zw, 1.0));
  // Lit across its lean, as DFO's cards are: a card leaning in the wind catches a low sun on one side.
  out.normal = normalize(level * 1.2 + vec3f(-lean.y, lean.x, 0.0));
  out.from_eye = point;
  out.look = vec4f(tint, smoothstep(0.12 * reach, 0.6 * reach, distance), fade, mix(0.72, 1.0, corner.y));
  let face = vec3f(-way.y, way.x, 0.0);
  out.face = select(-face, face, dot(face, -root) >= 0.0);
  out.tuft = number;
  return out;
}

@vertex
fn meadow_near(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> MeadowShaded {
  return meadow_tuft(vertex, instance, 3u);
}

@vertex
fn meadow_far(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> MeadowShaded {
  return meadow_tuft(vertex, instance, 2u);
}

// A texel's colour over the ground (meadowLaw.ts texelOver): its green takes the ground's hue, its petals and dry
// stalks only the ground's light.
fn meadow_over_ground(art: vec3f, ground: vec3f) -> vec3f {
  let shift = clamp(ground / MEADOW_ART_GROUND, vec3f(MEADOW_SHIFT.x), vec3f(MEADOW_SHIFT.y));
  let light = dot(shift, MEADOW_LUMA_WEIGHTS);
  let green = clamp((art.g - max(art.r, art.b)) * MEADOW_GREEN_EDGE, 0.0, 1.0);
  return art * mix(vec3f(light), shift, green);
}

struct MeadowDrawn {
  @location(0) colour: vec4f,
  @builtin(sample_mask) mask: u32,
};

@fragment
fn meadow_fragment(in: MeadowShaded) -> MeadowDrawn {
  // The level by how fast the card's height runs across the pixel, so a card seen edge-on is not blurred across.
  let rows = in.uv.y * 64.0;
  let level = max(log2(max(abs(dpdx(rows)), abs(dpdy(rows)))), 0.0);
  let texel = textureSampleLevel(atlas, nearest, in.uv, level);
  if (texel.a < 0.5) { discard; }
  let ground = select(${vec3(GREEN)}, frame.ground.rgb, frame.ground.w > 0.5);
  var colour = meadow_over_ground(texel.rgb, ground);
  // Four bands, each rounded to its centre, so the mean holds and the top band is whole.
  colour *= 0.88 + floor(in.look.x * 3.0 + 0.5) / 3.0 * 0.24;
  colour = mix(colour, ground, in.look.y);
  // A card turned to a low sun takes its light whole, one turned away keeps half; at noon the two sit close. The sky,
  // the lamps and what passes through it light every card alike.
  let key = sky_state.key.xyz;
  let faced = mix(1.0, clamp(0.72 + 0.28 * dot(in.face, key), 0.5, 1.0), length(key.xy));
  let lit_colour = lit(colour, in.normal, 1.0, in.look.w, in.from_eye, 0.0, faced);
  var out: MeadowDrawn;
  out.colour = vec4f(lit_colour, 1.0);
  // Each tuft fades out over the last of the cell's share the fade still draws, so a cell thins tuft by tuft.
  let left = clamp((in.look.z * 1.15 - f32(in.tuft) / f32(MEADOW_TUFTS)) * 8.0, 0.0, 1.0);
  out.mask = coverage(left, vec2u(in.clip.xy), in.tuft);
  return out;
}
`;
