// A lit city's light at night in WGSL, for the city's shaders (`cityShaders.ts`) to take in with the rest of their
// common code: its lamps' pools read from the light map, and its windows' glow, a forged model's panes near and a far
// mass's walls laid with windows.
import { CELL_M } from './plan.ts';
import { WINDOW_RHYTHM, WINDOW_WGSL } from './windowLights.ts';

/** How bright a pool of lamplight on the paving is at full (`nightLights.ts` light map): a lamp's warm light. */
const POOL_LIGHT = [1.25, 0.78, 0.38] as const;

/** The pools' and the windows' WGSL: it reads the city's view, cell table and `Surface`, and the sky's state. */
export const CITY_NIGHT_WGSL = /* wgsl */ `
${WINDOW_WGSL}
@group(0) @binding(6) var pool_map: texture_2d<f32>;
@group(0) @binding(7) var pool_sampler: sampler;
const POOL_LIGHT = vec3f(${POOL_LIGHT.join(', ')});

// A lit city's lamps' pools of light at night, read from its light map: on the ground and up the walls to a few metres
// over the level of the cell they stand in, a face turned up lit most, coming up through the dusk as the lamps do.
fn city_pool(from_eye: vec3f, facing: vec3f) -> vec3f {
  let lit = lamps_lit(sky_state.sun.w) * view.night.y;
  if (lit <= 0.0) {
    return vec3f(0.0);
  }
  let place = from_eye + view.eye.xyz;
  let uv = (place.xy - view.pools.xy) / view.pools.zw;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) {
    return vec3f(0.0);
  }
  let pool = textureSampleLevel(pool_map, pool_sampler, uv, 0.0).r;
  let side = i32(view.grid.z) / 16;
  let cell = vec2i(floor((place.xy - view.grid.xy) / ${CELL_M}));
  var level = place.z;
  if (all(cell >= vec2i(0)) && all(cell < vec2i(side))) {
    let found = cell_table[cell.y * side + cell.x];
    level = select(place.z, found.z, found.w > 0.5);
  }
  let height = place.z - level;
  let reach = (1.0 - smoothstep(2.5, 8.0, height)) * step(-1.0, height);
  return POOL_LIGHT * pool * lit * reach * (0.55 + 0.45 * max(facing.z, 0.0));
}

const NO_WINDOWS = 0u;
const PANES = 1u;
const WALL_WINDOWS = 2u;

// The warm light of a lit city's windows at night: a forged model's lit panes, or a far mass's wall laid with
// windows as the forged buildings lay them, each lit or dark by its own draws, the pattern evened out to the windows'
// share where a window is smaller than a pixel, so far walls never shimmer. 'wall_px' is the wall's metres a pixel.
fn window_light(surface: Surface, alpha: f32, clear: bool, wall_px: vec2f) -> vec3f {
  let kind = u32(surface.lights.z + 0.5);
  if (view.night.y < 0.5 || kind == NO_WINDOWS) {
    return vec3f(0.0);
  }
  let code = u32(surface.lights.y + 0.5);
  let hour = view.night.x;
  let daylight = sky_state.sun.w;
  if (kind == PANES) {
    if (clear || alpha >= 0.5) {
      return vec3f(0.0);
    }
    let glow = window_glow(code, surface.lights.x, surface.lights.w, hour, daylight);
    return WINDOW_LIGHT * glow * (0.75 + 0.25 * fract(surface.lights.x * 17.0));
  }
  let storey = ${WINDOW_RHYTHM.storey};
  let width = ${WINDOW_RHYTHM.width}.0;
  let sill = ${WINDOW_RHYTHM.sill};
  let tall = ${WINDOW_RHYTHM.height};
  let count = floor((surface.span.x - ${WINDOW_RHYTHM.clear * 2} + storey - width) / storey);
  let storeys = floor((surface.span.y - 0.3 - tall - sill) / storey) + 1.0;
  if (count < 1.0 || storeys < 1.0) {
    return vec3f(0.0);
  }
  let first = (surface.span.x - (count - 1.0) * storey) / 2.0;
  let column = clamp(round((surface.wall.x - first) / storey), 0.0, count - 1.0);
  let floor_at = floor((surface.wall.y - sill) / storey);
  let level = sill + floor_at * storey;
  let held = select(0.0, 1.0, floor_at >= 0.0 && floor_at < storeys);
  let across = clamp((width / 2.0 - abs(surface.wall.x - first - column * storey)) / max(wall_px.x, 1e-4) + 0.5, 0.0, 1.0);
  let up = clamp(min(surface.wall.y - level, level + tall - surface.wall.y) / max(wall_px.y, 1e-4) + 0.5, 0.0, 1.0);
  let slot = vec2i(i32(column) + i32(surface.lights.x * 65536.0), i32(floor_at) * 131 + i32(surface.lights.w));
  let draws = vec2f(texel_hash(slot), texel_hash(slot + vec2i(7919, 104729)));
  let near = across * up * held * window_glow(code, draws.x, draws.y, hour, daylight) * (0.75 + 0.25 * draws.x);
  // far off, the share of the wall its lit windows cover
  let windowed = min(1.0, storeys * storey / max(surface.span.y, 1e-3)) * (width / storey) * (tall / storey);
  let far = window_share(code, hour) * lamps_lit(daylight) * windowed * 0.85;
  return WINDOW_LIGHT * mix(near, far, smoothstep(0.5, 1.5, max(wall_px.x, wall_px.y)));
}
`;
