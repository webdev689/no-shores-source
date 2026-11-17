import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { headingFrame } from '../rules/landRules.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { type ShipMesh, VERTEX_BYTES, type Waterline } from './shipMesh.ts';

/** Where a ship is drawn: her middle in window metres (her height as drawn), her heading (radians clockwise from
 *  north), her bow's rise and her heel to starboard (radians). */
export interface ShipPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
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
  const flat = headingFrame(heading);
  const [forward, starboard] = [
    [...flat.forward, 0],
    [...flat.starboard, 0],
  ];
  const up = [0, 0, 1];
  const [sinPitch, cosPitch, sinRoll, cosRoll] = [Math.sin(pitch), Math.cos(pitch), Math.sin(roll), Math.cos(roll)];
  const along = (ahead: number, aside: number, above: number) =>
    [0, 1, 2].map((axis) => ahead * (forward[axis] ?? 0) + aside * (starboard[axis] ?? 0) + above * (up[axis] ?? 0));
  const columns = [
    along(cosPitch, 0, sinPitch),
    along(sinRoll * sinPitch, cosRoll, -sinRoll * cosPitch),
    along(-cosRoll * sinPitch, sinRoll, cosRoll * cosPitch),
  ];
  const turn = new Float32Array(16);
  columns.forEach((column, index) => turn.set(column, index * 4));
  turn[15] = 1;
  return turn;
}

const SHIP_SHADER = /* wgsl */ `
${SHARED_WGSL}
const AMBIENT = 0.35;

struct Place {
  from_eye: mat4x4f,
  turn: mat4x4f,
  // Her middle from the eye, metres as drawn.
  offset: vec4f,
  // How light she is drawn: 1 as modelled, less for a darker ship.
  shade: vec4f,
};

@group(0) @binding(0) var<uniform> place: Place;

struct Drawn {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) colour: vec3f,
};

@vertex
fn vertex_main(@location(0) position: vec3f, @location(1) normal: vec4f, @location(2) colour: vec4f) -> Drawn {
  var drawn: Drawn;
  let world = (place.turn * vec4f(position, 0.0)).xyz + place.offset.xyz;
  drawn.clip = place.from_eye * vec4f(world, 1.0);
  drawn.normal = (place.turn * vec4f(normal.xyz, 0.0)).xyz;
  drawn.colour = colour.rgb;
  return drawn;
}

@fragment
fn fragment_main(drawn: Drawn, @builtin(front_facing) facing: bool) -> @location(0) vec4f {
  // Sails and planks are single faces seen from both sides: the side seen is lit.
  let normal = normalize(select(-drawn.normal, drawn.normal, facing));
  return vec4f(drawn.colour * place.shade.x * (AMBIENT + (1.0 - AMBIENT) * max(dot(normal, SUN), 0.0)), 1.0);
}
`;

/** How many ships of one model are drawn in a frame: every ship a fleet room holds, its sixteen players' and four
 *  captains'. */
export const SHIP_SLOTS = 20;
const PLACE_FLOATS = 40;

/** Draws a ship's mesh at her place, lit as the land is, into the land's pass so the water sees her: one model, up
 *  to `SHIP_SLOTS` ships of it a frame, each with her own place. */
export class ShipView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly vertices: GPUBuffer;
  private readonly indices: GPUBuffer;
  private readonly slots: { readonly uniforms: GPUBuffer; readonly bindGroup: GPUBindGroup }[];
  private readonly indexCount: number;
  /** Her waterline, for her footprint on the water and her wake. */
  readonly waterline: Waterline;

  constructor(gpu: Gpu, mesh: ShipMesh) {
    this.device = gpu.device;
    this.waterline = mesh.waterline;
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
              { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
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
    this.slots = Array.from({ length: SHIP_SLOTS }, () => {
      const uniforms = gpu.device.createBuffer({
        size: PLACE_FLOATS * 4,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      const bindGroup = gpu.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniforms } }],
      });
      return { uniforms, bindGroup };
    });
  }

  /** Draws her into a pass the land's pipelines draw into (its formats, samples and reversed depth), in her own
   *  `slot` of the frame, `shade` as light as modelled. */
  drawInto(pass: GPURenderPassEncoder, place: ShipPlace, camera: ShipCamera, slot = 0, shade = 1): void {
    const drawn = this.slots[slot];
    if (!drawn) return;
    const values = new Float32Array(PLACE_FLOATS);
    values.set(camera.fromEye);
    values.set(shipTurn(place.heading, place.pitch, place.roll), 16);
    values.set([place.x - camera.eye[0], place.y - camera.eye[1], place.z - camera.eye[2], 0], 32);
    values.set([shade, 0, 0, 0], 36);
    this.device.queue.writeBuffer(drawn.uniforms, 0, values);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, drawn.bindGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.setIndexBuffer(this.indices, 'uint32');
    pass.drawIndexed(this.indexCount);
  }
}
