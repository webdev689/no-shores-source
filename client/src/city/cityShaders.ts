// The city's WGSL: the forged models instanced in the near cells and the solids, the masses and hulls stood up from
// one shape each, and the ground plates dressed in their tiles. All share one view, one cell table and one array of
// pictures, are lit as the land is, and dither between tiers by the same thresholds the CPU's tiers test.
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { COLOUR_LAYERS, PICTURE_LAYERS } from './pictures.ts';
import { FAR_BAND_M, FAR_M, NEAR_BAND_M, NEAR_M } from './tiers.ts';
import { TEXELS_PER_METRE } from '../models/parts.ts';
import { TILE_M } from './blocks.ts';
import { PAVED_TILE } from './cityGround.ts';

/** How much nearer in depth (not on screen) the city is drawn than it stands: a few centimetres, and a share of the
 *  distance, so its terraces win over the land's coarser rings and its pads' own ground. */
export const PULL_M = 0.05;
export const PULL_SHARE = 0.012;
/** How far under its level a plate is drawn. */
const PLATE_DROP_M = 0.03;

const COMMON = /* wgsl */ `
${SHARED_WGSL}
struct View {
  from_eye: mat4x4f,
  // the eye from the city's middle, and the time
  eye: vec4f,
  // the ground's tiles: the grid's north-west corner from the city's middle, and the tiles a row
  grid: vec4f,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> cell_table: array<vec4f>;
@group(0) @binding(2) var<storage, read> sizes: array<vec4f>;
@group(0) @binding(3) var pictures: texture_2d_array<f32>;
@group(0) @binding(4) var picture_sampler: sampler;
@group(0) @binding(5) var tiles: texture_2d<u32>;

const AMBIENT = 0.35;
const BOUNCE = 0.15;
const TEXELS = ${TEXELS_PER_METRE.toFixed(1)};
const LAST_PICTURE = ${PICTURE_LAYERS - 1}u;
const GOLD = ${COLOUR_LAYERS.gold}u;
const IRON = ${COLOUR_LAYERS.iron}u;
const BONE = ${COLOUR_LAYERS.bone}u;
const GLOW = ${COLOUR_LAYERS.glow}u;
const PAVED = ${PAVED_TILE}u;
const TIER_ALWAYS = 0u;
const TIER_WHOLE = 1u;
const TIER_MASSES = 2u;
const TIER_HULLS = 4u;
const BAYER = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

fn clip_of(point: vec3f) -> vec4f {
  let offset = point - view.eye.xyz;
  let distance = max(length(offset), 1e-3);
  // nearer in depth only, and only above the sea, so what stands under the water stays under it
  let pull = (${PULL_M} + ${PULL_SHARE} * distance) * smoothstep(-1.0, 1.0, point.z);
  return view.from_eye * vec4f(offset * max(0.5, 1.0 - pull / distance), 1.0);
}

// How far a cell has turned from whole to masses, and from masses to hulls, by the eye's distance to its middle.
fn fades_of(cell: u32) -> vec2f {
  let distance = length(cell_table[cell].xyz - view.eye.xyz);
  return vec2f(
    clamp((distance - ${NEAR_M - NEAR_BAND_M}.0) / ${NEAR_BAND_M}.0, 0.0, 1.0),
    clamp((distance - ${FAR_M - FAR_BAND_M}.0) / ${FAR_BAND_M}.0, 0.0, 1.0),
  );
}

// Of two tiers in a band exactly one keeps each pixel, by its place in a 4 x 4 pattern.
fn kept(tier: u32, fades: vec2f, pixel: vec2f) -> bool {
  let at = vec2u(pixel) % 4u;
  let threshold = (BAYER[at.y * 4u + at.x] + 0.5) / 16.0;
  switch tier {
    case TIER_WHOLE: { return threshold >= fades.x; }
    case TIER_MASSES: { return threshold < fades.x && threshold >= fades.y; }
    case TIER_HULLS: { return threshold < fades.y; }
    default: { return true; }
  }
}

fn colour_of(layer: u32, sampled: vec3f) -> vec3f {
  switch layer {
    case GOLD: { return vec3f(0.86, 0.66, 0.26); }
    case IRON: { return vec3f(0.24, 0.25, 0.27); }
    case BONE: { return vec3f(0.86, 0.83, 0.74); }
    default: { return sampled; }
  }
}

// The land's light, and the light the ground throws back onto a wall, so a wall in shade still reads.
fn lit(layer: u32, albedo: vec3f, normal: vec3f) -> vec3f {
  if layer == GLOW {
    return vec3f(1.0, 0.72, 0.36) * 1.4;
  }
  let facing = normalize(normal);
  let ambient = AMBIENT + BOUNCE * (1.0 - abs(facing.z));
  return albedo * (ambient + (1.0 - ambient) * max(dot(facing, SUN), 0.0));
}

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) layer: u32,
  @location(3) @interpolate(flat) tier: u32,
  @location(4) @interpolate(flat) fades: vec2f,
};

@fragment
fn surface_fragment(surface: Surface) -> @location(0) vec4f {
  let sampled = textureSample(pictures, picture_sampler, surface.uv, min(surface.layer, LAST_PICTURE)).rgb;
  if !kept(surface.tier, surface.fades, surface.clip.xy) {
    discard;
  }
  return vec4f(lit(surface.layer, colour_of(surface.layer, sampled), surface.normal), 1.0);
}
`;

