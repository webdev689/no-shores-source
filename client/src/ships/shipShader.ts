// What every hull's view draws with, made once a device and shared: the ship shader, its pipeline (built off the
// frame, so a hull first seen at sea does not stall one), and its parts' and the sides' flags' pictures and sampler.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SHADOW_CAST_WGSL, SHADOW_WGSL, shadowLayouts } from '../shadow.ts';
import { levelsOf } from '../textures/levels.ts';
import type { Picture } from '../textures/picture.ts';
import { SHIP_PARTS, SHIP_PICTURE_TEXELS, shipPictures } from '../textures/shipPictures.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { flagPictures } from './flagPictures.ts';
import { VERTEX_BYTES } from './shipMesh.ts';

/** Its faces seen from outside reach the screen counter-clockwise, as the land's and the water's do: the export keeps
 *  each face's corners in the model's own order, and the world (east, south, up) is mirrored as its frame is. */
export const FRONT_FACE: GPUFrontFace = 'ccw';

/** A part's picture repeats at this many texels a metre over it, as a forged model's do. */
const TEXELS_PER_METRE = 40;
/** The most yards a hull carries, the Frigate's nine with room to spare. */
export const MOST_YARDS = 12;
/** The most masts a hull steps, the Frigate's three with room to spare. */
export const MOST_MASTS = 4;
/** A ship's uniforms: its place, look and paint (60 floats), then each yard's pivot and turn, then each mast's fall. */
export const PLACE_FLOATS = 60 + MOST_YARDS * 4 + MOST_MASTS * 8;
/** Where in its uniforms each yard's pivot and turn start, and each mast's fall (`mastFall`). */
export const YARD_FLOATS_AT = 60;
export const MAST_FLOATS_AT = 60 + MOST_YARDS * 4;

const [HULL_PART, SAIL_PART] = [SHIP_PARTS.indexOf('hull'), SHIP_PARTS.indexOf('sail')];

/** What both its shaders share: its uniforms and pictures, and where each vertex of it is drawn; its parts' pictures'
 *  mean lightness is set when the pipeline is made, as a side's paint keeps a picture's grain about its colour. */
const PLACE_SHADER = /* wgsl */ `
${SHARED_WGSL}
const AMBIENT = 0.35;
override HULL_LIGHT: f32 = 1.0;
override SAIL_LIGHT: f32 = 1.0;
const HULL_PART = ${HULL_PART}u;
const SAIL_PART = ${SAIL_PART}u;
const LIGHTNESS = vec3f(0.299, 0.587, 0.114);
// Its UVs are metres; a picture repeats every SHIP_PICTURE_TEXELS / TEXELS_PER_METRE of them, standing upright.
const PICTURE_PER_M = vec2f(${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS}, -${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS});

struct Place {
  from_eye: mat4x4f,
  turn: mat4x4f,
  // Its middle from the eye, metres as drawn.
  offset: vec4f,
  // How light it is drawn: 1 as modelled, less for a darker ship.
  shade: vec4f,
  // Its side's paint for its hull, its stripe and its canvas, each its colour and 1 where it is laid, 0 where not.
  hull: vec4f,
  stripe: vec4f,
  canvas: vec4f,
  // Its stripe's line in its frame: its height at its middle, its rise a metre toward its bow, and its half height.
  band: vec4f,
  unused: vec4f,
  // Each yard's pivot on its centreline (x, y) and the cosine and sine of its brace.
  yards: array<vec4f, ${MOST_YARDS}>,
  // Each mast's fall, two a mast: its foot's height, the cosine and sine of its turn over its side, and 1 while it
  // shows; then how far astern it has drifted and how far it has sunk.
  masts: array<vec4f, ${MOST_MASTS * 2}>,
};

@group(0) @binding(0) var<uniform> place: Place;
@group(0) @binding(1) var pictures: texture_2d_array<f32>;
@group(0) @binding(2) var pictured: sampler;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) part: u32,
  // 1 on the outside of its shell, 0 off it, blended across a face whose corners differ.
  @location(3) shell: f32,
  // How high on the ship it is, and how far along it, in its own frame.
  @location(4) model: vec2f,
  @location(5) from_eye: vec3f,
};

/** A vector of its frame turned by a yard's brace about a vertical axis. */
fn braced(vector: vec2f, brace: vec4f) -> vec2f {
  return vec2f(vector.x * brace.z - vector.y * brace.w, vector.x * brace.w + vector.y * brace.z);
}

/** Where a vertex of its frame is drawn from the eye, as its yards are braced and its masts stand or lie, and the way
 *  its face turns there. */
struct Placed {
  from_eye: vec3f,
  facing: vec3f,
};

fn placed(position: vec3f, normal: vec3f, part: vec4u) -> Placed {
  var at = position;
  var facing = normal;
  // A yard turns round its mast with its sail's brace.
  if (part.z > 0u) {
    let yard = place.yards[part.z - 1u];
    at = vec3f(yard.xy + braced(position.xy - yard.xy, yard), position.z);
    facing = vec3f(braced(normal.xy, yard), normal.z);
  }
  // A fallen mast goes over its side with its yards, about the line along it at its foot, and drifts astern.
  if (part.w > 0u) {
    let fall = place.masts[(part.w - 1u) * 2u];
    let drift = place.masts[(part.w - 1u) * 2u + 1u];
    let up = at.z - fall.x;
    at = vec3f(at.x - drift.x, at.y * fall.y + up * fall.z, fall.x - at.y * fall.z + up * fall.y - drift.y);
    facing = vec3f(facing.x, facing.y * fall.y + facing.z * fall.z, facing.z * fall.y - facing.y * fall.z);
    // Gone under, it is drawn as nothing.
    if (fall.w < 0.5) {
      at = vec3f(0.0, 0.0, -50.0);
    }
  }
  return Placed((place.turn * vec4f(at, 0.0)).xyz + place.offset.xyz, (place.turn * vec4f(facing, 0.0)).xyz);
}
`;

