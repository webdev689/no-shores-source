// How the land is coloured: its classes (the biome's low ground, highland, bare rock, snow, a beach, the bed under
// water), each wearing its ground tile's grain, and the biome's woods over them. WGSL for the terrain's shader, which
// declares `view`, `ground_tiles` and `tile_sampler`.

/** The ground's tile pictures the terrain wears, in this order in the array `wearTiles` is handed: the low ground's
 *  grass, the dirt of the highlands, roads and paths, the stone of bare rock, snow, a beach's sand, and a town's
 *  paving. */
export const TILE_LAYERS = ['grass', 'dirt', 'stone', 'snow', 'sand', 'paving'] as const;

/**
 * What is laid on the land, painted for the terrain (game's groundPaint.ts): texels `texelM` metres square from the
 * north-west corner (`west`, `north`, window metres), two bytes a texel, the paths and dirt then the paving, each a
 * distance from its edge (128 at the edge, 32 a metre, more inside).
 */
export interface GroundPaint {
  readonly west: number;
  readonly north: number;
  readonly texelM: number;
  readonly width: number;
  readonly height: number;
  readonly texels: Uint8Array;
}
/** A ground tile's side in metres, as Daggerfall laid them, and the second, wider and turned, reading of it that
 *  breaks up its repeats. */
export const TILE_M = 6.4;
export const WIDE_TILE_M = 33.9;
export const TILE_TURN = 0.61;

