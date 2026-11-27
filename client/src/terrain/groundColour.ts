// How the land is coloured: its classes (the biome's low ground, highland, bare rock, snow, a beach, the bed under
// water), each wearing its ground tile's grain, and the biome's woods over them. WGSL for the terrain's shader, which
// declares `view`, `ground_tiles` and `tile_sampler`.
import { TILE_GRAIN_WGSL } from '../groundGrain.ts';

export { TILE_LAYERS, TILE_M, TILE_TURN, WIDE_TILE_M } from '../groundGrain.ts';

/**
 * What is laid on the land, painted for the terrain (game's groundPaint.ts): texels `texelM` metres square from the
 * north-west corner (`west`, `north`, window metres), the paths and dirt, then the paving, then, where a chalk zone
 * is painted, its claim (`channels` bytes a texel), each a distance from its edge (128 at the edge, 32 a metre, more
 * inside).
 */
export interface GroundPaint {
  /** Bytes a texel: 2, or 4 where a chalk layout is painted (its claim is the third). */
  readonly channels: 2 | 4;
  readonly west: number;
  readonly north: number;
  readonly texelM: number;
  readonly width: number;
  readonly height: number;
  readonly texels: Uint8Array;
}
/** The texture format a paint of `channels` bytes a texel is held in. */
export const paintFormat = (channels: 2 | 4): 'rg8unorm' | 'rgba8unorm' => (channels === 4 ? 'rgba8unorm' : 'rg8unorm');
/** The square fine detail repeats in, metres (groundColour's `fine_noise`). */
export const FINE_SQUARE_M = 1024;

