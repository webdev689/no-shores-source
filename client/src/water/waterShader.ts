import { SHADOW_WGSL } from '../shadow.ts';
import { HULL_WGSL } from './hullMask.ts';
import { SHELTER_WGSL } from './seaWeather.ts';
import { SKY_DOME_WGSL } from './skyDome.ts';
import { SHARED_WGSL, WATER_WGSL } from './waterCommon.ts';
import { WAKE_WGSL } from './wakes.ts';

/**
 * The water's two draws after the land. The backdrop fills every pixel first: the sky, the land in its haze, or,
 * with the eye under water, the land seen through it with the sun's shafts. Then the surface: a disc of rings round
 * the eye, finer near it, drawn far rings first so a near crest covers a far one. From above it shows the land
 * through the water (bent and tinted by its depth), the sky's reflection, the sun's glints, the light through the
 * crests and the foam; from below, the sky through the window above and the deep everywhere else.
 */
export const WATER_SHADER = /* wgsl */ `
${SHARED_WGSL}
${WATER_WGSL}
${SKY_DOME_WGSL}
${HULL_WGSL}
${WAKE_WGSL}
${SHELTER_WGSL}
${SHADOW_WGSL}

fn eye_fresh() -> bool {
  return frame.coarse_area.y > 0.5;
}

// The eye's depth under its water, metres; negative above it.
fn eye_below() -> f32 {
  return (frame.view.w - frame.eye.z) / frame.depth_terms.w;
}

// The sun's shafts down through the water along a ray from the eye: the light its rippling surface gathers, followed
// back up toward the sun from points along the ray, fading with depth and distance.
fn shafts(direction: vec3f, reach_to: f32, pixel: vec2f) -> vec3f {
  let sun_under = normalize(vec3f(key_toward().xy * 0.75, key_toward().z));
  // An even scatter of start points (interleaved gradient noise) reads as fine grain, not static.
  let jitter = fract(52.9829189 * fract(dot(pixel, vec2f(0.06711056, 0.00583715))));
  var light = 0.0;
  for (var index = 0; index < 10; index++) {
    let along = (f32(index) + jitter) / 10.0 * reach_to;
    let point = direction * along;
    let below = eye_below() - point.z;
    if (below <= 0.0) { continue; }
    let surface_point = point.xy + sun_under.xy / sun_under.z * below + frame.local.xy;
    let net = cells(surface_point * 0.25, frame.eye.w * 0.5);
    light += (1.0 - smoothstep(0.0, 0.2, net.y - net.x)) * exp(-0.06 * below - 0.07 * along);
  }
  return SEA_GLOW * sky_state.key_light.rgb * light / 10.0 * 1.1 * min(reach_to, 30.0) / 30.0;
}

@vertex
fn backdrop_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn backdrop_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = position.xy;
  let direction = normalize(ray_through(pixel));
  let far = scene_distance(pixel);
  if (frame.eye.z + direction.z * frame.up.w < frame.view.w) {
    let time = frame.eye.w;
    let wobble = vec2f(sin(pixel.y * 0.045 + time * 2.1), cos(pixel.x * 0.038 + time * 1.7)) * 2.0;
    let look = clamp(pixel + wobble, vec2f(0.0), frame.view.xy - 1.0);
    let seen = select(vec3f(0.0), textureSampleLevel(scene_colour, smooth_sampler, look / frame.view.xy, 0.0).rgb, far < 1e8);
    let colour = through_water(seen, eye_fresh(), eye_below(), min(far, 1e4)) + shafts(direction, min(far, 60.0), pixel);
    return vec4f(colour, 1.0);
  }
  if (far >= 1e8) { return vec4f(sky(direction, 0.0), 1.0); }
  return vec4f(aerial(textureLoad(scene_colour, vec2i(pixel), 0).rgb, direction, far), 1.0);
}

// How hard the local wind works the water against the moderate breeze the chop was tuned in (5 m/s): near glassy in
// a calm, steeper in a gale, and roughened by falling rain.
fn wind_chop() -> f32 {
  let speed = length(sky_state.wind.xy) * (1.0 + 0.3 * sky_state.wind.z);
  return clamp(0.12 + 0.88 * speed / 5.0, 0.12, 1.8) + 0.25 * sky_state.wind.w;
}

// Whitecaps the wind raises from a fresh breeze up, in patches each breaking and fading on its own beat. They stay in
// place rather than travel, so neither the clock's hourly wrap nor a veering wind moves them; the beat (6 s) divides
// the hour.
fn wind_caps(local: vec2f) -> f32 {
  let speed = length(sky_state.wind.xy) * (1.0 + 0.3 * sky_state.wind.z);
  // Under a fresh breeze there are none, and their noise is not read.
  if (speed <= 6.0) {
    return 0.0;
  }
  let patches = value_noise(local * 0.25) * 0.6 + value_noise(local * 0.5 + vec2f(7.0, 3.0)) * 0.4;
  let beat = sin(frame.eye.w * TAU / 6.0 + patches * 12.0) * 0.1;
  return smoothstep(0.62, 0.8, patches + beat) * smoothstep(6.0, 14.0, speed);
}

// Raindrops' rings near the eye, as hard as it falls: a ring a cell (a third of a metre), spreading and fading on each
// drop's own clock; their slope, so the light shows them. Too far off for a pixel to hold them, none.
fn rain_rings(local: vec2f, footprint: f32) -> vec2f {
  let falling = sky_state.wind.w;
  if (falling <= 0.0 || footprint > 0.08) { return vec2f(0.0); }
  var slope = vec2f(0.0);
  for (var layer = 0; layer < 2; layer++) {
    let point = local * 3.0 + vec2f(f32(layer) * 0.5, f32(layer) * 0.37);
    let cell = floor(point);
    let seed = hash2(cell + vec2f(f32(layer) * 91.0, 0.0));
    if (seed.y > falling * 1.3) { continue; }
    let age = fract(frame.eye.w * 1.3 + seed.x);
    let away = point - (cell + 0.3 + 0.4 * hash2(cell + vec2f(13.0, 29.0)));
    let off_ring = (length(away) - age * 0.32) / 0.05;
    slope += away / max(length(away), 1e-3) * off_ring * exp(-off_ring * off_ring) * (1.0 - age) * 0.5;
  }
  return slope * (1.0 - smoothstep(0.03, 0.08, footprint));
}

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) offset: vec2f,
  @location(1) drawn: vec3f,
  // The still water's level at the vertex, before the waves.
  @location(2) rest: f32,
  // 1 at fresh water's vertices, 0 at the sea's: blended across a triangle, so no vertex decides a whole one.
  @location(3) fresh: f32,
};

// How much of a lamp's light the open water scatters back toward the eye.
const WATER_LAMP = 0.1;
const CORNERS = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));

fn ring_growth() -> f32 {
  return pow(frame.grid.y / frame.grid.x, 1.0 / (frame.grid.z - 1.0));
}

fn ring_radius(ring: u32) -> f32 {
  if (ring == 0u) { return 0.0; }
  return frame.grid.x * pow(ring_growth(), f32(ring) - 1.0);
}

// A row of the draw is a ring of quads, the farthest first, and its quads run round it from any segment, on past
// the last into the first (surfaceDisc.ts), so a draw is an arc of rings.
@vertex
fn surface_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) row: u32) -> Surface {
  let rings = u32(frame.grid.z);
  let segments = u32(frame.grid.w);
  let corner = CORNERS[index % 6u];
  let ring = rings - 1u - row + corner.y;
  let segment = (index / 6u + corner.x) % segments;
  let radius = ring_radius(ring);
  let angle = f32(segment) / f32(segments) * TAU;
  let offset = vec2f(cos(angle), sin(angle)) * radius;
  let water = water_at(offset);
  let depth = water.level - water.bed;
  let spacing = max(radius, frame.grid.x) * (ring_growth() - 1.0);
  var shift = vec2f(0.0);
  var height = 0.0;
  if (!water.fresh) {
    let swell = swell_at(offset, depth, spacing);
    shift = swell.shift;
    height += swell.height + breaker_at(offset, max(depth, 0.0), spacing).height;
    // Its wake's small waves, where the ships' frame says, drawn once the mesh is fine enough to hold them.
    height += wake_at(offset + shift).height * (1.0 - smoothstep(2.0, 8.0, spacing)) * reach(depth);
  }
  var surface: Surface;
  surface.offset = offset;
  surface.drawn = vec3f(offset + shift, (water.level + height) * frame.depth_terms.w - frame.eye.z);
  surface.rest = water.level;
  surface.fresh = select(0.0, 1.0, water.fresh);
  surface.clip = frame.from_eye * vec4f(surface.drawn, 1.0);
  return surface;
}

// A river runs down its surface's slope, faster the steeper it falls: its flow at a point, metres a second.
fn river_flow(offset: vec2f) -> vec2f {
  if (inside_patch(offset) < 2.0) { return vec2f(0.0); }
  let at = close_at(offset);
  let east = vec2f(1.0, 0.0);
  let south = vec2f(0.0, 1.0);
  let fall = vec2f(
    grid_at(patch_levels, at + east).r - grid_at(patch_levels, at - east).r,
    grid_at(patch_levels, at + south).r - grid_at(patch_levels, at - south).r,
  ) / (2.0 * frame.patch_area.z);
  let steep = length(fall);
  if (steep < 1e-5) { return vec2f(0.0); }
  return -fall / steep * clamp(steep * 600.0, 0.15, 2.5);
}

@fragment
fn surface_fragment(surface: Surface, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  let pixel = surface.clip.xy;
  let local = surface.offset + frame.local.xy;
  let distance_to = length(surface.drawn);
  let to_eye = -surface.drawn / max(distance_to, 1e-4);
  // A pixel's footprint on the water, metres: its angle times the distance, stretched as the view grazes. Smooth
  // from triangle to triangle, unlike the mesh's own derivatives, so nothing fades in facets.
  let footprint = max(distance_to * 2.0 * frame.forward.w / frame.view.y / max(abs(to_eye.z), 0.02), 0.01);
  let fresh = surface.fresh > 0.5;
  let top = (surface.drawn.z + frame.eye.z) / frame.depth_terms.w;
  // The ground and the still water at the pixel, not the mesh's: the water's edge is where its surface (the still
  // water and the waves on it) meets the ground there, faded across a pixel's rise, however coarse the mesh.
  let here = wide_at(surface.offset);
  let close = close_at(surface.offset);
  let share = close_share(patch_heights, close, frame.patch_area.w > 0.5);
  let ground = ground_at(coarse_heights, here, frame.coarse_area.x, patch_heights, close, frame.patch_area.z, share).ground;
  let still = still_at(coarse_lakes, here, patch_levels, close, share);
  let level = still.x;
  let depth = level - ground.x;
  let thin = level + top - surface.rest - ground.x;
  // No water inside a ship's waterline: under its deck it is hidden anyway, and in its open hull it is not. Its
  // footprint is tested where the water is drawn, a metre or two from its rest place once the swell carries it.
  let hulls = hull_cover(surface.drawn.xy, footprint);
  let cover = wet_share(thin, length(ground.yz) * footprint, still, share) * (1.0 - hulls.x);

  var normal = vec3f(0.0, 0.0, 1.0);
  var crest = 0.0;
  var whitecap = 0.0;
  var breaker: Breaker;
  var drift = vec2f(0.0);
  // How far apart a reflected pixel's rays fan, radians: the slopes of waves too small to draw (Cox and Munk's
  // capillaries, in a moderate wind at sea), less on calmer fresh water.
  var rough = 0.2;
  if (fresh) {
    let flow = river_flow(surface.offset);
    let calm = (0.3 + 0.35 * min(length(flow), 1.0)) * min(wind_chop(), 1.3);
    let slope = chop_slope(local, flow, calm, footprint);
    rough = 0.2 * calm;
    normal = normalize(vec3f(-slope, 1.0));
    drift = flow * frame.eye.w * 0.75;
  } else {
    let swell = swell_at(surface.offset, depth, footprint);
    breaker = breaker_at(surface.offset, max(depth, 0.0), footprint);
    // The wind's chop, calmed where the sea is sheltered (a roadstead's glassy water); the sea's own height here, a
    // share of a moderate sea's, raises the share of crests that break white.
    let sheltered = shelter_at(surface.offset);
    let height_here = frame.sea.x * sheltered;
    let rise = clamp((height_here - 0.35) / 2.65, 0.0, 1.0);
    let chop = wind_chop() * sheltered;
    // Held at 1.4: steeper, a storm's glints alias into blocks (each wave's footprint fade alone does not stop it).
    let slope = chop_slope(local, vec2f(0.0), min(chop, 1.4), footprint) + breaker.slope;
    rough = 0.2 * clamp(sqrt(chop), 0.3, 1.4);
    let rolled = swell_normal(swell);
    normal = normalize(rolled / max(rolled.z, 0.05) + vec3f(-slope, 0.0));
    crest = swell.height;
    let squeeze = (1.0 + swell.stretch.x) * (1.0 + swell.stretch.y) - swell.stretch.z * swell.stretch.z;
    // Whitecaps: crests folding, the wind's caps, and, as the sea rises, every crest standing high in the sea round it,
    // a rough sea's and a storm's breaking white; read from far off as the share of the sea they cover.
    // How many of the sea's own spreads (its waves' root mean square) a crest stands above still water.
    let standing = swell.height / max(sqrt(swell.energy * 0.5), 1e-3);
    // Broken into patches, as wind-blown caps are, never whole crest lines; none in a sea under 0.8 m.
    var caps = 0.0;
    if (height_here > 0.8) {
      let broken = smoothstep(0.45, 0.8, value_noise(local * 0.045 + vec2f(frame.eye.w * 0.05, 0.0)));
      caps = smoothstep(mix(2.0, 1.1, rise), mix(2.6, 1.7, rise), standing) * smoothstep(0.8, 2.2, height_here) * broken * 0.85;
    }
    whitecap = max(max(1.0 - smoothstep(0.28, 0.6, squeeze), caps), wind_caps(local));
    drift = breaker.toward_shore * frame.eye.w * 0.45 * breaker.broken;
  }
  // Ripples are centimetres high: their slope is drawn much steeper, so a swimmer's rings read against the chop.
  let ripple = ripple_at(surface.offset);
  normal = normalize(normal / max(normal.z, 0.05) + vec3f(-ripple.yz * 5.0 - rain_rings(local, footprint), 0.0));
  rough += 0.1 * sky_state.wind.w;

  // Foam: crests folding over, a breaker's face and the bore behind it, the surf's lingering lace, and the edge where
  // the water thins onto the land.
  let breaking = breaker.broken * max(smoothstep(1.0 - breaker.face, 1.0, breaker.phase) * 0.9, exp(-breaker.phase * 6.0));
  let lingering = breaker.broken * 0.24;
  let edge = (1.0 - smoothstep(0.0, select(0.14, 0.06, fresh), thin)) * select(0.95, 0.5, fresh)
    * (1.0 - smoothstep(1.0, 6.0, footprint));
  let splashed = smoothstep(0.012, 0.04, abs(ripple.x)) * 0.6;
  // A wake's foam is torn into streaks and patches as it spreads, never a painted line. Fresh water has no wake.
  var bow_wave = hulls.y;
  if (!fresh) {
    let wake = wake_at(surface.drawn.xy).foam;
    if (wake > 0.0) {
      let torn = 0.45 + 0.55 * smoothstep(0.25, 0.75, value_noise(local * 0.12 + vec2f(frame.eye.w * 0.03, 0.0)));
      bow_wave = max(bow_wave, wake * torn);
    }
  }
  let amount = clamp(max(max(whitecap * 0.85, max(breaking, lingering)), max(max(edge, splashed), bow_wave)), 0.0, 1.0);
  // Too far off to hold its lace, foam is drawn as the share of the surface it would cover.
  let foam = mix(foam_cover(local, drift, amount, footprint), amount * 0.55, smoothstep(0.4, 3.0, footprint));

  // Seen from below (only from under the water: above it, a face turned away is a steep triangle where the water's
  // mesh drops from a lake's level, drawn as any other): the sky through the window above, the deep beyond it.
  if (!facing && eye_below() > 0.0) {
    let up_through = refract(-to_eye, -normal, 1.33);
    var colour = underwater_light(eye_fresh(), 0.0) * 0.7;
    if (dot(up_through, up_through) > 0.0) {
      let bright = sky(normalize(up_through), 0.0);
      let glance = pow(1.0 - max(dot(-normal, to_eye), 0.0), 5.0);
      colour = mix(bright * 1.25, colour, glance);
    }
    colour = mix(colour, vec3f(0.62, 0.70, 0.72), foam * 0.7);
    colour = through_water(colour, eye_fresh(), eye_below(), distance_to) + shafts(-to_eye, min(distance_to, 60.0), pixel);
    return vec4f(colour, 1.0);
  }

  // From above: the land behind, bent by the surface and tinted by the water it is seen through. The water is seen
  // through as far as the ray runs down to the ground under the pixel, so no mesh's own error ever tints it.
  let water_distance = distance_to;
  let through = clamp(max(thin, 0.0) / max(abs(to_eye.z), 0.05), 0.0, 1e4);
  // The bend is metres on the bed under the surface, so a pixel far off (spanning many metres) moves little.
  let bend = normal.xy * min(through, 3.0) * 0.5 / footprint;
  var look = clamp(pixel + clamp(bend, vec2f(-60.0), vec2f(60.0)), vec2f(0.0), frame.view.xy - 1.0);
  if (scene_distance(look) < water_distance) { look = pixel; }
  let behind = textureSampleLevel(scene_colour, smooth_sampler, look / frame.view.xy, 0.0).rgb;
  let kept = exp(-select(SEA_ABSORB, FRESH_ABSORB, fresh) * through);
  let body = select(SEA_BODY, FRESH_BODY, fresh) * (0.6 * sky_level() + 0.6 * key_toward().z * sky_state.key.w);
  var colour = behind * kept + body * (1.0 - exp(-0.12 * through));

  // Light through a crest from behind it, as the sun shines through a wave's thin top.
  let back_lit = pow(max(dot(normalize(-to_eye.xy + vec2f(1e-6, 0.0)), normalize(key_toward().xy + vec2f(1e-6, 0.0))), 0.0), 3.0);
  let thick = clamp(crest * 0.9 + 0.35, 0.0, 1.0) * select(1.0, 0.25, fresh);
  colour += SEA_GLOW * thick * (0.06 + 0.35 * back_lit) * (0.6 * sky_level() + 0.4 * max(dot(normal, key_toward()), 0.0) * sky_state.key.w);

  // In a shadow (a ship's, beside its waterline) the surface loses the sun's glints and part of the light it scatters
  // and reflects, as water in shade does.
  let sun = sunlit(surface.drawn, vec3f(0.0, 0.0, 1.0));
  colour *= 1.0 - 0.35 * (1.0 - sun);

  let facing_eye = max(dot(normal, to_eye), 0.0);
  let shine = smoothstep(0.0, 0.35, through) * (0.02 + 0.98 * pow(1.0 - facing_eye, 5.0));
  let bounced = reflect(-to_eye, normal);
  colour = mix(colour, sky(vec3f(bounced.xy, max(bounced.z, 0.03)), rough) * (0.65 + 0.35 * sun), shine);
  let half_way = normalize(to_eye + key_toward());
  // Far off, where a pixel spans many small waves, the glints blur into the sun's glitter path.
  let sharpness = mix(900.0, 120.0, smoothstep(0.05, 2.0, footprint));
  let glint = pow(max(dot(normal, half_way), 0.0), sharpness) * sharpness / 90.0 + pow(max(dot(normal, half_way), 0.0), 60.0) * 0.3;
  colour += sky_state.key_light.rgb * glint * sun * (1.0 - foam) * smoothstep(0.0, 0.2, through);

  // The lamps near (a ship's lanterns, a gun's flash, a fire) light the water round them: its foam fully, the water
  // itself as the little it scatters back.
  let lamps = sky_lamps(surface.drawn, normal);
  colour += lamps * WATER_LAMP;
  let foam_light = FOAM * (0.62 * sky_level() + 0.38 * max(dot(normal, key_toward()), 0.0) * sky_state.key.w * sun + lamps) + sky_state.zenith.rgb * 0.06;
  colour = mix(colour, foam_light, foam);
  // Past its edge the water gives way to what the backdrop drew there; open water hides it wholly.
  let water = aerial(colour, -to_eye, distance_to);
  if (cover >= 1.0) { return vec4f(water, 1.0); }
  let land = aerial(textureLoad(scene_colour, vec2i(pixel), 0).rgb, normalize(ray_through(pixel)), scene_distance(pixel));
  return vec4f(mix(land, water, cover), 1.0);
}
`;
