// The ground's tile pictures and the grain they give a surface, which the land's terrain (terrain/groundColour.ts)
// and the islands (islands/isleShader.ts) both wear: groundwork either may import.

/** The ground's tile pictures the terrain wears, in this order in the array `wearTiles` is handed: the low ground's
 *  grass, the dirt of the highlands, roads and paths, the stone of bare rock, snow, a beach's sand, and a town's
 *  paving; and the caverns' layered rock, which the islands' cliffs and walls wear. */
export const TILE_LAYERS = ['grass', 'dirt', 'stone', 'snow', 'sand', 'paving', 'rock'] as const;

/** A ground tile's side in metres, as Daggerfall laid them, and the second, wider and turned, reading of it that
 *  breaks up its repeats. */
export const TILE_M = 6.4;
export const WIDE_TILE_M = 33.9;
export const TILE_TURN = 0.61;

/**
 * The ground tiles' grain, which the land and the islands both wear (isleShader.ts): the tiles' order, how a tile's
 * texel stands over its mean, how one class gives way to the next by their grains, and a tile cast on a face from the
 * three axes. WGSL for a shader that declares `ground_tiles` (TILE_LAYERS' pictures) and `tile_sampler`.
 */
export const TILE_GRAIN_WGSL = /* wgsl */ `
const TILE_M = ${TILE_M};
const WIDE_TILE_M = ${WIDE_TILE_M};
const TURN = mat2x2f(${Math.cos(TILE_TURN)}, ${Math.sin(TILE_TURN)}, ${-Math.sin(TILE_TURN)}, ${Math.cos(TILE_TURN)});
const GRASS_TILE = 0;
const DIRT_TILE = 1;
const STONE_TILE = 2;
const SNOW_TILE = 3;
const SAND_TILE = 4;
const PAVING_TILE = 5;
const ROCK_TILE = 6;
// How sharply one class gives way to the next by their grains (meet), how much higher bare rock stands than what
// grows over it, and how far snow lies in a tile's hollows before its rises.
const MEET_DEPTH = 0.2;
const ROCK_STANDS = 0.15;
const SNOW_SETTLES = 0.1;
// The weights of a colour's light, and how much of a grain's own hue the ground keeps.
const LUMA = vec3f(0.3, 0.59, 0.11);
const GRAIN_HUE = 0.3;

// A tile's mean colour: its coarsest level.
fn tile_mean(layer: i32) -> vec3f {
  return max(textureSampleLevel(ground_tiles, tile_sampler, vec2f(0.5), layer, 16.0).rgb, vec3f(0.02));
}

// A ground tile's grain, as a factor on its class's colour: the tile over its own mean, read plainly at 'plain' and
// again wider and turned at 'wide' (both in tiles), so its repeats do not line up. A tile not painted yet, and the far
// ground its finest levels average away, is 1 throughout.
fn tile_grain_at(layer: i32, plain: vec2f, wide: vec2f) -> vec3f {
  let mean = tile_mean(layer);
  let near = textureSample(ground_tiles, tile_sampler, plain, layer).rgb;
  let far = textureSample(ground_tiles, tile_sampler, wide, layer).rgb;
  return grain_of(near, mean, 2.5) * mix(vec3f(1.0), grain_of(far, mean, 2.0), 0.55);
}

// A tile cast on a face from the three axes (its readings across x, along y and from above, in tiles) and blended by
// how the face is turned, so a steep face is not stretched where a reading from above would run down it.
fn cast_grain(layer: i32, across: vec2f, along: vec2f, flat: vec2f, normal: vec3f) -> vec3f {
  let mean = tile_mean(layer);
  let from_x = textureSample(ground_tiles, tile_sampler, across, layer).rgb;
  let from_y = textureSample(ground_tiles, tile_sampler, along, layer).rgb;
  let from_z = textureSample(ground_tiles, tile_sampler, flat, layer).rgb;
  var weights = pow(abs(normal), vec3f(4.0));
  weights /= weights.x + weights.y + weights.z;
  return grain_of(from_x * weights.x + from_y * weights.y + from_z * weights.z, mean, 2.5);
}

// A texel over its tile's mean, mostly by its light: a channel a dark tile holds little of would otherwise swing
// wildly from texel to texel and speckle the ground with colours the tile never shows.
fn grain_of(texel: vec3f, mean: vec3f, most: f32) -> vec3f {
  let light = dot(texel, LUMA) / max(dot(mean, LUMA), 0.02);
  return clamp(mix(vec3f(light), texel / mean, GRAIN_HUE), vec3f(0.0), vec3f(most));
}

// How high a grain stands, from its light: a tile's stones and tufts are painted lit from above, its gaps dark.
fn raised(grain: vec3f) -> f32 {
  return dot(grain, LUMA) - 1.0;
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
`;
