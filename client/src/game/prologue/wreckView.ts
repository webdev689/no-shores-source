// The wreck at sea as drawn: one mesh built in Blender (tools/wreck), each face in its part's picture as the ships'
// are, lit by the light baked into it there. The fires' light, with its shadows and what the timber throws back,
// flickers as the fires burn; the storm sky's lights every face as much as nothing over it hides. The heaps of
// wreckage that close the way are runs of the same mesh, each drawn while it stands.
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../../gpu.ts';
import { contentBytes } from '../../contentCache.ts';
import { FRONT_FACE, holdPictures, releasePictures } from '../../ships/shipView.ts';
import { SKY_WGSL, skyUniformFor } from '../../sky/skyUniform.ts';
import { SHIP_PICTURE_TEXELS } from '../../textures/shipPictures.ts';
import { SAMPLES } from '../../water/waterView.ts';

/** Bytes a vertex: its position (3 × float32, metres), normal (4 × snorm8), the picture's UV (2 × float32, metres),
 *  its part and piece (4 × uint8), and the light's UV (2 × unorm16). */
export const WRECK_VERTEX_BYTES = 32;
/** A part's picture repeats at this many texels a metre, as a ship's does. */
const TEXELS_PER_METRE = 40;

/** The wreck's mesh, in its own frame (x east, y south, z up from the sea, metres): its vertices and corners, where
 *  each piece's corners run (0 the wreck, z + 1 the heap closing zone z), and the light its picture holds at full. */
export interface WreckMesh {
  readonly vertices: ArrayBuffer;
  readonly indices: Uint32Array<ArrayBuffer>;
  readonly pieces: ReadonlyMap<number, { readonly first: number; readonly count: number }>;
  readonly full: { readonly fire: number; readonly sky: number };
}

interface WreckHeader {
  readonly vertices?: number;
  readonly indices?: number;
  readonly stride?: number;
  readonly pieces?: readonly { readonly piece: number; readonly first: number; readonly count: number }[];
  readonly light?: { readonly fire: number; readonly sky: number };
}

/** Reads a wreck's mesh file (tools/wreck/export_wreck.py): its header's length, the header, then its vertices and
 *  its corners, three a face, each piece's in a run. */
export function readWreckMesh(bytes: ArrayBuffer): WreckMesh {
  if (bytes.byteLength < 4) throw new Error("a wreck's mesh is too few bytes to hold its header");
  const length = new DataView(bytes).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, length))) as WreckHeader;
  const [count, corners] = [header.vertices ?? -1, header.indices ?? -1];
  if (!Number.isInteger(count) || !Number.isInteger(corners) || count < 0 || corners < 0)
    throw new Error("a wreck's mesh counts its vertices and corners in whole numbers");
  if (header.stride !== WRECK_VERTEX_BYTES)
    throw new Error(`a wreck's vertex is ${WRECK_VERTEX_BYTES} bytes, not ${String(header.stride)}`);
  const start = 4 + length;
  const end = start + count * WRECK_VERTEX_BYTES;
  if (bytes.byteLength !== end + corners * 4)
    throw new Error(`a wreck of ${count} vertices and ${corners} corners is not ${bytes.byteLength} bytes`);
  const indices = new Uint32Array(bytes.slice(end));
  if (indices.some((index) => index >= count)) throw new Error("a corner of the wreck's mesh names no vertex");
  const pieces = new Map((header.pieces ?? []).map(({ piece, first, count: run }) => [piece, { first, count: run }]));
  if (!pieces.has(0)) throw new Error("a wreck's mesh has no run of its own");
  if (!header.light) throw new Error("a wreck's mesh does not say the light its picture holds at full");
  return { vertices: bytes.slice(start, end), indices, pieces, full: header.light };
}