export const GROUND_COLOUR_WGSL = /* wgsl */ `
${TILE_GRAIN_WGSL}
const SAND = vec3f(0.84, 0.76, 0.56);
// Wet sand: the beach under the swash's reach, and the bed it runs on into.
const WET = 0.78;
const SEABED = vec3f(0.50, 0.52, 0.40);
const DEEP_BED = vec3f(0.24, 0.30, 0.30);
const MUD = vec3f(0.33, 0.30, 0.21);
const HIGHLAND = vec3f(0.50, 0.40, 0.27);
const ROCK = vec3f(0.48, 0.47, 0.45);
const SNOW = vec3f(0.94, 0.95, 0.97);
// The white of chalk, the stone of a zone whose brief names it, in place of the climate's.
const CHALK = vec3f(0.93, 0.92, 0.88);
// How much of the climate's stone's hue bare rock takes.
const STONE_HUE = 0.6;
// A path's trodden earth and a street's stone, under their tiles' grain.
const PATH_EARTH = vec3f(0.47, 0.38, 0.27);
const PAVING_STONE = vec3f(0.60, 0.58, 0.54);

// A ground tile's grain at a point (metres from the noise's anchor), read from where the anchor falls in the tiles.
fn tile_grain(layer: i32, at: vec2f) -> vec3f {
  return tile_grain_at(layer, view.tiles.xy + at / TILE_M, view.tiles.zw + TURN * at / WIDE_TILE_M);
}

// The climate's stone: the stone tile's mean, brought to bare rock's light, so a desert's cliffs are sandstone and a
// temperate coast's grey.
fn stone_tint() -> vec3f {
  let mean = tile_mean(STONE_TILE);
  return mix(ROCK, mean * dot(ROCK, LUMA) / max(dot(mean, LUMA), 0.02), STONE_HUE);
}

// The stone tile on a cliff, cast on the face (cast_grain) with its bed's height down it.
fn stone_grain(at: vec2f, bed: f32, normal: vec3f) -> vec3f {
  let up = -bed / TILE_M;
  let across = vec2f(view.tiles.y + at.y / TILE_M, up);
  let along = vec2f(view.tiles.x + at.x / TILE_M, up);
  return cast_grain(STONE_TILE, across, along, view.tiles.xy + at / TILE_M, normal);
}

// Bare rock: layered in strata a few metres thick that wander with the face, dark seams between them, each layer its
// own tone, gritty close up, and leaning toward the biome's own ground colour, so a carved cliff reads as stone.
fn rock_colour(at: vec2f, bed: f32, chalk: f32) -> vec3f {
  let wobble = fine_noise(at, 32.0, 53) * 1.6 + fine_noise(at, 8.0, 59) * 0.5;
  let layer = fract(bed / 3.4 + wobble);
  let seam = smoothstep(0.0, 0.07, layer) * (1.0 - smoothstep(0.88, 1.0, layer));
  let tone = mix(0.8, 1.14, grove_noise(vec2f(bed * 0.29 + wobble, 0.5), 1.0, 61));
  let grit = mix(0.86, 1.08, fine_noise(at, 2.0, 67));
  let tint = mix(mix(stone_tint(), view.ground.rgb * 1.2, 0.07), CHALK, chalk);
  return tint * tone * grit * mix(0.55, 1.0, seam);
}

// The low ground is the biome's (view.ground.rgb); snow lies above its snow line (view.ground.w). Along the painted
// coast ('coast' metres inland) the low, gentle ground is a beach, darker below the swash's reach.
// Each class wears its ground tile's grain (tile_grain), the rock its stone cast on the face (stone_grain), and one
// class gives way to the next by their grains' heights (meet): stones show through the grass first as a slope
// steepens, snow settles in the hollows before it covers the rises.
fn land_colour(bed: f32, slope: f32, coast: f32, at: vec2f, normal: vec3f, dirt_grain: vec3f, chalk: f32) -> vec3f {
  let grass_grain = tile_grain(GRASS_TILE, at);
  let stone = stone_grain(at, bed, normal);
  let snow_grain = tile_grain(SNOW_TILE, at);
  let sand_grain = tile_grain(SAND_TILE, at);
  var land = vec4f(view.ground.rgb * grass_grain, raised(grass_grain));
  land = meet(land, vec4f(HIGHLAND * dirt_grain, raised(dirt_grain)), smoothstep(200.0, 1600.0, bed));
  land = meet(land, vec4f(rock_colour(at, bed, chalk) * stone, raised(stone) + ROCK_STANDS), smoothstep(0.3, 0.55, slope));
  let snow_line = smoothstep(view.ground.w - 200.0, view.ground.w, bed);
  land = meet(land, vec4f(SNOW * snow_grain, SNOW_SETTLES - raised(snow_grain)), snow_line);
  let low = 1.0 - smoothstep(1.5, 3.0, bed);
  let beach = (1.0 - smoothstep(60.0, 140.0, coast)) * low * (1.0 - smoothstep(0.12, 0.3, slope));
  let wet = (1.0 - smoothstep(0.1, 0.4, bed)) * beach;
  land = meet(land, vec4f(SAND * sand_grain, raised(sand_grain)), beach);
  return land.rgb * mix(1.0, WET, wet);
}

// The painting at a point (GroundPaint), read once a pixel: each channel's distance from its edge in metres (a channel
// the paint lacks reads as outside), and in w whether a painting lies there.
fn paint_at(point: vec2f) -> vec4f {
  let uv = (point - view.paint.xy) * view.paint.z / vec2f(textureDimensions(ground_paint));
  let held = view.paint.w > 0.5 && all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0));
  let reach = (textureSampleLevel(ground_paint, paint_sampler, uv, 0.0).rgb * 255.0 - 128.0) / 32.0;
  return vec4f(reach, select(0.0, 1.0, held));
}

// How far in a chalk claim a painting puts a point: 0 outside, 1 a metre in. Only the rock class reads it, so a chalk
// zone's floors keep their grass.
fn chalk_share(laid: vec4f) -> f32 {
  return select(0.0, smoothstep(-1.0, 1.0, laid.z), laid.w > 0.5);
}

// The paths and streets painted on the land (GroundPaint): each channel's distance from its edge, with a noise on it so
// an edge wanders as a trodden one does, soft across a pixel; a path paler in its middle and darker at its edges,
// where the grass is worn into it. Read only where a painting lies (view.paint.w), and only on dry land.
fn painted(colour: vec3f, laid: vec4f, at: vec2f, footprint: f32, dirt_grain: vec3f) -> vec3f {
  let earth = PATH_EARTH * dirt_grain;
  let stones = PAVING_STONE * tile_grain(PAVING_TILE, at);
  let reach = laid.xy;
  let held = laid.w > 0.5;
  let ragged = (fine_noise(at, 1.0, 83) - 0.5) * 0.9 + (fine_noise(at, 0.5, 89) - 0.5) * 0.35;
  // The edge stays well inside the 4 m the paint reaches, so ground no path is near never takes its colour; a way
  // fades out where it is thinner than a pixel's footprint rather than shimmering.
  let soft = clamp(footprint, 0.15, 2.0);
  let shown = select(0.0, 1.0 - smoothstep(2.0, 6.0, footprint), held);
  let dirt = smoothstep(-soft, soft, reach.x + ragged) * shown;
  let paving = smoothstep(-soft, soft, reach.y + ragged * 0.5) * shown;
  let worn = mix(0.8, 1.06, smoothstep(0.0, 1.4, reach.x));
  return mix(mix(colour, earth * worn, dirt), stones, paving);
}

// The bed under water: wet sand in the shallows, as the beach is at the waterline, giving way to silt and darker
// ground with depth; mud under fresh water.
fn bed_colour(depth: f32, slope: f32, fresh: bool) -> vec3f {
  let sea_floor = mix(mix(SAND * WET, SEABED, smoothstep(1.5, 18.0, depth)), DEEP_BED, smoothstep(18.0, 90.0, depth));
  return mix(select(sea_floor, MUD, fresh), ROCK * 0.8, smoothstep(0.3, 0.6, slope));
}

// The scatter's grove field (nature's scatter.ts: hashOf, valueNoise, groveAt), to the bit in its hash, so the woods
// seen from afar lie where the trees stand near.
fn grove_hash(column: i32, row: i32, salt: i32) -> u32 {
  var hash = 0x811c9dc5u;
  let values = array<i32, 3>(column, row, salt);
  for (var index = 0; index < 3; index++) {
    hash = (hash ^ bitcast<u32>(values[index])) * 0x01000193u;
    hash ^= hash >> 15u;
    hash *= 0x2c1b3c6du;
    hash ^= hash >> 12u;
  }
  hash = (hash ^ (hash >> 16u)) * 0x297a2d39u;
  return hash ^ (hash >> 15u);
}

fn grove_noise(world: vec2f, cell: f32, salt: i32) -> f32 {
  let grid = world / cell;
  let base = floor(grid);
  let share = smoothstep(vec2f(0.0), vec2f(1.0), grid - base);
  let at = vec2i(base);
  let corner_00 = f32(grove_hash(at.x, at.y, salt)) / 4294967296.0;
  let corner_10 = f32(grove_hash(at.x + 1, at.y, salt)) / 4294967296.0;
  let corner_01 = f32(grove_hash(at.x, at.y + 1, salt)) / 4294967296.0;
  let corner_11 = f32(grove_hash(at.x + 1, at.y + 1, salt)) / 4294967296.0;
  let top = mix(corner_00, corner_10, share.x);
  return mix(top, mix(corner_01, corner_11, share.x), share.y);
}

// A noise for detail no coarser than a few tens of metres, read from the point's offset from the anchor (at) and
// the anchor's place in a 1024 m square (view.fine), so it is exact in single precision anywhere in the world; it
// repeats every 1024 m, as its cells (which divide 1024) wrap round the square.
fn fine_noise(at: vec2f, cell: f32, salt: i32) -> f32 {
  let grid = (view.fine.xy + at) / cell;
  let base = floor(grid);
  let share = smoothstep(vec2f(0.0), vec2f(1.0), grid - base);
  let period = i32(round(${FINE_SQUARE_M.toFixed(1)} / cell));
  let low = (vec2i(base) % period + period) % period;
  let high = (low + 1) % period;
  let corner_00 = f32(grove_hash(low.x, low.y, salt)) / 4294967296.0;
  let corner_10 = f32(grove_hash(high.x, low.y, salt)) / 4294967296.0;
  let corner_01 = f32(grove_hash(low.x, high.y, salt)) / 4294967296.0;
  let corner_11 = f32(grove_hash(high.x, high.y, salt)) / 4294967296.0;
  return mix(mix(corner_00, corner_10, share.x), mix(corner_01, corner_11, share.x), share.y);
}

fn grove_at(world: vec2f) -> f32 {
  return 0.55 * grove_noise(world, 560.0, 17) + 0.3 * grove_noise(world, 230.0, 29) + 0.15 * grove_noise(world, 90.0, 41);
}

// The biome's woods on the land: the forest floor darker under the groves near, where the trees are drawn, and their
// canopy's colour as the trees' sprites fade out (4.8 to 6 km, nature's TREE reach); none on the beach, on ground too
// steep for trees, or near the snow line. A grove's trees cover the ground thickly from afar, crowns and sides together.
// From 1 km the far trees thin out, each widened to stand in for the rest: the ground between them takes most of the
// canopy's colour already, so a far wood reads closed rather than as crowns over bare ground. Alpha is the canopy's
// share of the colour, which takes no wet ground's sheen, as the trees' crowns take none.
fn wooded(colour: vec3f, world: vec2f, bed: f32, slope: f32, distance_to: f32) -> vec4f {
  if (view.woods.w <= 0.0) { return vec4f(colour, 0.0); }
  let in_grove = smoothstep(0.4, 0.6, grove_at(world));
  let gather = view.world.z;
  let density = (1.0 + gather * (2.0 * in_grove - 1.0)) / (1.0 + gather);
  var cover = 1.0 - exp(-4.0 * view.woods.w * density);
  cover *= smoothstep(2.0, 2.5, bed) * (1.0 - smoothstep(0.6, 0.75, slope));
  cover *= 1.0 - smoothstep(view.ground.w - 300.0, view.ground.w - 100.0, bed);
  let far = max(smoothstep(4800.0, 6000.0, distance_to), 0.7 * smoothstep(1000.0, 3000.0, distance_to));
  return vec4f(mix(colour * mix(1.0, 0.72, cover), mix(colour, view.woods.rgb, cover), far), cover * far);
}
`;
