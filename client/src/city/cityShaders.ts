// The city's WGSL: the forged models instanced in the near cells and the solids, the masses and hulls stood up from
// one shape each, and the ground plates dressed in their tiles. All share one view, one cell table and one array of
// pictures, are lit as the land is, and dither between tiers by the same thresholds the CPU's tiers test.
import { SHADOW_CAST_WGSL, SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { CLOTH_COLOURS, COLOUR_LAYERS, PICTURE_LAYERS } from './pictures.ts';
import { FAR_BAND_M, FAR_M, NEAR_BAND_M, NEAR_M } from './tiers.ts';
import { TEXELS_PER_METRE } from '../models/parts.ts';
import { TILE_M } from './blocks.ts';
import { PAVED_TILE } from './cityGround.ts';
import { MASS_RUIN } from './cityMasses.ts';
import { SOLID_TEXELS_PER_METRE } from './solidMesh.ts';

/** How much nearer in depth (not on screen) the city is drawn than it stands: a few centimetres, and a share of the
 *  distance, so its terraces win over the land's coarser rings and its pads' own ground. */
export const PULL_M = 0.05;
export const PULL_SHARE = 0.012;
/** How far under its level a plate is drawn. */
const PLATE_DROP_M = 0.03;
/** How dark a ruin's walls are scorched at their break: a share of their light taken. */
const SCORCH = 0.78;
/** How far under its break a ruin's wall edge falls at most, metres, so the break is ragged. */
const JAG_M = 3;

/** Each cloth's case of `colour_of`: its dye under the weave. */
const CLOTH_CASES = Object.entries(CLOTH_COLOURS)
  .map(([cloth, colour]) => {
    const layer = COLOUR_LAYERS[cloth as keyof typeof CLOTH_COLOURS];
    return `    case ${layer}u: { return vec3f(${colour.map((channel) => channel.toFixed(3)).join(', ')}) * weave_of(texel, threads, fade); }`;
  })
  .join('\n');

const VIEW = /* wgsl */ `
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
`;

const COMMON = /* wgsl */ `
${VIEW}
${SHADOW_WGSL}

const AMBIENT = 0.35;
const BOUNCE = 0.15;
const TEXELS = ${TEXELS_PER_METRE.toFixed(1)};
const SOLID_TEXELS = ${SOLID_TEXELS_PER_METRE.toFixed(1)};
const LAST_PICTURE = ${PICTURE_LAYERS - 1}u;
const GOLD = ${COLOUR_LAYERS.gold}u;
const IRON = ${COLOUR_LAYERS.iron}u;
const BONE = ${COLOUR_LAYERS.bone}u;
const GLOW = ${COLOUR_LAYERS.glow}u;
const WATER = ${COLOUR_LAYERS.water}u;
// A plain colour's texels to its uv: the size of the picture it would be (cityBuild lays a plain one as 64 square).
const PLAIN_TEXELS = 64.0;
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

// A texel's own number, the same wherever the texel is drawn.
fn texel_hash(cell: vec2i) -> f32 {
  var hash = (u32(cell.x) * 0x8da6b343u) ^ (u32(cell.y) * 0xd8163841u);
  hash = (hash ^ (hash >> 15u)) * 0x2c1b3c6du;
  hash = (hash ^ (hash >> 12u)) * 0x297a2d39u;
  return f32(hash ^ (hash >> 15u)) / 4294967296.0;
}

// Cloth's weave over its dye: its threads crossing, a thread here and there thicker, the dye taken unevenly.
fn weave_of(texel: vec2f, threads: vec2f, fade: f32) -> f32 {
  let crossing = abs(fract(threads) - 0.5) * 2.0;
  let slub = texel_hash(vec2i(i32(floor(threads.y)), 7)) - 0.5;
  return (1.0 - 0.1 * fade * max(crossing.x, crossing.y)) * (1.0 + 0.08 * fade * slub)
    * (0.95 + 0.1 * sky_noise(texel / 10.0));
}

// A plain colour's albedo, or the sampled picture's. A plain colour is painted on the texels a picture would have
// (PLAIN_TEXELS to its uv), so its grain reads as painted, as the pictures' does: wrought iron's hammer marks, pits and
// rust; gilding burnished and worn through to the bronze; bone's grain and yellowing; cloth its dye under a fine weave
// of uneven threads, the dye taken unevenly; still water stirring. A picture is lighter or darker in patches some
// metres wide, so its
// repeats do not line up across a wall.
fn colour_of(layer: u32, sampled: vec3f, uv: vec2f, place: vec3f, normal: vec3f) -> vec3f {
  let texel = floor(uv * PLAIN_TEXELS);
  let cell = vec2i(texel);
  let mark = texel_hash(cell) - 0.5;
  let threads = uv * 160.0;
  // the threads fade where they are finer than a pixel: their derivative is taken here, before any branch
  let fade = clamp(1.5 - 2.0 * max(length(fwidth(threads)), 0.0), 0.0, 1.0);
  switch layer {
    case GOLD: {
      let worn = smoothstep(0.62, 0.8, sky_noise(texel / 5.0));
      let glint = select(0.0, 0.16, texel_hash(cell + vec2i(31, 17)) > 0.93);
      let gilt = vec3f(0.86, 0.66, 0.26) * (1.0 + 0.18 * mark + glint);
      return mix(gilt, vec3f(0.5, 0.33, 0.14) * (1.0 + 0.2 * mark), worn * 0.8);
    }
    case IRON: {
      let pit = select(1.0, 0.55, texel_hash(cell + vec2i(7919, 1049)) > 0.94);
      let bloom = smoothstep(0.55, 0.85, sky_noise(texel / 6.0) + 0.25 * max(normal.z, 0.0));
      let iron = vec3f(0.24, 0.25, 0.27) * (1.0 + 0.22 * mark) * pit;
      return mix(iron, vec3f(0.35, 0.19, 0.11) * (1.0 + 0.3 * mark), bloom * 0.7);
    }
    case BONE: {
      let grain = sin(texel.y * 0.9 + sky_noise(texel / 9.0) * 9.0) * 0.5 + 0.5;
      let aged = sky_noise(texel / 12.0);
      return mix(vec3f(0.88, 0.86, 0.78), vec3f(0.8, 0.72, 0.55), aged * 0.6) * (0.94 + 0.08 * grain + 0.06 * mark);
    }
    case WATER: {
      // still water, deep green-blue, its face stirring slowly in light and shade
      let stir = sky_noise(place.xy * 1.6 + vec2f(view.eye.w * 0.25, view.eye.w * 0.17));
      return vec3f(0.12, 0.27, 0.31) * (0.85 + 0.3 * stir);
    }
${CLOTH_CASES}
    default: { return sampled * (0.93 + 0.14 * sky_noise(place.xy / 7.0)); }
  }
}

// The land's light, and the light the ground throws back onto a wall, so a wall in shade still reads. The sun reaches
// a point at 'from_eye' as the shadow map says, through the clouds' shadows; the lamps light it at night, and the
// weather wets it. A glowing solid is a flame: brighter when the night round it is dark.
fn lit(layer: u32, albedo: vec3f, normal: vec3f, from_eye: vec3f) -> vec3f {
  if layer == GLOW {
    // Each flame flickers on its own, a few times a second, by where it burns: all of one fire together.
    let place = floor((from_eye + view.eye.xyz) / 3.0);
    let flicker = 0.86 + 0.16 * sky_noise(vec2f(view.eye.w * 7.0, place.x * 13.0 + place.y * 7.0 + place.z));
    return mix(vec3f(2.0, 1.25, 0.55), vec3f(1.4, 1.0, 0.5), sky_state.sun.w) * flicker;
  }
  let facing = normalize(normal);
  // A clear noon's ambient was AMBIENT, more on a wall by the bounce, the sun lighting the rest.
  let ambient = AMBIENT + BOUNCE * (1.0 - abs(facing.z));
  let direct = max(dot(facing, sky_state.key.xyz), 0.0);
  let sun = select(1.0, sunlit(from_eye, facing), direct > 0.0) * sky_dapple(from_eye);
  // Fresh snow lies on the flat stone as on the ground round it, the city standing on the eye's own ground. Flat stone
  // (the plaza, a flat roof) holds puddles where no snow lies; walls and sloping roofs are only darkened and sheened.
  // Nothing is wet or snowed on under shelter: read a little out from the face, so a wall's outside is not its room.
  let open = select(1.0, 0.0, sky_sheltered(from_eye + facing * 0.6));
  let rise = sqrt(max(1.0 - facing.z * facing.z, 0.0)) / max(facing.z, 1e-3);
  let snow = sky_fresh_snow(sky_state.puddle_place.z, rise) * open;
  let puddle = select(0.0, sky_puddle(from_eye, 0.0), facing.z > 0.95) * (1.0 - snow) * open;
  let wet = max(sky_state.ambient_sky.w * 0.7 * (1.0 - snow), puddle) * open;
  let light = sky_ambient(facing) * (ambient / AMBIENT) + sky_direct(facing, sun) * ((1.0 - ambient) / 0.65);
  let surface = sky_soaked(sky_snowed(albedo, snow), wet);
  return surface * (light + sky_lamps(from_eye, facing)) + sky_sheen(facing, from_eye, wet);
}

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) layer: u32,
  @location(3) @interpolate(flat) tier: u32,
  @location(4) @interpolate(flat) fades: vec2f,
  @location(5) from_eye: vec3f,
  // in a ruin, the height over the building's origin and the height it is broken off at; (0, 0) standing whole
  @location(6) ruin: vec2f,
};

// A broken wall's edge: how far under the break it has fallen at a point, 0 to 1, the same over each 1.5 m square.
fn jagged(point: vec3f) -> f32 {
  let square = vec2i(floor(point.xy / 1.5));
  var mixed = (u32(square.x) * 0x9e3779b1u) ^ (u32(square.y) * 0x85ebca77u);
  mixed = (mixed ^ (mixed >> 15u)) * 0x2c1b3c6du;
  mixed = mixed ^ (mixed >> 12u);
  return f32(mixed & 1023u) / 1023.0;
}

@fragment
fn surface_fragment(surface: Surface, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  let sampled = textureSample(pictures, picture_sampler, surface.uv, min(surface.layer, LAST_PICTURE)).rgb;
  // a ruin's open shell is drawn from inside too, lit from the side seen
  let normal = select(-surface.normal, surface.normal, facing);
  // coloured before any discard: the colour's derivatives want the whole quad
  let albedo = colour_of(surface.layer, sampled, surface.uv, surface.from_eye + view.eye.xyz, normal);
  if !kept(surface.tier, surface.fades, surface.clip.xy) {
    discard;
  }
  let broken = surface.ruin.y > 0.0;
  // above its break a ruin's building is gone, and so are its floors and ceilings in its upper part, which would
  // otherwise read as a roof from above
  let slab = abs(normalize(surface.normal).z) > 0.9 && surface.ruin.x > 0.25 * surface.ruin.y;
  // never more than half its standing height, so a low building keeps its ground floor
  let jag = min(${JAG_M}.0, 0.5 * surface.ruin.y) * jagged(surface.from_eye + view.eye.xyz);
  if broken && (surface.ruin.x > surface.ruin.y - jag || slab) {
    discard;
  }
  let scorch = select(0.0, ${SCORCH} * pow(clamp(surface.ruin.x / max(surface.ruin.y, 1e-3), 0.0, 1.0), 1.5), broken);
  return vec4f(lit(surface.layer, albedo * (1.0 - scorch), normal, surface.from_eye), 1.0);
}
`;

/** A model's or a solid's vertex where it stands, from the city's middle: shared by the models' pass and their
 *  shadow's. */
const MODEL_PLACE = /* wgsl */ `
struct Vertex {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) layer: u32,
  // where it stands from the city's middle, and its yaw
  @location(4) place: vec4f,
  // its cell, and its tier
  @location(5) about: vec2u,
  // in a ruin, the height over its origin it is broken off at; 0 standing whole
  @location(6) cut: f32,
};

// A model's x right and z forward, turned by its yaw clockwise from north, into the world's east and south.
fn turned(point: vec3f, yaw: f32) -> vec3f {
  let cosine = cos(yaw);
  let sine = sin(yaw);
  return vec3f(point.x * cosine + point.z * sine, point.x * sine - point.z * cosine, point.y);
}

fn placed(vertex: Vertex) -> vec3f {
  let solid = vertex.about.y == 0u;
  return select(turned(vertex.position, vertex.place.w), vertex.position, solid) + vertex.place.xyz;
}

// Placed as drawn, but a broken model's corners above its break brought down to it, so its shadow is the ruin's.
fn placed_broken(vertex: Vertex) -> vec3f {
  var broken = vertex;
  broken.position.y = select(vertex.position.y, min(vertex.position.y, vertex.cut), vertex.cut > 0.0);
  return placed(broken);
}
`;

/** Forged models placed by instance (the near cells), and the solids and skirts as one placed at the origin. */
export const MODEL_SHADER = /* wgsl */ `
${COMMON}
${MODEL_PLACE}

@vertex
fn model_vertex(vertex: Vertex) -> Surface {
  var surface: Surface;
  let solid = vertex.about.y == TIER_ALWAYS;
  let point = placed(vertex);
  surface.clip = clip_of(point);
  surface.from_eye = point - view.eye.xyz;
  surface.normal = select(turned(vertex.normal, vertex.place.w), vertex.normal, solid);
  surface.uv = vertex.uv;
  surface.layer = vertex.layer;
  surface.tier = vertex.about.y;
  surface.fades = select(fades_of(vertex.about.x), vec2f(0.0), solid);
  surface.ruin = select(vec2f(0.0), vec2f(vertex.position.y, vertex.cut), vertex.cut > 0.0);
  return surface;
}
`;

/** A building's mass or hull as one shape, shared by the masses' pass and their shadow's: its corners, and where
 *  each of its 42 vertices stands from the city's middle. */
const MASS_SHAPE = /* wgsl */ `
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

// A vertex's face (the walls, the slopes, then the ends) and its corner of that face.
fn face_of(index: u32) -> vec2u {
  return select(vec2u(6u + (index - 36u) / 3u, (index - 36u) % 3u), vec2u(index / 6u, QUAD[index % 6u]), index < 36u);
}

// How far a hipped roof's ridge draws in from each end: not at all on a gabled one.
fn inset_of(mass: Mass) -> f32 {
  return select(0.0, min(mass.size.y, mass.size.x), (mass.about.w & 1u) != 0u);
}

// A corner along the ridge, across it and up from the base, where it stands from the city's middle.
fn mass_placed(mass: Mass, here: vec3f) -> vec3f {
  let cosine = cos(mass.place.w);
  let sine = sin(mass.place.w);
  return vec3f(mass.place.xy + here.x * vec2f(cosine, sine) + here.y * vec2f(-sine, cosine), mass.place.z + here.z);
}
`;

/** A building's masses or hull, each an instance of one shape: four walls and a roof of two slopes and two ends. */
export const MASS_SHADER = /* wgsl */ `
${COMMON}
${MASS_SHAPE}

@vertex
fn mass_vertex(@builtin(vertex_index) index: u32, mass: Mass) -> Surface {
  var surface: Surface;
  let at = face_of(index);
  let face = at.x;
  let corner = at.y;
  let hip = (mass.about.w & 1u) != 0u;
  let inset = inset_of(mass);
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
  let point = mass_placed(mass, here);
  surface.clip = clip_of(point);
  surface.from_eye = point - view.eye.xyz;
  surface.normal = vec3f(normal.x * cosine - normal.y * sine, normal.x * sine + normal.y * cosine, normal.z);
  surface.tier = mass.about.w & 6u;
  surface.fades = fades_of(mass.about.z);
  // a ruin's mass is cut already: its walls scorched up to their top, which is its break, and its top left open
  let ruined = (mass.about.w & ${MASS_RUIN}u) != 0u;
  let open_top = select(vec2f(here.z, mass.size.z + 0.01), vec2f(1.0, 0.5), roofed || face >= 6u);
  surface.ruin = select(vec2f(0.0), open_top, ruined);
  return surface;
}
`;

/** The ground plates: each pixel finds its tile, the tile's picture and its quarter turns. */
export const PLATE_SHADER = /* wgsl */ `
${COMMON}
struct Plate {
  @builtin(position) clip: vec4f,
  @location(0) ground: vec2f,
  @location(1) from_eye: vec3f,
};

@vertex
fn plate_vertex(@location(0) position: vec3f) -> Plate {
  var plate: Plate;
  // a few centimetres under its level, so a paved solid laid at the same level (the plaza's floor) shows over it
  plate.clip = clip_of(position - vec3f(0.0, 0.0, ${PLATE_DROP_M}));
  plate.from_eye = position - view.eye.xyz;
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
  // paving is laid as the solids' paving is, over the whole plate, not once a tile
  let paved = data.g == PAVED;
  let scale = select(vec2f(1.0), ${TILE_M} * SOLID_TEXELS / sizes[min(data.r, LAST_PICTURE)].xy, paved);
  uv = select(uv, plate.ground * scale, paved);
  let albedo = textureSampleGrad(pictures, picture_sampler, uv, data.r, along * scale, down * scale).rgb;
  return vec4f(lit(data.r, albedo, vec3f(0.0, 0.0, 1.0), plate.from_eye), 1.0);
}
`;

/** The models' and solids' depth along the sun, for the shadow map: placed as they are drawn, nothing more. */
export const MODEL_CAST_SHADER = /* wgsl */ `
${VIEW}
${SHADOW_CAST_WGSL}
${MODEL_PLACE}

@vertex
fn model_cast(vertex: Vertex) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed_broken(vertex) - view.eye.xyz, 1.0);
}
`;

/** The masses' and hulls' depth along the sun, for the far shadow map: stood up as they are drawn. */
export const MASS_CAST_SHADER = /* wgsl */ `
${VIEW}
${SHADOW_CAST_WGSL}
${MASS_SHAPE}

@vertex
fn mass_cast(@builtin(vertex_index) index: u32, mass: Mass) -> @builtin(position) vec4f {
  let at = face_of(index);
  let here = corner_at(CORNERS[at.x * 4u + at.y], mass.size, inset_of(mass));
  return shadow.from_eye * vec4f(mass_placed(mass, here) - view.eye.xyz, 1.0);
}
`;