/** The wreck's mesh and its baked light, fetched from R2 under the keys the layout names. */
export async function loadWreck(
  base: string,
  keys: { readonly mesh: string; readonly light: string },
): Promise<{ readonly mesh: WreckMesh; readonly light: ImageBitmap }> {
  const [mesh, light] = await Promise.all([contentBytes(base + keys.mesh), contentBytes(base + keys.light)]);
  // The picture's alpha is the sky's light, not a coverage: kept apart from its colour, and its numbers as they are.
  const options: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  return {
    mesh: readWreckMesh(mesh.bytes),
    light: await createImageBitmap(new Blob([light.bytes]), options),
  };
}

/** How the wreck is lit in a frame beyond the sky's own light: its fires' share of the bake's, and the story's clock
 *  its fires flicker by. */
export interface WreckLook {
  readonly fire: number;
  readonly time: number;
}

export const WRECK_WGSL = /* wgsl */ `
struct Place {
  from_eye: mat4x4f,
  // The wreck's origin from the eye, metres.
  offset: vec4f,
  // The fires' share, then the clock last.
  look: vec4f,
  // What the picture's full holds of each light; the picture holds each light's square root of it.
  full: vec4f,
};

@group(0) @binding(0) var<uniform> place: Place;
@group(0) @binding(1) var pictures: texture_2d_array<f32>;
@group(0) @binding(2) var pictured: sampler;
@group(0) @binding(3) var light: texture_2d<f32>;
@group(0) @binding(4) var lit: sampler;

${SKY_WGSL}

// The fire's light rolls off toward this, its most: light of this much is drawn at half of it.
const FIRE_KNEE = 2.5;

const PICTURE_PER_M = vec2f(${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS}, -${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS});

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) part: u32,
  @location(2) light_uv: vec2f,
  @location(3) world: vec3f,
  @location(4) normal: vec3f,
  @location(5) from_eye: vec3f,
};

@vertex
fn vertex_main(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
  @location(3) part: vec4u,
  @location(4) light_uv: vec2f,
) -> Drawn {
  var drawn: Drawn;
  let from_eye = position + place.offset.xyz;
  drawn.clip = place.from_eye * vec4f(from_eye, 1.0);
  drawn.uv = uv * PICTURE_PER_M;
  drawn.part = part.x;
  // Blender's UVs rise from the picture's foot; the picture's rows run from its head.
  drawn.light_uv = vec2f(light_uv.x, 1.0 - light_uv.y);
  drawn.world = position;
  drawn.normal = normal.xyz;
  drawn.from_eye = from_eye;
  return drawn;
}

fn hashed(cell: vec3f) -> f32 {
  return fract(sin(dot(cell, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

// A smooth noise through space and time: each stretch of timber's light flickers as its own fire does.
fn flicker(at: vec3f, time: f32) -> f32 {
  let point = vec3f(at.xy * 0.4, time * 2.1);
  let base = floor(point);
  let part = fract(point);
  let eased = part * part * (3.0 - 2.0 * part);
  var sum = 0.0;
  for (var corner = 0u; corner < 8u; corner++) {
    let pick = vec3f(f32(corner & 1u), f32((corner >> 1u) & 1u), f32((corner >> 2u) & 1u));
    let weight = mix(1.0 - eased, eased, pick);
    sum += hashed(base + pick) * weight.x * weight.y * weight.z;
  }
  return 0.78 + 0.3 * sum + 0.06 * sin(time * 13.0 + at.x * 1.7 + at.y * 1.1);
}

// The sky lights the wreck as it lights a ship (its hour, its cloud, its lightning), shut out where the bake found
// the sky hidden: under a deck, in a hollow, behind a heap. Its fires light it from the bake, not as lamps.
@fragment
fn fragment_main(drawn: Drawn, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  let normal = normalize(select(-drawn.normal, drawn.normal, facing));
  let colour = textureSample(pictures, pictured, drawn.uv, drawn.part).rgb;
  let held = textureSample(light, lit, drawn.light_uv);
  let baked = held.rgb * held.rgb * place.full.x * place.look.x * flicker(drawn.world, place.look.w);
  let fire = baked / (1.0 + max(baked.r, max(baked.g, baked.b)) / FIRE_KNEE);
  let open = held.a * held.a * place.full.y;
  let sky = open * (sky_ambient(normal) + sky_direct(normal, sky_dapple(drawn.from_eye)));
  return vec4f(colour * (fire + sky), 1.0);
}
`;