/** The ship shader proper, lit as the land is and in the sun's shadows (`SHADOW_WGSL`). */
export const SHIP_DRAW_SHADER = /* wgsl */ `
${PLACE_SHADER}
${SHADOW_WGSL}
const BOUNCE = 0.15;

@vertex
fn vertex_main(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
  @location(3) part: vec4u,
) -> Drawn {
  var drawn: Drawn;
  let at = placed(position, normal.xyz, part);
  drawn.clip = place.from_eye * vec4f(at.from_eye, 1.0);
  drawn.normal = at.facing;
  drawn.from_eye = at.from_eye;
  drawn.uv = uv * PICTURE_PER_M;
  drawn.part = part.x;
  drawn.shell = f32(part.y);
  drawn.model = position.xz;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  // Sails and planks are single faces seen from both sides: the side seen is lit.
  let normal = normalize(select(-drawn.normal, drawn.normal, facing));
  var colour = textureSample(pictures, pictured, drawn.uv, drawn.part).rgb;
  let grain = dot(colour, LIGHTNESS);
  // A side paints the outside of its shell; its deck's fittings and the insides of its bulwarks keep their timber.
  if (drawn.part == HULL_PART && drawn.shell > 0.5) {
    let line = place.band.x + place.band.y * drawn.model.x;
    if (place.stripe.w > 0.0 && abs(drawn.model.y - line) < place.band.z) {
      colour = place.stripe.rgb * clamp(grain / HULL_LIGHT, 0.7, 1.3);
    } else if (place.hull.w > 0.0) {
      colour = place.hull.rgb * clamp(grain / HULL_LIGHT, 0.6, 1.4);
    }
  } else if (drawn.part == SAIL_PART && place.canvas.w > 0.0) {
    colour = place.canvas.rgb * clamp(grain / SAIL_LIGHT, 0.75, 1.15);
  }
  // The land's light: the sky's, what the water throws back onto its sides, the key light where the shadows and the
  // clouds let it, and the lamps near.
  let ambient = sky_ambient(normal) * (1.0 + (BOUNCE / AMBIENT) * (1.0 - abs(normal.z)));
  let direct = max(dot(normal, sky_state.key.xyz), 0.0);
  let sun = select(1.0, sunlit(drawn.from_eye, normal), direct > 0.0) * sky_dapple(drawn.from_eye);
  let light = ambient + sky_direct(normal, sun) + sky_lamps(drawn.from_eye, normal);
  return vec4f(colour * place.shade.x * light, 1.0);
}
`;

/** Its shadow's shader: its faces drawn along the sun into its map (`SHADOW_CAST_WGSL`). */
export const SHIP_CAST_SHADER = /* wgsl */ `
${PLACE_SHADER}
${SHADOW_CAST_WGSL}

@vertex
fn cast_vertex(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(3) part: vec4u,
) -> @builtin(position) vec4f {
  return shadow.from_eye * vec4f(placed(position, normal.xyz, part).from_eye, 1.0);
}
`;

let painted: Picture[] | null = null;
/** Its parts' pictures, a layer a part in `SHIP_PARTS`' order, then a flag a side in `SHIP_SIDES`': painted once. */
function pictures(): Picture[] {
  painted ??= [...shipPictures(), ...flagPictures()];
  return painted;
}

