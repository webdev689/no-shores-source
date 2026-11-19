import { skyUniformFor } from '../sky/skyUniform.ts';
import { BUFFER_USAGE, type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { levelsOf } from '../textures/levels.ts';
import { SHIP_PARTS, SHIP_PICTURE_TEXELS, shipPictures } from '../textures/shipPictures.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { SAIL_COLUMNS, SAIL_ROWS, type SailCorners, type SailRig } from './sails.ts';
import { shipAxes } from './shipAxes.ts';
import { type ShipMesh, VERTEX_BYTES, type Waterline } from './shipMesh.ts';

/** Where a ship is drawn: her middle in window metres (her height as drawn), her heading (radians clockwise from
 *  north), her bow's rise and her heel to starboard (radians), and how many times her size (1 unless said). */
export interface ShipPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
  readonly scale?: number;
}

/** The camera she is drawn from: its matrix from the eye, and the eye in window metres as drawn. */
export interface ShipCamera {
  readonly fromEye: Float32Array;
  readonly eye: readonly [number, number, number];
}

/** Her faces seen from outside reach the screen counter-clockwise, as the land's and the water's do: the export keeps
 *  each face's corners in the model's own order, and the world (east, south, up) is mirrored as her frame is. */
export const FRONT_FACE: GPUFrontFace = 'ccw';

/** The matrix (column-major, 4 × 4) that turns her own frame (x to her bow, y to starboard, z up) into the world's
 *  (east, south, up): her roll, then her pitch, then her heading. */
export function shipTurn(heading: number, pitch: number, roll: number): Float32Array<ArrayBuffer> {
  const turn = new Float32Array(16);
  shipAxes(heading, pitch, roll).forEach((column, index) => turn.set(column, index * 4));
  turn[15] = 1;
  return turn;
}

/** A part's picture repeats at this many texels a metre over her, as a forged model's do. */
const TEXELS_PER_METRE = 40;

export const SHIP_SHADER = /* wgsl */ `
${SHARED_WGSL}
// Her UVs are metres; a picture repeats every SHIP_PICTURE_TEXELS / TEXELS_PER_METRE of them, standing upright.
const PICTURE_PER_M = vec2f(${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS}, -${TEXELS_PER_METRE / SHIP_PICTURE_TEXELS});

struct Place {
  from_eye: mat4x4f,
  turn: mat4x4f,
  // Her middle from the eye, metres as drawn.
  offset: vec4f,
  // How light she is drawn: 1 as modelled, less for a darker ship.
  shade: vec4f,
};

@group(0) @binding(0) var<uniform> place: Place;
@group(0) @binding(1) var pictures: texture_2d_array<f32>;
@group(0) @binding(2) var pictured: sampler;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) part: u32,
  @location(3) from_eye: vec3f,
};

@vertex
fn vertex_main(
  @location(0) position: vec3f,
  @location(1) normal: vec4f,
  @location(2) uv: vec2f,
  @location(3) part: vec4u,
) -> Drawn {
  var drawn: Drawn;
  let world = (place.turn * vec4f(position, 0.0)).xyz + place.offset.xyz;
  drawn.clip = place.from_eye * vec4f(world, 1.0);
  drawn.from_eye = world;
  drawn.normal = (place.turn * vec4f(normal.xyz, 0.0)).xyz;
  drawn.uv = uv * PICTURE_PER_M;
  drawn.part = part.x;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  // Sails and planks are single faces seen from both sides: the side seen is lit.
  let normal = normalize(select(-drawn.normal, drawn.normal, facing));
  let colour = textureSample(pictures, pictured, drawn.uv, drawn.part).rgb;
  let light = sky_ambient(normal) + sky_direct(normal, sky_dapple(drawn.from_eye)) + sky_lamps(drawn.from_eye, normal);
  return vec4f(colour * place.shade.x * light, 1.0);
}
`;

