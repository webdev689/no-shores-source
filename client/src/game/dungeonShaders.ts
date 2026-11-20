// The dungeon's WGSL: its floor's mesh, its fixtures and its cache in the dungeon's pictures, lit by its lights and
// the faint light of each cell's mood (`LIGHT_WGSL`), never by a sun; each flame, ember, lantern, crystal and fungus
// cap glowing in its own colour, a crystal's and a lantern's glass by their facets, and still water dark over a floor
// of its cell's mood, catching the lights.
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { DUNGEON_LAYERS, PORTAL_FLAG } from './dungeonBook.ts';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { type Light, LIGHT_WGSL } from './dungeonLight.ts';

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
// Each cell's look, by its number among the looks.
@group(0) @binding(4) var<storage, read> cell_looks: array<u32>;

${LIGHT_WGSL}

const GLOW = ${COLOUR_LAYERS.glow}u;
const WAX_LAYER = ${DUNGEON_LAYERS.wax}u;
const EMBER = ${DUNGEON_LAYERS.ember}u;
const LANTERN_GLASS = ${DUNGEON_LAYERS.lanternGlass}u;
const CRYSTAL = ${DUNGEON_LAYERS.crystal}u;
const FUNGUS = ${DUNGEON_LAYERS.fungus}u;
const WATER = ${DUNGEON_LAYERS.water}u;
// Still water's own colour, lit as a surface is: dark, so the mood and the lights' gleams tell it.
const WATER_DEEP = vec3f(0.1, 0.14, 0.16);
// How much of its cell's mood still water shows however dark it lies, so it reads as water and not a hole.
const WATER_FLOOR = 0.5;
// A layer with this bit set is the portal's face, in the picture the rest of its number names.
const PORTAL = ${PORTAL_FLAG}u;

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
  let look = cell_looks[u32(row) * u32(view.grid.y) + u32(column)];
  return view.moods[min(look, ${MOST_LOOKS - 1}u)].rgb;
}

// Still water: a slow ripple through its normal; each light a tight, bright gleam off it toward the eye, but the
// water's own glow, which lies on it; under them a floor of the cell's faint light, and over them a sheen of it, for
// there is no sky to mirror, caught more the lower the eye looks across it.
fn water_at(point: vec3f, normal: vec3f, time: f32, mood: vec3f) -> vec3f {
  let ripple = 0.04 * vec2f(
    sin(point.x * 2.3 + time * 0.7) + 0.6 * sin(point.y * 3.1 - time * 0.5),
    sin(point.y * 2.7 - time * 0.6) + 0.6 * sin(point.x * 3.7 + time * 0.4),
  );
  let rippled = normalize(normal + vec3f(ripple, 0.0));
  let to_eye = normalize(view.eye.xyz - point);
  var gleam = vec3f(0.0);
  for (var index = 0u; index < u32(view.lights.x); index++) {
    let lamp = lights[index];
    let towards = lamp.place.xyz - point;
    let distance = length(towards);
    let share = max(0.0, 1.0 - distance / lamp.colour.w);
    let half_way = normalize(towards / max(distance, 1e-3) + to_eye);
    let shine = pow(max(dot(rippled, half_way), 0.0), 120.0);
    let burns = flicker(time, lamp.place.w, lamp.shape.x) * pulse(time, lamp.place.w, lamp.shape.y);
    gleam += lamp.colour.rgb * share * share * shine * burns * 3.0 * lamp.shape.z;
  }
  let grazing = pow(1.0 - max(dot(rippled, to_eye), 0.0), 5.0);
  let sheen = mood * (0.15 + 0.85 * grazing);
  return mood * WATER_FLOOR + WATER_DEEP * lights_at(point, rippled, time, mood) + gleam + sheen;
}

// How much of a glowing facet's glow shows: all of it square to the eye, a little over half edge on.
fn facing_share(face: vec3f, to_eye: vec3f) -> f32 {
  return 0.55 + 0.45 * abs(dot(face, to_eye));
}

// A crystal's or a lantern pane's glow by its facet, and a little lit by the lights round it, so one crystal's faces
// differ and it reads as a solid, not a flat cut-out. \`face\` is the triangle's own normal, flat across it.
fn facet(glow: vec3f, point: vec3f, face: vec3f, to_eye: vec3f, time: f32) -> vec3f {
  return glow * (facing_share(face, to_eye) + 0.15 * lights_at(point, face, time, vec3f(0.0)));
}

@fragment
fn dungeon_fragment(surface: Surface) -> @location(0) vec4f {
  let last = textureNumLayers(pictures) - 1u;
  let portal = (surface.layer & PORTAL) != 0u;
  let layer = surface.layer & ~PORTAL;
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
  if layer == WATER {
    return vec4f(water_at(surface.point, normal, time, mood), 1.0);
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