/** A picture's mean lightness, 0 to 1. */
function lightnessOf(picture: Picture | undefined): number {
  if (!picture) throw new Error("a ship's part has no picture");
  let sum = 0;
  for (let texel = 0; texel < picture.rgba.length; texel += 4)
    sum +=
      0.299 * (picture.rgba[texel] ?? 0) +
      0.587 * (picture.rgba[texel + 1] ?? 0) +
      0.114 * (picture.rgba[texel + 2] ?? 0);
  return Math.max(0.05, sum / (picture.rgba.length / 4) / 255);
}

/** Its parts' pictures and the sides' flags on the GPU: a layer each, with every level. */
function picturesTexture(device: GPUDevice): GPUTexture {
  const side = SHIP_PICTURE_TEXELS;
  const levels = Math.log2(side) + 1;
  const texture = device.createTexture({
    size: [side, side, pictures().length],
    format: 'rgba8unorm',
    mipLevelCount: levels,
    usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
  });
  pictures().forEach((picture, layer) => {
    if (picture.width !== side || picture.height !== side) throw new Error(`a ship's picture is not ${side} square`);
    levelsOf(picture.rgba, side).forEach((level, mipLevel) => {
      const width = side >> mipLevel;
      device.queue.writeTexture({ texture, mipLevel, origin: [0, 0, layer] }, level, { bytesPerRow: width * 4 }, [
        width,
        width,
        1,
      ]);
    });
  });
  return texture;
}

/** What every hull's view on a device shares: its pipeline and its shadow's, its pictures and their sampler. */
export interface ShipKit {
  readonly pipeline: GPURenderPipeline;
  readonly cast: GPURenderPipeline;
  readonly pictures: GPUTextureView;
  readonly sampler: GPUSampler;
}

const kits = new WeakMap<GPUDevice, Promise<ShipKit>>();

/** The device's ship kit, made the first time a hull is opened on it. */
export function shipKit(gpu: Gpu): Promise<ShipKit> {
  let kit = kits.get(gpu.device);
  if (!kit) {
    const lightness = (part: (typeof SHIP_PARTS)[number]) => lightnessOf(pictures()[SHIP_PARTS.indexOf(part)]);
    const [hullLight, sailLight] = [lightness('hull'), lightness('sail')];
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHIP_DRAW_SHADER });
    const castModule = device.createShaderModule({ code: SHIP_CAST_SHADER });
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const placeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: both, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { viewDimension: '2d-array' } },
        { binding: 2, visibility: SHADER_STAGE.fragment, sampler: {} },
      ],
    });
    const shadows = shadowLayouts(device);
    const sky = skyUniformFor(device);
    const buffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: VERTEX_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
          { shaderLocation: 2, offset: 16, format: 'float32x2' },
          { shaderLocation: 3, offset: 24, format: 'uint8x4' },
        ],
      },
    ];
    const drawing = device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [placeLayout, shadows.receiver, sky.empty, sky.layout],
      }),
      vertex: { module, entryPoint: 'vertex_main', buffers },
      fragment: {
        module,
        entryPoint: 'fragment_main',
        constants: { HULL_LIGHT: hullLight, SAIL_LIGHT: sailLight },
        targets: [{ format: gpu.format }],
      },
      primitive: { topology: 'triangle-list', frontFace: FRONT_FACE },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
    // Its sails and planks are single faces, so both sides cast.
    const casting = device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [placeLayout, shadows.caster] }),
      vertex: { module: castModule, entryPoint: 'cast_vertex', buffers },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    kit = Promise.all([drawing, casting]).then(([pipeline, cast]) => ({
      pipeline,
      cast,
      pictures: picturesTexture(gpu.device).createView({ dimension: '2d-array' }),
      sampler: gpu.device.createSampler({
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        magFilter: 'nearest',
        minFilter: 'linear',
        mipmapFilter: 'linear',
      }),
    }));
    // A kit that failed is made afresh the next time a hull is opened.
    kit.catch(() => kits.delete(gpu.device));
    kits.set(gpu.device, kit);
  }
  return kit;
}

/** A buffer of `bytes` on the device, written at once. */
export function bufferOf(device: GPUDevice, bytes: ArrayBuffer | Uint32Array<ArrayBuffer>, usage: number): GPUBuffer {
  const buffer = device.createBuffer({ size: bytes.byteLength, usage: usage | BUFFER_USAGE.copyDestination });
  device.queue.writeBuffer(buffer, 0, bytes);
  return buffer;
}
