// The dungeon's WGSL: its floor's mesh, its fixtures and its cache in the dungeon's pictures, lit by its lights and
// the faint light of each cell's mood (`LIGHT_WGSL`), never by a sun; each flame, ember, lantern, crystal and fungus
// cap glowing in its own colour.
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { DUNGEON_LAYERS, PORTAL_FLAG } from './dungeonBook.ts';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { LIGHT_WGSL } from './dungeonLight.ts';

/** The most lights lighting one frame: the nearest to the eye. */
export const MOST_LIGHTS = 32;
/** The most looks one dungeon wears, each with its mood. */
export const MOST_LOOKS = 8;
/** Where each part of `View` starts in its uniform buffer, and how long it is in all, in floats. */
export const VIEW_FLOATS = { fromEye: 0, eye: 16, lights: 20, grid: 24, moods: 28, all: 28 + MOST_LOOKS * 4 } as const;
/** A light's three vec4s: where it burns and its number, its colour and reach, and its flicker. */
export const LIGHT_FLOATS = 12;

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

@fragment
fn dungeon_fragment(surface: Surface) -> @location(0) vec4f {
  let last = textureNumLayers(pictures) - 1u;
  let portal = (surface.layer & PORTAL) != 0u;
  let layer = surface.layer & ~PORTAL;
  let sampled = textureSample(pictures, picture_sampler, surface.uv, min(layer, last)).rgb;
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
    return vec4f(LANTERN_GLOW * flicker(time, phase, 0.35), 1.0);
  }
  if layer == CRYSTAL {
    // A slow swell through each crystal, from its foot to its tip.
    let swell = 0.85 + 0.15 * sin(time * 1.3 + phase + surface.point.z * 2.0);
    return vec4f(CRYSTAL_GLOW * swell, 1.0);
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
  let light = lights_at(surface.point, normal, time, mood_at(surface.point, normal));
  if layer == WAX_LAYER {
    return vec4f(WAX * light, 1.0);
  }
  // Shut, the portal's face is sealed stone, sunk in shadow so its arch stands out round it.
  let albedo = sampled * select(1.0, 0.12, portal);
  return vec4f(albedo * light, 1.0);
}
`;
