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
export class FightMarks implements Drawer {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private vertices: GPUBuffer | null = null;
  private count = 0;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    const blend: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    this.pipeline = device.createRenderPipeline({
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
    });
    this.viewBuffer = device.createBuffer({
      size: VIEW_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.viewGroup = device.createBindGroup({
      layout,
      entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }],
    });
  }

  /** The marks the next frames draw, measured from the eye they are drawn for (`marksMesh`'s origin). */
  set(vertices: Float32Array): void {
    this.count = vertices.length / MARK_FLOATS;
    if (this.count === 0) return;
    if (!this.vertices || this.vertices.size < vertices.byteLength) {
      this.vertices?.destroy();
      const size = Math.max(vertices.byteLength, 4096 * MARK_FLOATS * 4);
      this.vertices = this.gpu.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    this.gpu.device.queue.writeBuffer(this.vertices, 0, vertices);
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    if (this.count === 0 || !this.vertices) return;
    this.gpu.device.queue.writeBuffer(this.viewBuffer, 0, new Float32Array(fromEye));
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.viewGroup);
    pass.setVertexBuffer(0, this.vertices);
    pass.draw(this.count);
  }

  /** Lets the marks' buffer go. */
  release(): void {
    this.vertices?.destroy();
    this.vertices = null;
    this.count = 0;
  }
}
