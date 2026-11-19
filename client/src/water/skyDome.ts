/**
 * The sky the water's passes draw: the dome's colours with the twilight's glow toward the sun, the stars wheeling
 * about the pole, the moon by its phase, the sun's disc and halo, two layers of cloud by the weather, lit by the key
 * light, the lightning's flash and the weather's fog over it all. It needs WATER_WGSL's frame (the pixel's size).
 * Every noise scale on a cloud plane is a whole number of quarters: the drift wraps at 1024 cells and the noise
 * repeats every 256, so the wrap never shows.
 */
export const SKY_DOME_WGSL = /* wgsl */ `
const DECK_OCTAVES = vec4f(1.0, 2.25, 4.75, 9.5);
const DECK_WEIGHTS = vec4f(0.5, 0.27, 0.15, 0.08);
const SUN_RADIUS = 0.0105;
const MOON_RADIUS = 0.016;
const STAR_CELLS = 110.0;

fn luma(colour: vec3f) -> f32 {
  return dot(colour, vec3f(0.2126, 0.7152, 0.0722));
}

fn hash3(cell: vec3f) -> vec3f {
  var bits = bitcast<vec3u>(vec3i(cell)) * 1664525u + 1013904223u;
  bits.x += bits.y * bits.z;
  bits.y += bits.z * bits.x;
  bits.z += bits.x * bits.y;
  bits = bits ^ (bits >> vec3u(16u));
  bits.x += bits.y * bits.z;
  bits.y += bits.z * bits.x;
  bits.z += bits.x * bits.y;
  return vec3f(bits) / 4294967295.0;
}

// The warm light of the low sun in the air near it: gold while it stands a little up, deepening to red as it sets,
// gone once it is 12 degrees under. 0 by day.
fn twilight_glow() -> vec3f {
  let height = sky_state.sun.z;
  let strength = smoothstep(-0.21, -0.02, height) * (1.0 - smoothstep(0.04, 0.3, height));
  let colour = mix(vec3f(0.95, 0.34, 0.12), vec3f(1.0, 0.64, 0.3), smoothstep(-0.1, 0.03, height));
  return colour * strength * (1.0 - 0.85 * sky_state.zenith.w);
}

// The dome's own colour along 'direction', without cloud, stars or bodies: the gradient the weather has set, the glow
// low toward the sun's bearing, the pink band and the earth's shadow opposite it, and the fog's veil.
fn sky_haze(direction: vec3f) -> vec3f {
  let up = direction.z;
  let lifted = clamp(up, 0.0, 1.0);
  var colour = mix(sky_state.horizon.rgb, sky_state.zenith.rgb, pow(lifted, 0.45));
  let level = normalize(direction.xy + vec2f(1e-5, 0.0));
  let sun_level = normalize(sky_state.sun.xy + vec2f(1e-5, 0.0));
  let toward = 0.5 + 0.5 * dot(level, sun_level);
  let glow = twilight_glow();
  // The glow takes the blue's place rather than adding to it, and pales toward gold higher up, so the two never mix
  // into purple.
  let low_glow = pow(toward, 3.0) * exp(-lifted * 7.0);
  let high_glow = pow(toward, 6.0) * exp(-lifted * 3.5) * 0.4;
  let near_glow = min(low_glow + high_glow, 1.0);
  colour = colour * (1.0 - 0.6 * clamp(luma(glow) * 1.6, 0.0, 1.0) * near_glow);
  colour += (glow * low_glow + luma(glow) * vec3f(1.05, 0.9, 0.65) * high_glow) * 0.9;
  // Opposite the sun just after it sets: the earth's shadow, bluer, low; a pink band over it.
  let opposite = pow(1.0 - toward, 2.0) * luma(glow);
  colour += vec3f(0.5, 0.3, 0.42) * opposite * smoothstep(0.02, 0.1, lifted) * (1.0 - smoothstep(0.12, 0.3, lifted)) * 0.5;
  colour = mix(colour, colour * vec3f(0.7, 0.78, 0.95), opposite * (1.0 - smoothstep(0.0, 0.08, lifted)) * 0.6);
  // Under the horizon (seen only in a reflection) the air darkens.
  colour = mix(colour, sky_state.horizon.rgb * vec3f(0.58, 0.68, 0.78), 1.0 - smoothstep(-0.3, 0.0, up));
  // The weather's fog closes in overhead as well, wholly near the horizon.
  let veil = 1.0 - exp(-sky_state.fog.w * 150.0 / max(up, 0.05));
  return mix(colour, sky_state.fog.rgb, veil);
}

// The stars along a direction: turned back about the pole (as high as the place's latitude, due north) by the
// night's turn, each a point a cell, its brightness from a steep spread so a few are bright and most faint.
fn star_light(direction: vec3f, blur: f32) -> vec3f {
  let shown = sky_state.weather.z * smoothstep(0.0, 0.2, direction.z) * (1.0 - smoothstep(0.0, 0.03, blur));
  if (shown <= 0.0) { return vec3f(0.0); }
  let latitude = sky_state.drift.z;
  let pole = vec3f(0.0, -cos(latitude), sin(latitude));
  let turn = -sky_state.weather.w;
  let turned = direction * cos(turn) + cross(pole, direction) * sin(turn) + pole * dot(pole, direction) * (1.0 - cos(turn));
  let cell = floor(turned * STAR_CELLS);
  let seed = hash3(cell);
  if (seed.x < 0.93) { return vec3f(0.0); }
  let centre = normalize(cell + 0.3 + 0.4 * hash3(cell + vec3f(17.0, 5.0, 11.0)));
  let apart = length(turned - centre);
  let pixel = 2.0 * frame.forward.w / frame.view.y;
  let size = max(pixel * 1.5, 0.0006);
  let bright = pow(fract(seed.y * 7.13), 6.0) * 2.2 + 0.12;
  let twinkle = 0.8 + 0.2 * sin(frame.eye.w * (2.0 + 5.0 * seed.z) + seed.z * TAU);
  let tint = mix(vec3f(0.72, 0.82, 1.0), vec3f(1.0, 0.88, 0.72), seed.z);
  return tint * bright * twinkle * shown * (1.0 - smoothstep(size * 0.3, size, apart));
}

// The moon's disc along a direction, lit on the sun's side by its phase (0 new, a half full), with a little light
// on its dark side; its alpha in w, so what lies behind it is hidden. A faint halo round it is in the rgb too.
fn moon_light(direction: vec3f) -> vec4f {
  let moon = sky_state.moon.xyz;
  if (moon.z < -0.05 || direction.z < 0.0) { return vec4f(0.0); }
  let night = 1.0 - 0.75 * sky_state.sun.w;
  let apart = acos(clamp(dot(direction, moon), -1.0, 1.0));
  let halo = (exp(-apart / 0.04) * 0.07 + exp(-apart / 0.3) * 0.025) * sky_state.moon.w * night;
  var out = vec4f(vec3f(0.62, 0.7, 0.9) * halo, 0.0);
  if (apart > MOON_RADIUS * 1.2) { return out; }
  let right = normalize(cross(moon, vec3f(0.0, 0.0, 1.0)) + vec3f(1e-5, 0.0, 0.0));
  let above = cross(right, moon);
  let on_disc = vec2f(dot(direction, right), dot(direction, above)) / MOON_RADIUS;
  let inside = dot(on_disc, on_disc);
  let normal = on_disc.x * right + on_disc.y * above - sqrt(max(1.0 - inside, 0.0)) * moon;
  let phase = sky_state.drift.w * TAU;
  let sun_side = normalize(sky_state.sun.xyz - moon * dot(sky_state.sun.xyz, moon) + vec3f(0.0, 0.0, 1e-5));
  let light = normalize(sun_side * abs(sin(phase)) + moon * cos(phase) + vec3f(0.0, 0.0, 1e-5));
  let lit = smoothstep(-0.04, 0.08, dot(normal, light));
  let seas = 0.62 + 0.3 * smoothstep(0.35, 0.65, value_noise(on_disc * 2.25 + vec2f(3.0, 7.0))) + 0.08 * value_noise(on_disc * 6.5);
  let face = vec3f(0.97, 0.95, 0.9) * (lit * seas * 0.95 + 0.04) * night;
  let edge = 1.0 - smoothstep(0.9, 1.0, sqrt(inside));
  // By day the face only adds to the sky's blue, as the real one does; by night the disc hides the stars behind it.
  return vec4f(mix(out.rgb, face, edge), edge * (1.0 - sky_state.sun.w));
}

// The cumulus deck's noise at a point of its plane: the octaves the blur leaves ('keep'), the rest at their mean.
fn deck_noise(plane: vec2f, keep: vec4f) -> f32 {
  var sum = 0.5;
  for (var index = 0; index < 4; index++) {
    if (keep[index] <= 0.0) { continue; }
    let offset = vec2f(f32(index) * 37.0, f32(index) * 11.0);
    sum += (value_noise(plane * DECK_OCTAVES[index] + offset) - 0.5) * DECK_WEIGHTS[index] * keep[index];
  }
  return sum;
}

// The clouds along an upward direction, their colour and alpha: high thin cirrus streaked along the drift and the
// cumulus deck by the weather's cover, lower and darker in a storm. Both are lit by the key light, brighter on their
// side toward it, a silver edge round the sun, darker underneath; a lightning flash lights them from within.
fn cloud_light(direction: vec3f, blur: f32) -> vec4f {
  let up = direction.z;
  if (up <= 0.0) { return vec4f(0.0); }
  let cover = sky_state.zenith.w;
  let storm = sky_state.horizon.w;
  let flash = sky_state.weather.y;
  let ambient = mix(sky_state.horizon.rgb, sky_state.zenith.rgb, 0.5);
  let grey = mix(ambient, vec3f(luma(ambient)), 0.55);
  let key = sky_state.key.xyz;
  let key_light = sky_state.key_light.rgb + twilight_glow() * 0.9 * step(0.999, dot(key, sky_state.sun.xyz));
  let toward_key = max(dot(direction, key), 0.0);
  let silver = pow(toward_key, 12.0) * 1.4 + pow(toward_key, 3.0) * 0.25;

  // Cirrus, far up: streaks long along the drift (east), drifting twice as fast as the deck.
  let high = direction.xy / (up + 0.02) * 0.3 + vec2f(sky_state.drift.x * 2.0, 0.0);
  let wisp_keep = 1.0 - smoothstep(0.25, 1.0, blur * 0.3 / ((up + 0.02) * (up + 0.02)) * 4.0);
  let wisps = value_noise(high * vec2f(1.0, 4.0)) * 0.65 + (value_noise(high * vec2f(2.25, 9.0) + vec2f(5.0, 3.0)) - 0.5) * 0.35 * wisp_keep;
  let wisp = smoothstep(0.5, 0.85, wisps) * (0.18 + 0.3 * cover) * smoothstep(0.02, 0.2, up);
  let wisp_colour = grey * 0.9 + key_light * (0.45 + silver) + twilight_glow() * 0.35;

  // The deck: lower in a storm, so its cells loom larger.
  let reach_scale = 0.9 / (1.0 - 0.4 * storm);
  let plane = direction.xy / (up + 0.08) * reach_scale + sky_state.drift.xy;
  let reach = blur * reach_scale / ((up + 0.08) * (up + 0.08));
  let keep = vec4f(1.0) - smoothstep(vec4f(0.25), vec4f(1.0), reach * DECK_OCTAVES);
  let puff = deck_noise(plane, keep);
  // The detail averaged away softens the edge, so however blurred the deck keeps its mean cover.
  let lost = length((vec4f(1.0) - keep) * DECK_WEIGHTS) * 0.5;
  let threshold = 0.74 - 0.66 * cover;
  let density = smoothstep(threshold - lost, threshold + 0.2 + lost, puff);
  let alpha = density * smoothstep(0.0, 0.12, up) * (0.85 + 0.15 * cover);
  var out = vec4f(wisp_colour, wisp);
  if (alpha > 0.0) {
    let toward_plane = normalize(key.xy + vec2f(1e-5, 0.0)) * 0.3;
    let lit = clamp(0.55 + (puff - deck_noise(plane + toward_plane, keep * vec4f(1.0, 1.0, 1.0, 0.0))) * 4.0, 0.0, 1.0);
    let thick = smoothstep(threshold, threshold + 0.45, puff);
    let shade = (1.2 - 0.75 * thick) * (1.0 - 0.6 * storm);
    var colour = grey * shade + key_light * (0.2 + 0.55 * lit + silver * (1.0 - thick)) * (1.0 - 0.5 * storm);
    colour += vec3f(0.75, 0.8, 1.0) * flash * (0.5 + 1.5 * thick) * (0.6 + 0.8 * value_noise(plane * 0.5));
    out = vec4f(mix(out.rgb * out.a, colour, alpha) / max(mix(out.a, 1.0, alpha), 1e-4), mix(out.a, 1.0, alpha));
  }
  return out;
}

// The sky along 'direction'. 'blur' is how far apart, in radians, the rays a pixel gathers are: a reflection off
// waves too small to draw gathers a cone of them, so detail finer than that averages out.
fn sky(direction: vec3f, blur: f32) -> vec3f {
  var colour = sky_haze(direction);
  let clear = exp(-sky_state.fog.w * 150.0 / max(direction.z, 0.05));
  colour += star_light(direction, blur) * clear;
  let moon = moon_light(direction);
  colour = mix(colour + moon.rgb * clear, moon.rgb, moon.a * clear);
  let toward = max(dot(direction, sky_state.sun.xyz), 0.0);
  let low = 1.0 - smoothstep(0.0, 0.4, sky_state.sun.z);
  let sun_colour = sky_state.key_light.rgb * step(0.999, dot(sky_state.key.xyz, sky_state.sun.xyz));
  let disc = smoothstep(cos(SUN_RADIUS * 1.15), cos(SUN_RADIUS), toward) * (1.0 - smoothstep(0.0, 0.02, blur));
  let halo = pow(toward, 400.0) * 0.4 + pow(toward, 24.0) * (0.1 + 0.1 * low) + pow(toward, 5.0) * 0.05 * low;
  // The disc keeps its own hue at full brightness, so a low orange sun still stands out of its glow.
  let disc_colour = sun_colour / max(max(sun_colour.r, sun_colour.g), max(sun_colour.b, 1e-3)) * 1.8;
  let clouds = cloud_light(direction, blur);
  colour = mix(mix(colour, disc_colour, disc * clear * step(1e-4, luma(sun_colour))), clouds.rgb, clouds.a * clear);
  colour += sun_colour * halo * (1.0 - 0.6 * clouds.a) * (0.3 + 0.7 * clear);
  return colour;
}
`;
