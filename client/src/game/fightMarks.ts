import { MARK_FLOATS } from '../combat/marks.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { BUFFER_USAGE, SHADER_STAGE, type Gpu } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';
import type { Drawer } from './scene.ts';

const VIEW_BYTES = 64;

/** The fight's marks measured from the eye, as the land is drawn, each vertex its own colour and opacity. */
const SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f }
@group(0) @binding(0) var<uniform> view: View;

struct Out { @builtin(position) position: vec4f, @location(0) colour: vec4f }

@vertex fn mark_vertex(@location(0) position: vec3f, @location(1) colour: vec4f) -> Out {
  var out: Out;
  out.position = view.from_eye * vec4f(position, 1.0);
  out.colour = colour;
  return out;
}

@fragment fn mark_fragment(in: Out) -> @location(0) vec4f {
  return vec4f(in.colour.rgb * in.colour.a, in.colour.a);
}
`;

/**
 * The marks of a fight on foot, as the combat layer's `marksMesh` lays them: telegraphed blows on the ground, arrows
 * in flight, sparks and tracers. They are blended over the scene, tested against its depth but writing none, so the
 * figures stand over them and they never hide one another.
 */
/** The pipeline every set of marks on one GPU draws with, made once. */
interface Shared {
  readonly pipeline: GPURenderPipeline;
  readonly layout: GPUBindGroupLayout;
}
const sharedByGpu = new WeakMap<Gpu, Shared>();

function sharedOf(gpu: Gpu): Shared {
  const found = sharedByGpu.get(gpu);
  if (found) return found;
  const { device } = gpu;
  const module = device.createShaderModule({ code: SHADER });
  const layout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
  });
  const blend: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
  const shared = {
    layout,
    pipeline: device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module,
        entryPoint: 'mark_vertex',
        buffers: [
          {
            arrayStride: MARK_FLOATS * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'mark_fragment',
        targets: [{ format: gpu.format, blend: { color: blend, alpha: blend } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    }),
  };
  sharedByGpu.set(gpu, shared);
  return shared;
}

export class FightMarks implements Drawer {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private vertices: GPUBuffer | null = null;
  private count = 0;
  /** Where the mesh's origin stands from the eye, so a mesh laid once is drawn true as the eye moves. */
  private readonly shift = [0, 0, 0];
  private readonly view = new Float32Array(16);

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const { pipeline, layout } = sharedOf(gpu);
    this.pipeline = pipeline;
    this.viewBuffer = device.createBuffer({
      size: VIEW_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.viewGroup = device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }],
    });
  }

  /** The marks the next frames draw, measured from `marksMesh`'s origin: the eye they are drawn for, unless `moved`
   *  says where that origin stands from the eye now. */
  set(vertices: Float32Array): void {
    this.count = vertices.length / MARK_FLOATS;
    this.moved([0, 0, 0]);
    if (this.count === 0) return;
    if (!this.vertices || this.vertices.size < vertices.byteLength) {
      this.vertices?.destroy();
      // Grown by doubling, so a mesh that keeps growing makes a new buffer seldom.
      const size = Math.max(vertices.byteLength * 2, 4096 * MARK_FLOATS * 4);
      this.vertices = this.gpu.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    this.gpu.device.queue.writeBuffer(this.vertices, 0, vertices);
  }

  /** Where the mesh's origin stands from the eye now, metres: a mesh laid about a fixed place is drawn true as the eye
   *  moves, without being laid again. */
  moved(offset: readonly [number, number, number]): void {
    [this.shift[0], this.shift[1], this.shift[2]] = offset;
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    if (this.count === 0 || !this.vertices) return;
    // The view times a step by the shift: its last column takes the shift through the first three.
    const [east = 0, south = 0, up = 0] = this.shift;
    for (let index = 0; index < 12; index += 1) this.view[index] = fromEye[index] ?? 0;
    for (let row = 0; row < 4; row += 1) {
      const turned = (column: number) => fromEye[column * 4 + row] ?? 0;
      this.view[12 + row] = turned(0) * east + turned(1) * south + turned(2) * up + turned(3);
    }
    this.gpu.device.queue.writeBuffer(this.viewBuffer, 0, this.view);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.viewGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.draw(this.count);
  }

  /** Lets the marks' buffers go. */
  release(): void {
    this.viewBuffer.destroy();
    this.vertices?.destroy();
    this.vertices = null;
    this.count = 0;
  }
}