const PLACE_FLOATS = 28;

/** Draws the wreck into the land's pass (its formats, samples and reversed depth), so the water sees it. */
export class WreckView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertices: GPUBuffer;
  private readonly indices: GPUBuffer;
  private readonly uniforms: GPUBuffer;
  private readonly lightTexture: GPUTexture;
  private readonly bindGroup: GPUBindGroup;
  private readonly mesh: WreckMesh;
  private held = true;

  constructor(gpu: Gpu, mesh: WreckMesh, light: ImageBitmap) {
    const { device } = gpu;
    this.device = device;
    this.mesh = mesh;
    const module = device.createShaderModule({ code: WRECK_WGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertex_main',
        buffers: [
          {
            arrayStride: WRECK_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
              { shaderLocation: 2, offset: 16, format: 'float32x2' },
              { shaderLocation: 3, offset: 24, format: 'uint8x4' },
              { shaderLocation: 4, offset: 28, format: 'unorm16x2' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', frontFace: FRONT_FACE },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
    this.vertices = device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(this.vertices, 0, mesh.vertices);
    this.indices = device.createBuffer({
      size: mesh.indices.byteLength,
      usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(this.indices, 0, mesh.indices);
    this.uniforms = device.createBuffer({
      size: PLACE_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.lightTexture = device.createTexture({
      size: [light.width, light.height],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination | TEXTURE_USAGE.renderAttachment,
    });
    device.queue.copyExternalImageToTexture(
      { source: light },
      { texture: this.lightTexture, premultipliedAlpha: false },
      [light.width, light.height],
    );
    const pictures = holdPictures(device).createView({ dimension: '2d-array' });
    const pictured = device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    // The light is laid in blocks, as the game's pixels are: never smoothed between its texels.
    const lit = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: pictures },
        { binding: 2, resource: pictured },
        { binding: 3, resource: this.lightTexture.createView() },
        { binding: 4, resource: lit },
      ],
    });
  }

  /** Draws the wreck at `origin` (world metres) seen from `camera`, lit as `look` says: its own run, and each heap's
   *  `standing` says still stands. */
  drawInto(
    pass: GPURenderPassEncoder,
    origin: readonly [number, number],
    camera: { readonly fromEye: Float32Array; readonly eye: readonly [number, number, number] },
    look: WreckLook,
    standing: (piece: number) => boolean,
  ): void {
    const values = new Float32Array(PLACE_FLOATS);
    values.set(camera.fromEye);
    values.set([origin[0] - camera.eye[0], origin[1] - camera.eye[1], -camera.eye[2], 0], 16);
    values.set([look.fire, 0, 0, look.time], 20);
    values.set([this.mesh.full.fire, this.mesh.full.sky, 0, 0], 24);
    this.device.queue.writeBuffer(this.uniforms, 0, values);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    skyUniformFor(this.device).bindAuto(pass, this.pipeline, [1, 2]);
    pass.setVertexBuffer(0, this.vertices);
    pass.setIndexBuffer(this.indices, 'uint32');
    for (const [piece, run] of this.mesh.pieces)
      if (piece === 0 || standing(piece)) pass.drawIndexed(run.count, 1, run.first);
  }

  /** Lets go of its buffers, its light and the pictures it shares; it is never drawn again. */
  destroy(): void {
    for (const buffer of [this.vertices, this.indices, this.uniforms]) buffer.destroy();
    this.lightTexture.destroy();
    if (this.held) releasePictures(this.device);
    this.held = false;
  }
}
