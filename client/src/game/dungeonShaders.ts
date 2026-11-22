// The dungeon's WGSL: its floor's mesh, its fixtures and its cache in the dungeon's pictures, lit by its lights and
// the faint light of each cell's mood (`LIGHT_WGSL`), never by a sun; each flame, ember, lantern, crystal and fungus
// cap glowing in its own colour, a crystal's and a lantern's glass by their facets, and still water over its bed,
// mirroring the lit room and catching the lights.
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { DUNGEON_LAYERS, PORTAL_FLAG, WATER_FLAG } from './dungeonBook.ts';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { CELL_ROCK, type Light, LIGHT_WGSL } from './dungeonLight.ts';

/** The most lights lighting one frame: the nearest to the eye. */
export const MOST_LIGHTS = 32;
/** The most looks one dungeon wears, each with its mood. */
export const MOST_LOOKS = 8;
/** Where each part of `View` starts in its uniform buffer, and how long it is in all, in floats. */
export const VIEW_FLOATS = { fromEye: 0, eye: 16, lights: 20, grid: 24, moods: 28, all: 28 + MOST_LOOKS * 4 } as const;
/** A light's three vec4s: where it burns and its number, its colour and reach, and its flicker. */
export const LIGHT_FLOATS = 12;

/** A light as the shader's `Light` holds it: where it burns and its number, its colour and reach, and its flicker,
 *  its pulse and how much of a gleam still water shows of it. */
export function lightFloats({ at, number, burning }: Light): number[] {
  const gleam = burning.gleams === false ? 0 : 1;
  return [...at, number, ...burning.colour, burning.reach, burning.flicker, burning.pulse ?? 0, gleam, 0];
}