/** Forged models placed by instance (the near cells), and the solids and skirts as one placed at the origin. */
export const MODEL_SHADER = /* wgsl */ `
${COMMON}
struct Vertex {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) layer: u32,
  // where it stands from the city's middle, and its yaw
  @location(4) place: vec4f,
  // its cell, and its tier
  @location(5) about: vec2u,
};

// A model's x right and z forward, turned by its yaw clockwise from north, into the world's east and south.
fn turned(point: vec3f, yaw: f32) -> vec3f {
  let cosine = cos(yaw);
  let sine = sin(yaw);
  return vec3f(point.x * cosine + point.z * sine, point.x * sine - point.z * cosine, point.y);
}

@vertex
fn model_vertex(vertex: Vertex) -> Surface {
  var surface: Surface;
  let solid = vertex.about.y == TIER_ALWAYS;
  let point = select(turned(vertex.position, vertex.place.w), vertex.position, solid) + vertex.place.xyz;
  surface.clip = clip_of(point);
  surface.normal = select(turned(vertex.normal, vertex.place.w), vertex.normal, solid);
  surface.uv = vertex.uv;
  surface.layer = vertex.layer;
  surface.tier = vertex.about.y;
  surface.fades = select(fades_of(vertex.about.x), vec2f(0.0), solid);
  return surface;
}
`;

