// The weather pass's WGSL: one triangle over the whole picture. Each pixel works out how far its ray runs to what is
// drawn there (the scene's depth, else the sea at height 0, else the sky) and lays the weather over it in layers:
// the overcast's dimming and its ceiling, mist, a cloud layer marched through, the deep's blue, rain and snow round
// the eye, a bolt and the flash. Its blend keeps `alpha` of what is there and adds `rgb`, so one draw both dims the
// sun's light and adds the weather's own, with no copy of the picture.

import { LIGHT_MOTION_WGSL } from '../light/flicker.ts';

/** Each row of `Frame`, as atmosphere.ts packs it. */
export const ATMOSPHERE_WGSL = /* wgsl */ `
${LIGHT_MOTION_WGSL}
struct Frame {
  eye: vec4f,      // world metres, then seconds
  forward: vec4f,  // then the depth law's scale
  right: vec4f,    // then its offset
  up: vec4f,       // then tan(half the view's height)
  screen: vec4f,   // width, height, flash, deep
  amounts: vec4f,  // overcast, rain, snow, mist
  wind: vec4f,     // east, south
  glow: vec4f,     // colour, strength
  cloud: vec4f,    // base, top, cover
  bolt: vec4f,     // east and south of the eye, seed, 1 when there is one
  cloud_light: vec4f, // the light on the cloud flown through
}
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var depths: texture_2d<f32>;

const NO_HIT = 1.0e7;

@vertex fn whole(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn mixed(value: u32) -> u32 {
  var state = value * 747796405u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (state >> 22u) ^ state;
}
fn unit(value: u32) -> f32 { return f32(mixed(value)) / 4294967296.0; }
fn cell_unit(cell: vec2f, salt: u32) -> f32 {
  let whole = vec2i(cell);
  return unit((bitcast<u32>(whole.x) * 1597334677u) ^ mixed(bitcast<u32>(whole.y) ^ salt));
}
fn corner3(cell: vec3f) -> f32 {
  let whole = vec3i(cell);
  return unit((bitcast<u32>(whole.x) * 1597334677u) ^ mixed((bitcast<u32>(whole.y) * 3812015801u) ^ mixed(bitcast<u32>(whole.z))));
}
fn noise3(point: vec3f) -> f32 {
  let base = floor(point);
  let part = point - base;
  let eased = part * part * (3.0 - 2.0 * part);
  let low = mix(
    mix(corner3(base), corner3(base + vec3f(1.0, 0.0, 0.0)), eased.x),
    mix(corner3(base + vec3f(0.0, 1.0, 0.0)), corner3(base + vec3f(1.0, 1.0, 0.0)), eased.x), eased.y);
  let high = mix(
    mix(corner3(base + vec3f(0.0, 0.0, 1.0)), corner3(base + vec3f(1.0, 0.0, 1.0)), eased.x),
    mix(corner3(base + vec3f(0.0, 1.0, 1.0)), corner3(base + vec3f(1.0, 1.0, 1.0)), eased.x), eased.y);
  return mix(low, high, eased.z);
}
fn billows(point: vec3f) -> f32 {
  return noise3(point) * 0.55 + noise3(point * 2.03 + 17.0) * 0.3 + noise3(point * 4.1 + 41.0) * 0.15;
}

// What a layer does to the picture so far: keeps 'keep' of it and adds 'add' over.
struct Laid { add: vec3f, keep: f32 }
fn over(under: Laid, add: vec3f, keep: f32) -> Laid { return Laid(add + under.add * keep, under.keep * keep); }

// Drops on a cylinder 'radius' metres round the eye, falling 'fall' m/s and blown by the wind across the view, so
// each streak slants as the wind would carry it. Gives how much of a drop covers this ray.
fn falling(ray: vec3f, radius: f32, fall: f32, density: f32, stretch: f32, salt: u32, round: bool) -> f32 {
  let flat = max(length(ray.xy), 0.08);
  let height = ray.z * radius / flat;
  let bearing = atan2(ray.y, ray.x);
  let across = dot(frame.wind.xy, vec2f(-sin(bearing), cos(bearing)));
  let pixel_m = radius * 2.0 * frame.up.w / frame.screen.y;
  let spacing = vec2f(radius * 0.02, radius * 0.16);
  let shear = across / fall;
  var place = vec2f(bearing * radius + shear * height, height + fall * frame.eye.w);
  if (round) { place.x += sin(frame.eye.w * 1.3 + floor(place.y / spacing.y) * 2.1) * spacing.x * 0.3; }
  let cell = floor(place / spacing);
  if (cell_unit(cell, salt) > density) { return 0.0; }
  let centre = (cell + vec2f(0.2 + 0.6 * cell_unit(cell, salt + 1u), 0.5)) * spacing;
  let off = place - centre;
  if (round) {
    let size = max(pixel_m * 1.2, radius * 0.004);
    // A flake is round on the screen, not in the wind-sheared space its fall is laid out in.
    return smoothstep(size, size * 0.4, length(vec2f(off.x - shear * off.y, off.y)));
  }
  let width = pixel_m * 0.8;
  let along = abs(off.y) / (spacing.y * 0.5 * stretch);
  return smoothstep(width, width * 0.3, abs(off.x)) * (1.0 - smoothstep(0.6, 1.0, along));
}

// The bolt's crooked line between two screen points, with 'seed' bending it: how far 'pixel' lies from it.
fn crooked(pixel: vec2f, top: vec2f, bottom: vec2f, seed: f32) -> f32 {
  let span = bottom - top;
  let reach = length(span);
  let along = clamp(dot(pixel - top, span) / (reach * reach), 0.0, 1.0);
  let side = vec2f(-span.y, span.x) / reach;
  let bend = (noise3(vec3f(along * 6.0, seed, 0.0)) - 0.5) * 0.22 + (noise3(vec3f(along * 23.0, seed, 3.0)) - 0.5) * 0.06;
  let point = top + span * along + side * bend * reach * sin(along * 3.14159);
  return length(pixel - point);
}

fn on_screen(offset: vec3f) -> vec3f {
  let ahead = dot(offset, frame.forward.xyz);
  let aspect = frame.screen.x / frame.screen.y;
  let across = dot(offset, frame.right.xyz) / ahead / (frame.up.w * aspect);
  let upward = dot(offset, frame.up.xyz) / ahead / frame.up.w;
  return vec3f((across + 1.0) * 0.5 * frame.screen.x, (1.0 - upward) * 0.5 * frame.screen.y, ahead);
}

@fragment fn atmosphere(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = frame.screen.xy;
  let screen = vec2f(position.x / size.x * 2.0 - 1.0, 1.0 - position.y / size.y * 2.0);
  let ray = normalize(frame.forward.xyz + frame.right.xyz * screen.x * frame.up.w * size.x / size.y
    + frame.up.xyz * screen.y * frame.up.w);
  let eye = frame.eye.xyz;
  let depth = textureLoad(depths, vec2i(position.xy), 0).r;
  // The water writes no depth, so what lies under the sea's surface is seen only as far as the surface.
  var distance = NO_HIT;
  if (depth > 0.0) { distance = frame.right.w / (depth + frame.forward.w) / max(dot(ray, frame.forward.xyz), 0.01); }
  if (eye.z * ray.z < 0.0) { distance = min(distance, -eye.z / ray.z); }
  let sky = distance >= NO_HIT;
  let overcast = frame.amounts.x;
  let flash = frame.screen.z;
  let deep = frame.screen.w;
  var laid = Laid(vec3f(0.0), 1.0);

  // The overcast dims the sun's light and greys it; the sky becomes a low ceiling, mottled and drifting.
  let ceiling_colour = mix(vec3f(0.52, 0.55, 0.59), vec3f(0.075, 0.085, 0.105), overcast);
  if (sky && overcast > 0.0) {
    let reach = (1500.0 - eye.z) / max(ray.z, 0.03);
    let ceiling = (eye.xy + ray.xy * reach - frame.wind.xy * frame.eye.w * 4.0) / 900.0;
    let mottle = 0.75 + 0.5 * billows(vec3f(ceiling, frame.eye.w * 0.02));
    laid = over(laid, ceiling_colour * mottle * overcast, 1.0 - overcast * 0.97);
  } else {
    laid = over(laid, vec3f(0.006, 0.009, 0.016) * overcast, 1.0 - overcast * 0.62);
  }

  // Mist, rain and snow thicken the air: at a mist of 1 a ship 300 m off is a shadow and 600 m off is gone.
  let thickness = frame.amounts.w * 0.0063 + overcast * 0.0005 + frame.amounts.y * 0.0012 + frame.amounts.z * 0.0018;
  if (thickness > 0.0) {
    let fogged = select(1.0 - exp(-thickness * distance), 1.0 - exp(-thickness * 2500.0), sky);
    let haze = mix(vec3f(0.6, 0.64, 0.68), ceiling_colour, min(overcast * 1.3, 1.0));
    laid = over(laid, haze * fogged, 1.0 - fogged);
  }

  // A layer of cloud marched through between its base and top, as far as what is drawn.
  let cover = frame.cloud.z;
  if (cover > 0.0) {
    let rise = select(min(ray.z, -1.0e-4), max(ray.z, 1.0e-4), ray.z >= 0.0);
    let enter = (frame.cloud.x - eye.z) / rise;
    let leave = (frame.cloud.y - eye.z) / rise;
    let start = max(min(enter, leave), 0.0);
    let end = min(max(enter, leave), min(distance, 3000.0));
    if (end > start) {
      let step = (end - start) / 16.0;
      var through = 1.0;
      let drift = vec3f(frame.wind.xy * frame.eye.w, 0.0);
      for (var index = 0; index < 16; index++) {
        let point = eye + ray * (start + step * (f32(index) + 0.5)) - drift;
        let thick = smoothstep(1.0 - cover, 1.0 - cover + 0.2, billows(point * vec3f(0.006, 0.006, 0.012)));
        through *= exp(-thick * step * 0.012);
      }
      // Mottled broadly where it is entered, so a sea of cloud seen from over it is never one flat colour.
      let entry = eye + ray * start - drift;
      let mottle = 0.82 + 0.25 * billows(entry * vec3f(0.0025, 0.0025, 0.005));
      let lit = mix(vec3f(0.93, 0.94, 0.96) * frame.cloud_light.rgb * mottle, ceiling_colour * 1.6, overcast);
      laid = over(laid, lit * (1.0 - through), through);
    }
  }

  // The deep: the sea's dark blue closing in, motes drifting, and fire above flickering through the surface.
  if (deep > 0.0) {
    let sunk = 1.0 - exp(-0.06 * min(distance, 400.0));
    laid = over(laid, vec3f(0.006, 0.035, 0.09) * sunk * deep, 1.0 - deep * (0.7 + 0.3 * sunk));
    let upward = max(ray.z, 0.0);
    if (frame.glow.w > 0.0 && upward > 0.0) {
      let surface = eye.xy + ray.xy * max(-eye.z, 1.0) / max(ray.z, 0.05);
      // The fire's light comes through the surface in patches that the waves break up and the flames flicker.
      let patches = smoothstep(0.35, 0.8, noise3(vec3f(surface * 0.18, frame.eye.w * 1.4)));
      let flicker = (0.3 + 0.7 * patches) * light_flicker(1.0, frame.eye.w, 1.25);
      let light = frame.glow.rgb * frame.glow.w * flicker * pow(upward, 2.5) * deep;
      laid = over(laid, light * 0.9, 1.0);
    }
    var motes = 0.0;
    for (var layer = 0u; layer < 3u; layer++) {
      let radius = 2.5 * pow(2.4, f32(layer));
      if (distance > radius) { motes += falling(ray, radius, 0.05, 0.12, 1.0, 70u + layer * 5u, true); }
    }
    laid = over(laid, vec3f(0.22, 0.32, 0.36) * motes * deep * 0.5, 1.0);
  }

  // Rain and snow round the eye, nearest layers last; each hides behind what is drawn nearer than it.
  let rain = frame.amounts.y;
  if (rain > 0.0) {
    var streaks = 0.0;
    for (var layer = 0u; layer < 4u; layer++) {
      let radius = 2.0 * pow(2.2, f32(layer));
      if (distance > radius) { streaks += falling(ray, radius, 9.0, rain * 0.45, 0.3, 10u + layer * 5u, false); }
    }
    let wet = mix(vec3f(0.55, 0.6, 0.66), vec3f(0.3, 0.33, 0.38), overcast) + vec3f(0.5) * flash;
    laid = over(laid, wet * min(streaks, 1.0) * 0.4, 1.0 - min(streaks, 1.0) * 0.2);
  }
  let snow = frame.amounts.z;
  if (snow > 0.0) {
    var flakes = 0.0;
    for (var layer = 0u; layer < 4u; layer++) {
      let radius = 2.0 * pow(2.2, f32(layer));
      if (distance > radius) { flakes += falling(ray, radius, 1.1, snow * 0.35, 1.0, 40u + layer * 5u, true); }
    }
    laid = over(laid, vec3f(0.92, 0.94, 0.97) * min(flakes, 1.0), 1.0 - min(flakes, 1.0));
  }

  // The bolt, forking twice, behind whatever is drawn nearer than it; and the flash lights the whole scene.
  if (frame.bolt.w > 0.0 && flash > 0.0) {
    let foot = vec3f(frame.bolt.xy, -eye.z);
    let head = foot + vec3f(0.0, 0.0, 450.0);
    let low = on_screen(foot);
    let high = on_screen(head);
    let bolt_m = length(frame.bolt.xy);
    if (low.z > 1.0 && high.z > 1.0 && distance > bolt_m) {
      let seed = frame.bolt.z;
      let pixel = position.xy;
      var near_px = crooked(pixel, high.xy, low.xy, seed);
      let span = low.xy - high.xy;
      let side = vec2f(-span.y, span.x);
      let first = mix(high.xy, low.xy, 0.45);
      let second = mix(high.xy, low.xy, 0.7);
      let branch_one = crooked(pixel, first, first + span * 0.35 + side * 0.25, seed + 11.0);
      let branch_two = crooked(pixel, second, second + span * 0.25 - side * 0.2, seed + 23.0);
      near_px = min(near_px, min(branch_one + 0.6, branch_two + 0.9));
      let core = exp(-near_px / 1.3) + exp(-near_px / 14.0) * 0.35;
      laid = over(laid, vec3f(0.85, 0.9, 1.0) * core * flash, 1.0);
    }
  }
  if (flash > 0.0) {
    laid = over(laid, vec3f(0.42, 0.46, 0.6) * flash * (0.1 + overcast * 0.15), 1.0);
    laid.keep = mix(laid.keep, 1.0, flash * 0.45);
  }
  return vec4f(laid.add, laid.keep);
}
`;
