import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { SAMPLES } from '../water/waterView.ts';
import { VERTEX_FLOATS } from './meshes.ts';

/** A mesh on the GPU, as `meshes.ts` builds them. */
export interface Mesh {
  readonly buffer: GPUBuffer;
  readonly count: number;
}

/** One mesh placed in the world: its anchor (world metres), its heading (a compass bearing its +y faces), its roll and
 *  pitch (radians) and the paint its painted faces take. */
export interface Placing {
  readonly mesh: Mesh;
  readonly at: readonly [number, number, number];
  readonly heading: number;
  readonly roll?: number;
  readonly pitch?: number;
  readonly paint?: readonly [number, number, number];
  /** How many times its own size it is drawn. */
  readonly scale?: number;
}

const VIEW_BYTES = 80;
const PLACE_BYTES = 48;
/** The water's sun (waterCommon's SUN), so a ship and the sea are lit alike. */
const SUN = [-0.5417, 0.5417, 0.6428] as const;

/** A mesh is scaled, turned by its roll and pitch about its own middle, then by its heading, and stood at its anchor
 *  measured from the eye; each face is lit on whichever side the eye sees, so a sail reads from both. */
const SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f, sun: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Place { offset: vec4f, turn: vec4f, paint: vec4f }
@group(1) @binding(0) var<uniform> place: Place;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) colour: vec3f,
  @location(2) from_eye: vec3f,
}

fn tilted(v: vec3f) -> vec3f {
  let roll = place.turn.z;
  let pitch = place.turn.w;
  let rolled = vec3f(v.x * cos(roll) - v.z * sin(roll), v.y, v.x * sin(roll) + v.z * cos(roll));
  return vec3f(
    rolled.x,
    rolled.y * cos(pitch) - rolled.z * sin(pitch),
    rolled.y * sin(pitch) + rolled.z * cos(pitch),
  );
}

fn turned(v: vec3f) -> vec3f {
  return vec3f(v.x * place.turn.x + v.y * place.turn.y, v.x * place.turn.y - v.y * place.turn.x, v.z);
}

@vertex fn mesh_vertex(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) colour: vec4f,
) -> Out {
  let world = turned(tilted(position * place.offset.w)) + place.offset.xyz;
  var out: Out;
  out.position = view.from_eye * vec4f(world, 1.0);
  out.normal = turned(tilted(normal));
  out.colour = mix(colour.rgb, place.paint.rgb, colour.a);
  out.from_eye = world;
  return out;
}

@fragment fn mesh_fragment(in: Out) -> @location(0) vec4f {
  var normal = normalize(in.normal);
  if (dot(normal, in.from_eye) > 0.0) { normal = -normal; }
  let sun = max(dot(normal, view.sun.xyz), 0.0);
  let sky = 0.5 + 0.5 * normal.z;
  return vec4f(in.colour * (0.3 + 0.2 * sky + 0.6 * sun), 1.0);
}
`;

/** Draws meshes (ships, and the boxes standing in for a city's walls) into the scene's pass, measured from the eye. */
export class MeshView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly placeLayout: GPUBindGroupLayout;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly slots: { buffer: GPUBuffer; group: GPUBindGroup }[] = [];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const viewLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: both, buffer: {} }] });
    this.placeLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, this.placeLayout] }),
      vertex: {
        module,
        entryPoint: 'mesh_vertex',
        buffers: [
          {
            arrayStride: VERTEX_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'mesh_fragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    this.viewBuffer = device.createBuffer({
      size: VIEW_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.viewGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }],
    });
  }

  /** A mesh's vertices put on the GPU. */
  mesh(values: Float32Array): Mesh {
    const buffer = this.gpu.device.createBuffer({
      size: Math.max(16, values.byteLength),
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeBuffer(buffer, 0, values);
    return { buffer, count: values.length / VERTEX_FLOATS };
  }

  private slot(index: number): { buffer: GPUBuffer; group: GPUBindGroup } {
    let slot = this.slots[index];
    if (!slot) {
      const buffer = this.gpu.device.createBuffer({
        size: PLACE_BYTES,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      const group = this.gpu.device.createBindGroup({
        layout: this.placeLayout,
        entries: [{ binding: 0, resource: { buffer } }],
      });
      slot = { buffer, group };
      this.slots[index] = slot;
    }
    return slot;
  }

  /** Draws the placed meshes from an eye at `eye` (world metres), with the camera's view-projection measured from
   *  the eye. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    placings: readonly Placing[],
  ): void {
    if (placings.length === 0) return;
    const values = new Float32Array(VIEW_BYTES / 4);
    values.set(fromEye);
    values.set([...SUN, 0], 16);
    this.gpu.device.queue.writeBuffer(this.viewBuffer, 0, values);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.viewGroup);
    placings.forEach((placing, index) => {
      const { buffer, group } = this.slot(index);
      const paint = placing.paint ?? [1, 1, 1];
      const place = new Float32Array([
        ...[placing.at[0] - eye[0], placing.at[1] - eye[1], placing.at[2] - eye[2], placing.scale ?? 1],
        ...[Math.cos(placing.heading), Math.sin(placing.heading), placing.roll ?? 0, placing.pitch ?? 0],
        ...[paint[0], paint[1], paint[2], 1],
      ]);
      this.gpu.device.queue.writeBuffer(buffer, 0, place);
      pass.setBindGroup(1, group);
      pass.setVertexBuffer(0, placing.mesh.buffer);
      pass.draw(placing.mesh.count);
    });
  }
}
