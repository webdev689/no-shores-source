// The dungeon's WGSL: its floor's mesh and its cache in the dungeon's pictures, lit by its torches and its cold light
// (`LIGHT_WGSL`), never by a sun; iron in the city's iron and each flame glowing as the city's braziers glow.
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { PORTAL_LAYER } from './dungeonBook.ts';
import { LIGHT_WGSL } from './dungeonLight.ts';

/** The most torches lighting one frame: the nearest to the eye. */
export const MOST_TORCHES = 32;

export const DUNGEON_SHADER = /* wgsl */ `
struct View {
  from_eye: mat4x4f,
  // the eye, and the time
  eye: vec4f,
  // how many torches the frame holds, how far each one's light reaches, and 1 while the portal stands open
  torches: vec4f,
};
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> torches: array<vec4f, ${MOST_TORCHES}>;
@group(0) @binding(2) var pictures: texture_2d_array<f32>;
@group(0) @binding(3) var picture_sampler: sampler;

${LIGHT_WGSL}

const IRON = ${COLOUR_LAYERS.iron}u;
const GLOW = ${COLOUR_LAYERS.glow}u;
const PORTAL = ${PORTAL_LAYER}u;

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

@fragment
fn dungeon_fragment(surface: Surface) -> @location(0) vec4f {
  let last = textureNumLayers(pictures) - 1u;
  let sampled = textureSample(pictures, picture_sampler, surface.uv, min(surface.layer, last)).rgb;
  let time = view.eye.w;
  if surface.layer == GLOW {
    // Each flame by where it burns, so no two flicker in step.
    return vec4f(FLAME * flicker(time, surface.point.x * 0.7 + surface.point.y * 1.3), 1.0);
  }
  if surface.layer == PORTAL && view.torches.z > 0.5 {
    // Open, a doorway of light that shimmers across its face.
    let shimmer = 0.9 + 0.1 * sin(time * 2.3 + surface.uv.y * 9.0 + sin(surface.uv.x * 7.0 + time));
    return vec4f(PORTAL_LIGHT * shimmer, 1.0);
  }
  var albedo = select(sampled, vec3f(0.24, 0.25, 0.27), surface.layer == IRON);
  // Shut, a face of dark stone.
  albedo = select(albedo, vec3f(0.05, 0.05, 0.06), surface.layer == PORTAL);
  return vec4f(albedo * torch_light(surface.point, normalize(surface.normal), time), 1.0);
}
`;