export const GROUND_COLOUR_WGSL = /* wgsl */ `
const SAND = vec3f(0.84, 0.76, 0.56);
// Wet sand: the beach under the swash's reach, and the bed it runs on into.
const WET = 0.78;
const SEABED = vec3f(0.50, 0.52, 0.40);
const DEEP_BED = vec3f(0.24, 0.30, 0.30);
const MUD = vec3f(0.33, 0.30, 0.21);
const HIGHLAND = vec3f(0.50, 0.40, 0.27);
const ROCK = vec3f(0.48, 0.47, 0.45);
const SNOW = vec3f(0.94, 0.95, 0.97);
const TILE_M = ${TILE_M};
const WIDE_TILE_M = ${WIDE_TILE_M};
const TURN = mat2x2f(${Math.cos(TILE_TURN)}, ${Math.sin(TILE_TURN)}, ${-Math.sin(TILE_TURN)}, ${Math.cos(TILE_TURN)});
const GRASS_TILE = 0;
const DIRT_TILE = 1;
const STONE_TILE = 2;
const SNOW_TILE = 3;
const SAND_TILE = 4;
const PAVING_TILE = 5;
// How sharply one class gives way to the next by their grains (meet), how much higher bare rock stands than what
// grows over it, and how far snow lies in a tile's hollows before its rises.
const MEET_DEPTH = 0.2;
const ROCK_STANDS = 0.15;
const SNOW_SETTLES = 0.1;
// A path's trodden earth and a street's stone, under their tiles' grain.
const PATH_EARTH = vec3f(0.47, 0.38, 0.27);
const PAVING_STONE = vec3f(0.60, 0.58, 0.54);

// A ground tile's grain at a point (metres from the noise's anchor), as a factor on its class's colour: the tile over
// its own mean, read plainly and again wider and turned, so its repeats do not line up. A tile not painted yet, and
// the far ground its finest levels average away, is 1 throughout.
fn tile_grain(layer: i32, at: vec2f) -> vec3f {
  let mean = max(textureSampleLevel(ground_tiles, tile_sampler, vec2f(0.5), layer, 16.0).rgb, vec3f(0.02));
  let plain = textureSample(ground_tiles, tile_sampler, view.tiles.xy + at / TILE_M, layer).rgb;
  let wide = textureSample(ground_tiles, tile_sampler, view.tiles.zw + TURN * at / WIDE_TILE_M, layer).rgb;
  return clamp(plain / mean, vec3f(0.0), vec3f(2.5)) * mix(vec3f(1.0), clamp(wide / mean, vec3f(0.0), vec3f(2.0)), 0.55);
}

// The stone tile on a cliff, cast from the three axes and blended by how the ground faces, so a face is not
// stretched where the plain reading would run down it.
fn stone_grain(at: vec2f, bed: f32, normal: vec3f) -> vec3f {
  let mean = max(textureSampleLevel(ground_tiles, tile_sampler, vec2f(0.5), STONE_TILE, 16.0).rgb, vec3f(0.02));
  let up = -bed / TILE_M;
  let across = textureSample(ground_tiles, tile_sampler, vec2f(view.tiles.y + at.y / TILE_M, up), STONE_TILE).rgb;
  let along = textureSample(ground_tiles, tile_sampler, vec2f(view.tiles.x + at.x / TILE_M, up), STONE_TILE).rgb;
  let flat = textureSample(ground_tiles, tile_sampler, view.tiles.xy + at / TILE_M, STONE_TILE).rgb;
  var weights = pow(abs(normal), vec3f(4.0));
  weights /= weights.x + weights.y + weights.z;
  return clamp((across * weights.x + along * weights.y + flat * weights.z) / mean, vec3f(0.0), vec3f(2.5));
}

// Bare rock: layered in strata a few metres thick that wander with the face, dark seams between them, each layer its
// own tone, gritty close up, and leaning toward the biome's own ground colour, so a carved cliff reads as stone.
fn rock_colour(world: vec2f, bed: f32) -> vec3f {
  let wobble = grove_noise(world, 37.0, 53) * 1.6 + grove_noise(world, 11.0, 59) * 0.5;
  let layer = fract(bed / 3.4 + wobble);
  let seam = smoothstep(0.0, 0.07, layer) * (1.0 - smoothstep(0.88, 1.0, layer));
  let tone = mix(0.8, 1.14, grove_noise(vec2f(bed * 0.29 + wobble, 0.5), 1.0, 61));
  let grit = mix(0.86, 1.08, grove_noise(world, 2.3, 67));
  let tint = mix(ROCK, view.ground.rgb * 1.2, 0.07);
  return tint * tone * grit * mix(0.55, 1.0, seam);
}

// The low ground is the biome's (view.ground.rgb); snow lies above its snow line (view.ground.w). Along the painted
// coast ('coast' metres inland) the low, gentle ground is a beach, darker below the swash's reach.
// Each class wears its ground tile's grain (tile_grain), the rock its stone cast on the face (stone_grain), and one
// class gives way to the next by their grains' heights (meet): stones show through the grass first as a slope
// steepens, snow settles in the hollows before it covers the rises.
fn land_colour(bed: f32, slope: f32, coast: f32, world: vec2f, at: vec2f, normal: vec3f) -> vec3f {
  let grass_grain = tile_grain(GRASS_TILE, at);
  let dirt_grain = tile_grain(DIRT_TILE, at);
  let stone = stone_grain(at, bed, normal);
  let snow_grain = tile_grain(SNOW_TILE, at);
  let sand_grain = tile_grain(SAND_TILE, at);
  var land = vec4f(view.ground.rgb * grass_grain, raised(grass_grain));
  land = meet(land, vec4f(HIGHLAND * dirt_grain, raised(dirt_grain)), smoothstep(200.0, 1600.0, bed));
  land = meet(land, vec4f(rock_colour(world, bed) * stone, raised(stone) + ROCK_STANDS), smoothstep(0.3, 0.55, slope));
  let snow_line = smoothstep(view.ground.w - 200.0, view.ground.w, bed);
  land = meet(land, vec4f(SNOW * snow_grain, SNOW_SETTLES - raised(snow_grain)), snow_line);
  let low = 1.0 - smoothstep(1.5, 3.0, bed);
  let beach = (1.0 - smoothstep(60.0, 140.0, coast)) * low * (1.0 - smoothstep(0.12, 0.3, slope));
  let wet = (1.0 - smoothstep(0.1, 0.4, bed)) * beach;
  land = meet(land, vec4f(SAND * sand_grain, raised(sand_grain)), beach);
  return land.rgb * mix(1.0, WET, wet);
}

// How high a grain stands, from its light: a tile's stones and tufts are painted lit from above, its gaps dark.
fn raised(grain: vec3f) -> f32 {
  return dot(grain, vec3f(0.3, 0.59, 0.11)) - 1.0;
}

// One class (rgb, height in w) meeting the next by 'share': across the meeting, the next shows first where it stands
// higher than the first, within MEET_DEPTH, so the edge follows the grains rather than fading evenly. Its height
// carries on into the next meeting.
fn meet(first: vec4f, next: vec4f, share: f32) -> vec4f {
  if (share <= 0.0) { return first; }
  if (share >= 1.0) { return next; }
  let top = max(first.w + 1.0 - share, next.w + share) - MEET_DEPTH;
  let first_weight = max(first.w + 1.0 - share - top, 0.0);
  let next_weight = max(next.w + share - top, 0.0);
  return (first * first_weight + next * next_weight) / max(first_weight + next_weight, 1e-4);
}

// The paths and streets painted on the land (GroundPaint): each channel's distance from its edge, with a noise on it so
// an edge wanders as a trodden one does, soft across a pixel; a path paler in its middle and darker at its edges,
// where the grass is worn into it. Read only where a painting lies (view.paint.w), and only on dry land.
fn painted(colour: vec3f, point: vec2f, at: vec2f, footprint: f32) -> vec3f {
  let earth = PATH_EARTH * tile_grain(DIRT_TILE, at);
  let stones = PAVING_STONE * tile_grain(PAVING_TILE, at);
  let uv = (point - view.paint.xy) * view.paint.z / vec2f(textureDimensions(ground_paint));
  let held = view.paint.w > 0.5 && all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0));
  let reach = (textureSampleLevel(ground_paint, paint_sampler, uv, 0.0).rg * 255.0 - 128.0) / 32.0;
  let ragged = (grove_noise(point, 1.3, 83) - 0.5) * 0.9 + (grove_noise(point, 0.45, 89) - 0.5) * 0.35;
  let soft = max(0.15, footprint);
  let dirt = smoothstep(-soft, soft, reach.x + ragged) * select(0.0, 1.0, held);
  let paving = smoothstep(-soft, soft, reach.y + ragged * 0.5) * select(0.0, 1.0, held);
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

fn grove_at(world: vec2f) -> f32 {
  return 0.55 * grove_noise(world, 560.0, 17) + 0.3 * grove_noise(world, 230.0, 29) + 0.15 * grove_noise(world, 90.0, 41);
}

// The biome's woods on the land: the forest floor darker under the groves near, where the trees are drawn, and their
// canopy's colour as the trees' sprites fade out (4.8 to 6 km, nature's TREE reach); none on the beach, on ground too
// steep for trees, or near the snow line. A grove's trees cover the ground thickly from afar, crowns and sides together.
fn wooded(colour: vec3f, world: vec2f, bed: f32, slope: f32, distance_to: f32) -> vec3f {
  if (view.woods.w <= 0.0) { return colour; }
  let in_grove = smoothstep(0.4, 0.6, grove_at(world));
  let gather = view.world.z;
  let density = (1.0 + gather * (2.0 * in_grove - 1.0)) / (1.0 + gather);
  var cover = 1.0 - exp(-4.0 * view.woods.w * density);
  cover *= smoothstep(2.0, 2.5, bed) * (1.0 - smoothstep(0.6, 0.75, slope));
  cover *= 1.0 - smoothstep(view.ground.w - 300.0, view.ground.w - 100.0, bed);
  let far = smoothstep(4800.0, 6000.0, distance_to);
  return mix(colour * mix(1.0, 0.72, cover), mix(colour, view.woods.rgb, cover), far);
}
`;