/** A canvas's grid as triangles, two a cell, each sail's after the last's. */
function canvasIndices(sails: number): Uint32Array<ArrayBuffer> {
  const corners: number[] = [];
  for (let sail = 0; sail < sails; sail++)
    for (let row = 0; row < SAIL_ROWS - 1; row++)
      for (let column = 0; column < SAIL_COLUMNS - 1; column++) {
        const first = sail * SAIL_COLUMNS * SAIL_ROWS + row * SAIL_COLUMNS + column;
        const [right, up] = [first + 1, first + SAIL_COLUMNS];
        corners.push(first, right, up + 1, first, up + 1, up);
      }
  return new Uint32Array(corners);
}

/** The canvas's vertices, as her mesh's are, from each sail's grid now: a point's normal across its neighbours (the
 *  side its triangles face on the screen, as the export keeps hers), its UV the metres of its sail laid flat. */
export function canvasVertices(canvas: readonly Float32Array[], flat: readonly Float32Array[]): ArrayBuffer {
  const bytes = new ArrayBuffer(canvas.length * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES);
  const view = new DataView(bytes);
  const sailPart = SHIP_PARTS.indexOf('sail');
  canvas.forEach((points, sail) => {
    const pointAt = (column: number, row: number, axis: number): number =>
      points[
        (Math.min(SAIL_ROWS - 1, Math.max(0, row)) * SAIL_COLUMNS + Math.min(SAIL_COLUMNS - 1, Math.max(0, column))) *
          3 +
          axis
      ] ?? 0;
    for (let row = 0; row < SAIL_ROWS; row++)
      for (let column = 0; column < SAIL_COLUMNS; column++) {
        const along = [0, 1, 2].map((axis) => pointAt(column + 1, row, axis) - pointAt(column - 1, row, axis));
        const up = [0, 1, 2].map((axis) => pointAt(column, row + 1, axis) - pointAt(column, row - 1, axis));
        const [alongX, alongY, alongZ] = along as [number, number, number];
        const [upX, upY, upZ] = up as [number, number, number];
        // The mirrored frame: a face's front is where (up × along) points, as her export's normals are.
        const normal = [upY * alongZ - upZ * alongY, upZ * alongX - upX * alongZ, upX * alongY - upY * alongX];
        const length = Math.hypot(...normal) || 1;
        const byte = ((sail * SAIL_ROWS + row) * SAIL_COLUMNS + column) * VERTEX_BYTES;
        const grid = (row * SAIL_COLUMNS + column) * 3;
        for (let axis = 0; axis < 3; axis++) {
          view.setFloat32(byte + axis * 4, points[grid + axis] ?? 0, true);
          view.setInt8(byte + 12 + axis, Math.round(((normal[axis] ?? 0) / length) * 127));
        }
        const laid = flat[sail];
        view.setFloat32(byte + 16, laid?.[grid] ?? 0, true);
        view.setFloat32(byte + 20, laid?.[grid + 2] ?? 0, true);
        view.setUint8(byte + 24, sailPart);
      }
  });
  return bytes;
}

