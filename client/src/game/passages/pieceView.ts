// The passages' pieces drawn on WebGPU (passagePieces.ts): a drawer of the same shape as the game's scene and the
// dungeon's scene take (client/src/game/scene.ts `Drawer`), by structure, into their pass (4x MSAA, depth reversed).
// Each face is lit by a light from above and the eye's own, and a lit lamp's light shows its own colour whole, so it
// reads gold in a dungeon's dark as on a hollow's daylit ground.
import { REVERSED_DEPTH } from '../../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../../gpu.ts';
import { SAMPLES } from '../../water/waterView.ts';
import { PIECE_FLOATS, type PieceMesh } from './passagePieces.ts';

export const PIECE_SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f, offset: vec4f }
@group(0) @binding(0) var<uniform> view: View;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) colour: vec3f,
  @location(2) glow: f32,
  @location(3) toward_eye: vec3f,
}

@vertex fn piece_vertex(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) colour: vec3f,
  @location(3) glow: f32,
) -> Out {
  var out: Out;
  let from_eye = position + view.offset.xyz;
  out.position = view.from_eye * vec4f(from_eye, 1.0);
  out.normal = normal;
  out.colour = colour;
  out.glow = glow;
  out.toward_eye = -from_eye;
  return out;
}

@fragment fn piece_fragment(in: Out) -> @location(0) vec4f {
  let normal = normalize(in.normal);
  let above = max(dot(normal, normalize(vec3f(0.3, -0.4, 0.86))), 0.0);
  let facing = max(dot(normal, normalize(in.toward_eye)), 0.0);
  let lit = in.colour * (0.28 + 0.42 * above + 0.3 * facing);
  return vec4f(mix(lit, in.colour, in.glow), 1.0);
}
`;

const pipelines = new WeakMap<GPUDevice, Map<GPUTextureFormat, GPURenderPipeline>>();

function pipelineOf(gpu: Gpu): GPURenderPipeline {
  const byFormat = pipelines.get(gpu.device) ?? new Map<GPUTextureFormat, GPURenderPipeline>();
  pipelines.set(gpu.device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const module = gpu.device.createShaderModule({ code: PIECE_SHADER });
  const layout = gpu.device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: { type: 'uniform' } }],
  });
  const made = gpu.device.createRenderPipeline({
    layout: gpu.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: {
      module,
      entryPoint: 'piece_vertex',
      buffers: [
        {
          arrayStride: PIECE_FLOATS * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' },
            { shaderLocation: 3, offset: 36, format: 'float32' },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'piece_fragment', targets: [{ format: gpu.format }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
    multisample: { count: SAMPLES },
  });
  byFormat.set(gpu.format, made);
  return made;
}

/** The zone's pieces, set again whenever their state changes, drawn from the eye where the zone's frame stands at
 *  `origin` in the world. */
export class PieceView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniform: GPUBuffer;
  private readonly group: GPUBindGroup;
  private readonly frame = new Float32Array(20);
  private drawn: { vertices: GPUBuffer; indices: GPUBuffer; count: number } | null = null;
  private origin: readonly [number, number, number] = [0, 0, 0];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.pipeline = pipelineOf(gpu);
    this.uniform = gpu.device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
  }

  /** Draws `mesh` from now on, its zone's frame at `origin`; an empty mesh draws nothing. */
  set(mesh: PieceMesh, origin: readonly [number, number, number] = [0, 0, 0]): void {
    this.clear();
    this.origin = origin;
    if (mesh.indices.length === 0) return;
    const { device } = this.gpu;
    const vertices = device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    const indices = device.createBuffer({
      size: mesh.indices.byteLength,
      usage: BUFFER_USAGE.index | BUFFER_USAGE.copyDestination,
    });
    device.queue.writeBuffer(vertices, 0, mesh.vertices);
    device.queue.writeBuffer(indices, 0, mesh.indices);
    this.drawn = { vertices, indices, count: mesh.indices.length };
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: { readonly eye: readonly number[] }): void {
    const drawn = this.drawn;
    if (!drawn) return;
    // The offset from the eye in doubles, so the GPU's floats keep their centimetres however far out the zone lies.
    this.frame.set(fromEye.subarray(0, 16));
    this.frame.set(
      this.origin.map((along, axis) => along - (shot.eye[axis] ?? 0)),
      16,
    );
    this.gpu.device.queue.writeBuffer(this.uniform, 0, this.frame);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, drawn.vertices);
    pass.setIndexBuffer(drawn.indices, 'uint32');
    pass.drawIndexed(drawn.count);
  }

  clear(): void {
    this.drawn?.vertices.destroy();
    this.drawn?.indices.destroy();
    this.drawn = null;
  }
}