/** A building's masses or hull, each an instance of one shape: four walls and a roof of two slopes and two ends. */
export const MASS_SHADER = /* wgsl */ `
${COMMON}
struct Mass {
  // the middle of its base from the city's middle, and its ridge's turn
  @location(0) place: vec4f,
  // half its length along the ridge and across it, its walls' height and its roof's rise
  @location(1) size: vec4f,
  // its wall and roof layers, its cell, and its flags: hipped, and its tier
  @location(2) about: vec4u,
};

// Each face's corners: along the ridge and across it (-1 to 1), the height (base, eaves, ridge), and which way a
// hip's ridge end draws in. Walls, then the two slopes, then the two ends.
const CORNERS = array<vec4f, 32>(
  vec4f(-1.0, -1.0, 0.0, 0.0), vec4f(1.0, -1.0, 0.0, 0.0), vec4f(1.0, -1.0, 1.0, 0.0), vec4f(-1.0, -1.0, 1.0, 0.0),
  vec4f(1.0, 1.0, 0.0, 0.0), vec4f(-1.0, 1.0, 0.0, 0.0), vec4f(-1.0, 1.0, 1.0, 0.0), vec4f(1.0, 1.0, 1.0, 0.0),
  vec4f(-1.0, 1.0, 0.0, 0.0), vec4f(-1.0, -1.0, 0.0, 0.0), vec4f(-1.0, -1.0, 1.0, 0.0), vec4f(-1.0, 1.0, 1.0, 0.0),
  vec4f(1.0, -1.0, 0.0, 0.0), vec4f(1.0, 1.0, 0.0, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(1.0, -1.0, 1.0, 0.0),
  vec4f(-1.0, -1.0, 1.0, 0.0), vec4f(1.0, -1.0, 1.0, 0.0), vec4f(1.0, 0.0, 2.0, -1.0), vec4f(-1.0, 0.0, 2.0, 1.0),
  vec4f(1.0, 1.0, 1.0, 0.0), vec4f(-1.0, 1.0, 1.0, 0.0), vec4f(-1.0, 0.0, 2.0, 1.0), vec4f(1.0, 0.0, 2.0, -1.0),
  vec4f(-1.0, 1.0, 1.0, 0.0), vec4f(-1.0, -1.0, 1.0, 0.0), vec4f(-1.0, 0.0, 2.0, 1.0), vec4f(-1.0, 0.0, 2.0, 1.0),
  vec4f(1.0, -1.0, 1.0, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(1.0, 0.0, 2.0, -1.0), vec4f(1.0, 0.0, 2.0, -1.0),
);
const QUAD = array<u32, 6>(0u, 1u, 2u, 0u, 2u, 3u);

// A corner in metres along the ridge, across it and up from the base.
fn corner_at(spec: vec4f, size: vec4f, inset: f32) -> vec3f {
  let height = select(select(size.z + size.w, size.z, spec.z < 1.5), 0.0, spec.z < 0.5);
  return vec3f(spec.x * size.x + spec.w * inset, spec.y * size.y, height);
}

@vertex
fn mass_vertex(@builtin(vertex_index) index: u32, mass: Mass) -> Surface {
  var surface: Surface;
  let face = select(6u + (index - 36u) / 3u, index / 6u, index < 36u);
  let corner = select((index - 36u) % 3u, QUAD[index % 6u], index < 36u);
  let hip = (mass.about.w & 1u) != 0u;
  let inset = select(0.0, min(mass.size.y, mass.size.x), hip);
  let first = corner_at(CORNERS[face * 4u], mass.size, inset);
  let here = corner_at(CORNERS[face * 4u + corner], mass.size, inset);
  let across = cross(corner_at(CORNERS[face * 4u + 1u], mass.size, inset) - first, corner_at(CORNERS[face * 4u + 2u], mass.size, inset) - first);
  let normal = select(vec3f(0.0, 0.0, 1.0), normalize(across), dot(across, across) > 1e-8);
  let roofed = face == 4u || face == 5u || (face >= 6u && hip);
  surface.layer = select(mass.about.x, mass.about.y, roofed);
  let size = sizes[min(surface.layer, LAST_PICTURE)].xy;
  let sideways = face == 2u || face == 3u || face >= 6u;
  let along = select(here.x, here.y, sideways);
  // walls and gable ends climb from the base; a roof's faces are laid up their slope
  let slope = select(length(vec2f(mass.size.y, mass.size.w)), length(vec2f(inset, mass.size.w)), face >= 6u);
  let up = select(here.z, select(0.0, slope, CORNERS[face * 4u + corner].z > 1.5), roofed);
  surface.uv = vec2f(along, -up) * TEXELS / size;
  let cosine = cos(mass.place.w);
  let sine = sin(mass.place.w);
  let point = vec3f(mass.place.xy + here.x * vec2f(cosine, sine) + here.y * vec2f(-sine, cosine), mass.place.z + here.z);
  surface.clip = clip_of(point);
  surface.normal = vec3f(normal.x * cosine - normal.y * sine, normal.x * sine + normal.y * cosine, normal.z);
  surface.tier = mass.about.w & 6u;
  surface.fades = fades_of(mass.about.z);
  return surface;
}
`;

/** The ground plates: each pixel finds its tile, the tile's picture and its quarter turns. */
export const PLATE_SHADER = /* wgsl */ `
${COMMON}
struct Plate {
  @builtin(position) clip: vec4f,
  @location(0) ground: vec2f,
};

@vertex
fn plate_vertex(@location(0) position: vec3f) -> Plate {
  var plate: Plate;
  // a few centimetres under its level, so a paved solid laid at the same level (the plaza's floor) shows over it
  plate.clip = clip_of(position - vec3f(0.0, 0.0, ${PLATE_DROP_M}));
  plate.ground = (position.xy - view.grid.xy) / ${TILE_M};
  return plate;
}

@fragment
fn plate_fragment(plate: Plate) -> @location(0) vec4f {
  let along = dpdx(plate.ground);
  let down = dpdy(plate.ground);
  let tile = vec2i(floor(plate.ground));
  let data = textureLoad(tiles, clamp(tile, vec2i(0), vec2i(i32(view.grid.z) - 1)), 0).rg;
  let inside = fract(plate.ground);
  // a quarter turn at a time, as Daggerfall Unity turns its tiles; a flip is a half turn
  var uv = inside;
  switch data.g {
    case 1u: { uv = vec2f(1.0 - inside.y, inside.x); }
    case 2u: { uv = vec2f(1.0 - inside.x, 1.0 - inside.y); }
    case 3u: { uv = vec2f(inside.y, 1.0 - inside.x); }
    default: {}
  }
  // paving is laid at the forged models' texels a metre over the whole plate, not once a tile
  let paved = data.g == PAVED;
  let scale = select(vec2f(1.0), ${TILE_M} * TEXELS / sizes[min(data.r, LAST_PICTURE)].xy, paved);
  uv = select(uv, plate.ground * scale, paved);
  let albedo = textureSampleGrad(pictures, picture_sampler, uv, data.r, along * scale, down * scale).rgb;
  return vec4f(lit(data.r, albedo, vec3f(0.0, 0.0, 1.0)), 1.0);
}
`;