export const DUNGEON_SHADER = /* wgsl */ `
struct View {
  from_eye: mat4x4f,
  // the eye, and the time
  eye: vec4f,
  // how many lights the frame holds, and 1 while the portal stands open
  lights: vec4f,
  // a cell's side, and the grid's columns and rows
  grid: vec4f,
  // each look's faint light
  moods: array<vec4f, ${MOST_LOOKS}>,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> lights: array<Light, ${MOST_LIGHTS}>;
@group(0) @binding(2) var pictures: texture_2d_array<f32>;
@group(0) @binding(3) var picture_sampler: sampler;
// Each cell's look, by its number among the looks, and CELL_ROCK on rock.
@group(0) @binding(4) var<storage, read> cell_looks: array<u32>;
const CELL_ROCK = ${CELL_ROCK}u;
// The most cells a line from still water to a flame is walked across before the flame is taken as hidden.
const MOST_CELLS = 64u;

${LIGHT_WGSL}

const GLOW = ${COLOUR_LAYERS.glow}u;
const WAX_LAYER = ${DUNGEON_LAYERS.wax}u;
const EMBER = ${DUNGEON_LAYERS.ember}u;
const LANTERN_GLASS = ${DUNGEON_LAYERS.lanternGlass}u;
const CRYSTAL = ${DUNGEON_LAYERS.crystal}u;
const FUNGUS = ${DUNGEON_LAYERS.fungus}u;
// A layer with this bit set is the portal's face, in the picture the rest of its number names.
const PORTAL = ${PORTAL_FLAG}u;
// A layer with this bit set is still water, over a bed in the picture the rest of its number names.
const WATER = ${WATER_FLAG}u;
// Still water's bed seen through it: a wet floor is darker, and water takes the red first.
const WATER_TINT = vec3f(0.45, 0.55, 0.6);
// How much of the light on it the room round still water gives back, to be mirrored in it: stone's.
const ROOM_ALBEDO = 0.3;
// How much still water mirrors square on, Schlick's F0 for water; edge on, it mirrors all.
const WATER_F0 = 0.02;
// A flame's radius (m), and how much brighter it burns than the light it sheds on a surface: what still water
// mirrors of it.
const FLAME_M = 0.12;
const FLAME_IN_WATER = 20.0;

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) layer: u32,
  @location(3) point: vec3f,
};

@vertex
fn dungeon_vertex(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) layer: u32,
) -> Surface {
  var surface: Surface;
  surface.clip = view.from_eye * vec4f(position - view.eye.xyz, 1.0);
  surface.normal = normal;
  surface.uv = uv;
  surface.layer = layer;
  surface.point = position;
  return surface;
}

// The faint light of the cell a surface lies in: a wall faces into its cell, so a little past the farthest a cave's
// wall bulges into the rock, along its normal, is inside.
fn mood_at(point: vec3f, normal: vec3f) -> vec3f {
  let inside = point.xy + normal.xy * ${(CAVE_BULGE_M + 0.05).toFixed(2)};
  let column = floor(inside.x / view.grid.x);
  let row = floor(inside.y / view.grid.x);
  if column < 0.0 || row < 0.0 || column >= view.grid.y || row >= view.grid.z {
    return view.moods[0].rgb;
  }
  let look = cell_looks[u32(row) * u32(view.grid.y) + u32(column)] & ~CELL_ROCK;
  return view.moods[min(look, ${MOST_LOOKS - 1}u)].rgb;
}

// Whether the cell at (column, row) is rock, or past the grid.
fn rock_at(column: f32, row: f32) -> bool {
  if column < 0.0 || row < 0.0 || column >= view.grid.y || row >= view.grid.z { return true; }
  return (cell_looks[u32(row) * u32(view.grid.y) + u32(column)] & CELL_ROCK) != 0u;
}

// Whether rock stands on the line from (from_x, from_y) to (to_x, to_y), walked cell by cell across the grid: from
// one cell to the next across whichever of its sides the line crosses first. A longer line is taken as blocked.
fn rock_between(from_x: f32, from_y: f32, to_x: f32, to_y: f32) -> bool {
  let size = view.grid.x;
  var column = floor(from_x / size);
  var row = floor(from_y / size);
  let last_column = floor(to_x / size);
  let last_row = floor(to_y / size);
  let step_x = sign(to_x - from_x);
  let step_y = sign(to_y - from_y);
  // How far along the line, 0 to 1, a cell's span is, and where it next crosses a side each way.
  let span_x = select(1e9, size / abs(to_x - from_x), step_x != 0.0);
  let span_y = select(1e9, size / abs(to_y - from_y), step_y != 0.0);
  var next_x = select(1e9, abs((column + max(step_x, 0.0)) * size - from_x) / abs(to_x - from_x), step_x != 0.0);
  var next_y = select(1e9, abs((row + max(step_y, 0.0)) * size - from_y) / abs(to_y - from_y), step_y != 0.0);
  for (var count = 0u; count < MOST_CELLS; count++) {
    if column == last_column && row == last_row { return false; }
    if next_x < next_y {
      column += step_x;
      next_x += span_x;
    } else {
      row += step_y;
      next_y += span_y;
    }
    if rock_at(column, row) { return true; }
  }
  return true;
}

// Still water over its bed, a slow ripple through its normal: through it the bed, lit as a floor is; in it the room,
// its walls brighter toward its lights, and each light's flame but the water's own glow, which lies on it, all
// mirrored more the lower the eye looks across it.
fn water_at(point: vec3f, normal: vec3f, time: f32, mood: vec3f, bed: vec3f) -> vec3f {
  let ripple = 0.04 * vec2f(
    sin(point.x * 2.3 + time * 0.7) + 0.6 * sin(point.y * 3.1 - time * 0.5),
    sin(point.y * 2.7 - time * 0.6) + 0.6 * sin(point.x * 3.7 + time * 0.4),
  );
  let rippled = normalize(normal + vec3f(ripple, 0.0));
  let to_eye = normalize(view.eye.xyz - point);
  let mirror = reflect(-to_eye, rippled);
  var gleam = vec3f(0.0);
  for (var index = 0u; index < u32(view.lights.x); index++) {
    let lamp = lights[index];
    let towards = lamp.place.xyz - point;
    let distance = length(towards);
    let image = flame_image(dot(mirror, towards / max(distance, 1e-3)), distance);
    // The line to a flame is walked only where its image would show.
    if image > 0.001 && !rock_between(point.x, point.y, lamp.place.x, lamp.place.y) {
      let burns = flicker(time, lamp.place.w, lamp.shape.x) * pulse(time, lamp.place.w, lamp.shape.y);
      gleam += lamp.colour.rgb * FLAME_IN_WATER * image * burns * lamp.shape.z;
    }
  }
  let mirrors = fresnel(max(dot(rippled, to_eye), 0.0));
  let through = bed * WATER_TINT * lights_at(point, rippled, time, mood);
  let mirrored = ROOM_ALBEDO * lights_at(point, mirror, time, mood);
  return mix(through, mirrored, mirrors) + gleam * mirrors;
}

// How much of a flame shows along a line whose cosine to it is \`cosine\`, \`distance\` from it: all on its line,
// falling to 1/e at its own angular radius, so a far flame is a small image, as bright as a near one.
fn flame_image(cosine: f32, distance: f32) -> f32 {
  return exp(-2.0 * (1.0 - cosine) * pow(max(distance, FLAME_M) / FLAME_M, 2.0));
}

// How much of the room still water mirrors, by the cosine between its normal and the eye (Schlick's).
fn fresnel(cosine: f32) -> f32 {
  return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - cosine, 5.0);
}

// How much of a glowing facet's glow shows: all of it square to the eye, a little over half edge on.
fn facing_share(face: vec3f, to_eye: vec3f) -> f32 {
  return 0.55 + 0.45 * abs(dot(face, to_eye));
}

// A crystal's or a lantern pane's glow by its facet, lifted a little toward its whole by the lights round it, so one
// crystal's faces differ and it reads as a solid, not a flat cut-out; never past its glow, which would clip it.
// \`face\` is the triangle's own normal, flat across it.
fn facet(glow: vec3f, point: vec3f, face: vec3f, to_eye: vec3f, time: f32) -> vec3f {
  let lit = lights_at(point, face, time, vec3f(0.0));
  return glow * facing_share(face, to_eye) * (0.85 + 0.15 * min(max(lit.r, max(lit.g, lit.b)), 1.0));
}

@fragment
fn dungeon_fragment(surface: Surface) -> @location(0) vec4f {
  let last = textureNumLayers(pictures) - 1u;
  let portal = (surface.layer & PORTAL) != 0u;
  let water = (surface.layer & WATER) != 0u;
  let layer = surface.layer & ~(PORTAL | WATER);
  let sampled = textureSample(pictures, picture_sampler, surface.uv, min(layer, last)).rgb;
  // The triangle's own normal, turned to the eye: a piece's smooth normals would round a crystal's facets away.
  // Derivatives are taken here, before any branch, as they must be.
  let to_eye = normalize(view.eye.xyz - surface.point);
  let across = cross(dpdx(surface.point), dpdy(surface.point));
  let flat_normal = across / max(length(across), 1e-8);
  let face = flat_normal * select(-1.0, 1.0, dot(flat_normal, to_eye) >= 0.0);
  let time = view.eye.w;
  // Each glow by where it burns, so no two flicker in step.
  let phase = surface.point.x * 0.7 + surface.point.y * 1.3;
  if layer == GLOW {
    return vec4f(FLAME * flicker(time, phase, 1.0), 1.0);
  }
  if layer == EMBER {
    return vec4f(EMBER_GLOW * flicker(time * 0.5, phase, 1.4), 1.0);
  }
  if layer == LANTERN_GLASS {
    return vec4f(facet(LANTERN_GLOW * flicker(time, phase, 0.35), surface.point, face, to_eye, time), 1.0);
  }
  if layer == CRYSTAL {
    // A slow swell through each crystal, from its foot to its tip.
    let swell = 0.85 + 0.15 * sin(time * 1.3 + phase + surface.point.z * 2.0);
    return vec4f(facet(CRYSTAL_GLOW * swell, surface.point, face, to_eye, time), 1.0);
  }
  if layer == FUNGUS {
    // A slower breath through each cap.
    let breath = 0.8 + 0.2 * sin(time * 0.7 + phase * 1.7);
    return vec4f(FUNGUS_GLOW * breath, 1.0);
  }
  if portal && view.lights.y > 0.5 {
    // Open, a doorway of light that shimmers across its face.
    let shimmer = 0.9 + 0.1 * sin(time * 2.3 + surface.uv.y * 9.0 + sin(surface.uv.x * 7.0 + time));
    return vec4f(PORTAL_LIGHT * shimmer, 1.0);
  }
  let normal = normalize(surface.normal);
  let mood = mood_at(surface.point, normal);
  if water {
    return vec4f(water_at(surface.point, normal, time, mood, sampled), 1.0);
  }
  let light = lights_at(surface.point, normal, time, mood);
  if layer == WAX_LAYER {
    return vec4f(WAX * light, 1.0);
  }
  // Shut, the portal's face is sealed stone, sunk in shadow so its arch stands out round it.
  let albedo = sampled * select(1.0, 0.12, portal);
  return vec4f(albedo * light, 1.0);
}
`;