/** Her parts' pictures on the GPU: a layer a part, with every level. */
function picturesTexture(device: GPUDevice): GPUTexture {
  const side = SHIP_PICTURE_TEXELS;
  const levels = Math.log2(side) + 1;
  const texture = device.createTexture({
    size: [side, side, SHIP_PARTS.length],
    format: 'rgba8unorm',
    mipLevelCount: levels,
    usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
  });
  shipPictures().forEach((picture, layer) => {
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

/** How many ships of one model are drawn in a frame: every ship a fleet room holds, its sixteen players' and four
 *  captains'. */
export const SHIP_SLOTS = 20;
const PLACE_FLOATS = 40;

/** Draws a ship's mesh at her place, lit as the land is, into the land's pass so the water sees her, each part in its
 *  picture, and her sails' canvas as her rig sets it: one model, up to `slots` ships of it a frame, each with her own
 *  place and canvas. */
export class ShipView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertices: GPUBuffer;
  private readonly indices: GPUBuffer;
  private readonly slots: {
    readonly uniforms: GPUBuffer;
    readonly bindGroup: GPUBindGroup;
    readonly canvas: GPUBuffer | null;
  }[];
  private readonly indexCount: number;
  private readonly canvasIndices: GPUBuffer | null;
  private readonly canvasIndexCount: number;
  /** Her waterline, for her footprint on the water and her wake. */
  readonly waterline: Waterline;
  /** Her sails' corners, for each ship's rig. */
  readonly sails: readonly SailCorners[];

  constructor(gpu: Gpu, mesh: ShipMesh, sails: readonly SailCorners[], slots = SHIP_SLOTS) {
    this.device = gpu.device;
    this.waterline = mesh.waterline;
    this.sails = sails;
    const module = gpu.device.createShaderModule({ code: SHIP_SHADER });
    this.pipeline = gpu.device.createRenderPipeline({
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
    });
    this.vertices = gpu.device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    gpu.device.queue.writeBuffer(this.vertices, 0, mesh.vertices);
    this.indices = gpu.device.createBuffer({
      size: mesh.indices.byteLength,
      usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
    });
    gpu.device.queue.writeBuffer(this.indices, 0, mesh.indices);
    this.indexCount = mesh.indices.length;
    const grid = canvasIndices(sails.length);
    this.canvasIndexCount = grid.length;
    this.canvasIndices = sails.length
      ? gpu.device.createBuffer({
          size: grid.byteLength,
          usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
        })
      : null;
    if (this.canvasIndices) gpu.device.queue.writeBuffer(this.canvasIndices, 0, grid);
    const pictures = picturesTexture(gpu.device).createView({ dimension: '2d-array' });
    const pictured = gpu.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'nearest',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
    this.slots = Array.from({ length: slots }, () => {
      const uniforms = gpu.device.createBuffer({
        size: PLACE_FLOATS * 4,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      const bindGroup = gpu.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: pictures },
          { binding: 2, resource: pictured },
        ],
      });
      const canvas = sails.length
        ? gpu.device.createBuffer({
            size: sails.length * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES,
            usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
          })
        : null;
      return { uniforms, bindGroup, canvas };
    });
  }

  /** Draws her into a pass the land's pipelines draw into (its formats, samples and reversed depth), in her own
   *  `slot` of the frame, `shade` as light as modelled, her canvas as `rig` sets it (none without a rig). */
  drawInto(
    pass: GPURenderPassEncoder,
    place: ShipPlace,
    camera: ShipCamera,
    slot = 0,
    shade = 1,
    rig: SailRig | null = null,
  ): void {
    const drawn = this.slots[slot];
    if (!drawn) return;
    const values = new Float32Array(PLACE_FLOATS);
    values.set(camera.fromEye);
    const turn = shipTurn(place.heading, place.pitch, place.roll);
    // A ship drawn larger than life: her frame's three axes stretched alike (the shader renormalises her normals).
    for (let index = 0; index < 12; index++) turn[index] = (turn[index] ?? 0) * (place.scale ?? 1);
    values.set(turn, 16);
    values.set([place.x - camera.eye[0], place.y - camera.eye[1], place.z - camera.eye[2], 0], 32);
    values.set([shade, 0, 0, 0], 36);
    this.device.queue.writeBuffer(drawn.uniforms, 0, values);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, drawn.bindGroup);
    skyUniformFor(this.device).bindAuto(pass, this.pipeline, [1, 2]);
    pass.setVertexBuffer(0, this.vertices);
    pass.setIndexBuffer(this.indices, 'uint32');
    pass.drawIndexed(this.indexCount);
    if (!rig || !drawn.canvas || !this.canvasIndices) return;
    this.device.queue.writeBuffer(
      drawn.canvas,
      0,
      canvasVertices(
        rig.canvas(),
        rig.sails.map((sail) => sail.flat),
      ),
    );
    pass.setVertexBuffer(0, drawn.canvas);
    pass.setIndexBuffer(this.canvasIndices, 'uint32');
    pass.drawIndexed(this.canvasIndexCount);
  }
}
