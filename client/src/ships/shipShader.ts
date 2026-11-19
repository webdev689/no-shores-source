// What every hull's view draws with, made once a device and shared: the ship shader, its pipeline (built off the
// frame, so a hull first seen at sea does not stall one), and her parts' and the sides' flags' pictures and sampler.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { levelsOf } from '../textures/levels.ts';
import type { Picture } from '../textures/picture.ts';
import { SHIP_PARTS, SHIP_PICTURE_TEXELS, shipPictures } from '../textures/shipPictures.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { flagPictures } from './flagPictures.ts';
import { VERTEX_BYTES } from './shipMesh.ts';

/** Her faces seen from outside reach the screen counter-clockwise, as the land's and the water's do: the export keeps
 *  each face's corners in the model's own order, and the world (east, south, up) is mirrored as her frame is. */
export const FRONT_FACE: GPUFrontFace = 'ccw';

/** A part's picture repeats at this many texels a metre over her, as a forged model's do. */
const TEXELS_PER_METRE = 40;
/** The most yards a hull carries, the Frigate's nine with room to spare. */
export const MOST_YARDS = 12;
/** A ship's uniforms: her place, look and paint (60 floats), then each yard's pivot and turn. */
export const PLACE_FLOATS = 60 + MOST_YARDS * 4;
/** Where in her uniforms each yard's pivot and turn start. */
export const YARD_FLOATS_AT = 60;

const [HULL_PART, SAIL_PART] = [SHIP_PARTS.indexOf('hull'), SHIP_PARTS.indexOf('sail')];

/** The shader, its parts' pictures' mean lightness given: a side's paint keeps a picture's grain about its colour. */
const shipShader = (hullLight: number, sailLight: number) => /* wgsl */ `
${SHARED_WGSL}
const AMBIENT = 0.35;
const HULL_LIGHT = ${hullLight.toFixed(4)};
const SAIL_LIGHT = ${sailLight.toFixed(4)};
const HULL_PART = ${HULL_PART}u;
const SAIL_PART = ${SAIL_PART}u;
const LIGHTNESS = vec3f(0.299, 0.587, 0.114);
// Her UVs are metres; a picture repeats every SHIP_PICTURE_TEXELS / TEXELS_PER_METRE of them, standing upright.
const PICTURE_PER_M = vec2f(${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS}, -${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS});

struct Place {
  from_eye: mat4x4f,
  turn: mat4x4f,
  // Her middle from the eye, metres as drawn.
  offset: vec4f,
  // How light she is drawn: 1 as modelled, less for a darker ship.
  shade: vec4f,
  // Her side's paint for her hull, her stripe and her canvas, each its colour and 1 where it is laid, 0 where not.
  hull: vec4f,
  stripe: vec4f,
  canvas: vec4f,
  // Her stripe's line in her frame: its height at her middle, its rise a metre toward her bow, and its half height.
  band: vec4f,
  unused: vec4f,
  // Each yard's pivot on her centreline (x, y) and the cosine and sine of its brace.
  yards: array<vec4f, ${MOST_YARDS}>,
};

@group(0) @binding(0) var<uniform> place: Place;
@group(0) @binding(1) var pictures: texture_2d_array<f32>;
@group(0) @binding(2) var pictured: sampler;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) part: u32,
  // 1 on the outside of her shell, 0 off it, blended across a face whose corners differ.
  @location(3) shell: f32,
  // How high on her it is, and how far along her, in her own frame.
  @location(4) model: vec2f,
};

/** A vector of her frame turned by a yard's brace about a vertical axis. */
fn braced(vector: vec2f, brace: vec4f) -> vec2f {
  return vec2f(vector.x * brace.z - vector.y * brace.w, vector.x * brace.w + vector.y * brace.z);
}

@vertex
fn vertex_main(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
  @location(3) part: vec4u,
) -> Drawn {
  var drawn: Drawn;
  var at = position;
  var facing = normal.xyz;
  // A yard turns round its mast with its sail's brace.
  if (part.z > 0u) {
    let yard = place.yards[part.z - 1u];
    at = vec3f(yard.xy + braced(position.xy - yard.xy, yard), position.z);
    facing = vec3f(braced(normal.xy, yard), normal.z);
  }
  let world = (place.turn * vec4f(at, 0.0)).xyz + place.offset.xyz;
  drawn.clip = place.from_eye * vec4f(world, 1.0);
  drawn.normal = (place.turn * vec4f(facing, 0.0)).xyz;
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
  let light = dot(colour, LIGHTNESS);
  // A side paints the outside of her shell; her deck's fittings and the insides of her bulwarks keep their timber.
  if (drawn.part == HULL_PART && drawn.shell > 0.5) {
    let line = place.band.x + place.band.y * drawn.model.x;
    if (place.stripe.w > 0.0 && abs(drawn.model.y - line) < place.band.z) {
      colour = place.stripe.rgb * clamp(light / HULL_LIGHT, 0.7, 1.3);
    } else if (place.hull.w > 0.0) {
      colour = place.hull.rgb * clamp(light / HULL_LIGHT, 0.6, 1.4);
    }
  } else if (drawn.part == SAIL_PART && place.canvas.w > 0.0) {
    colour = place.canvas.rgb * clamp(light / SAIL_LIGHT, 0.75, 1.15);
  }
  return vec4f(colour * place.shade.x * (AMBIENT + (1.0 - AMBIENT) * max(dot(normal, SUN), 0.0)), 1.0);
}
`;

let painted: Picture[] | null = null;
/** Her parts' pictures, a layer a part in `SHIP_PARTS`' order, then a flag a side in `SHIP_SIDES`': painted once. */
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

/** Her parts' pictures and the sides' flags on the GPU: a layer each, with every level. */
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

/** What every hull's view on a device shares: its pipeline, its pictures and their sampler. */
export interface ShipKit {
  readonly pipeline: GPURenderPipeline;
  readonly pictures: GPUTextureView;
  readonly sampler: GPUSampler;
}

const kits = new WeakMap<GPUDevice, Promise<ShipKit>>();

/** The device's ship kit, made the first time a hull is opened on it. */
export function shipKit(gpu: Gpu): Promise<ShipKit> {
  let kit = kits.get(gpu.device);
  if (!kit) {
    const lightness = (part: (typeof SHIP_PARTS)[number]) => lightnessOf(pictures()[SHIP_PARTS.indexOf(part)]);
    const module = gpu.device.createShaderModule({ code: shipShader(lightness('hull'), lightness('sail')) });
    kit = gpu.device
      .createRenderPipelineAsync({
        layout: 'auto',
        vertex: {
          module,
          entryPoint: 'vertex_main',
          buffers: [
            {
              arrayStride: VERTEX_BYTES,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
                { shaderLocation: 2, offset: 16, format: 'float32x2' },
                { shaderLocation: 3, offset: 24, format: 'uint8x4' },
              ],
            },
          ],
        },
        fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
        primitive: { topology: 'triangle-list', frontFace: FRONT_FACE },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
        multisample: { count: SAMPLES },
      })
      .then((pipeline) => ({
        pipeline,
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
