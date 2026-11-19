import { SWING_FLOATS } from '../combat/swingArcs.ts';
import { SWING_ATTRIBUTES, SWING_WGSL } from '../combat/swingLook.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';

/** The swings' arcs, measured from the eye as the land is, drawn with the arcs' own pixel fragment. */
const SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f }
@group(0) @binding(0) var<uniform> view: View;
${SWING_WGSL}

@vertex fn swing_vertex(
  @location(0) position: vec3f,
  @location(1) shape: vec4f,
  @location(2) tint: vec4f,
  @location(3) extra: vec2f,
) -> SwingOut {
  var out: SwingOut;
  out.position = view.from_eye * vec4f(position, 1.0);
  out.shape = shape;
  out.tint = tint;
  out.extra = extra;
  return out;
}
`;

/** The arcs of the blows being struck on foot, as the attack feel lays them, over the land and figures, tested
 *  against their depth and writing none. */
export class SwingView {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly group: GPUBindGroup;
  private buffer: GPUBuffer | null = null;
  private count = 0;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const module = gpu.device.createShaderModule({ code: SHADER });
    const blend = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'swing_vertex',
        buffers: [{ arrayStride: SWING_FLOATS * 4, attributes: [...SWING_ATTRIBUTES] }],
      },
      fragment: {
        module,
        entryPoint: 'swingFragment',
        targets: [{ format: gpu.format, blend: { color: blend, alpha: blend } }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    this.view = gpu.device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
  }

  /** The arcs the next frame draws, their vertices in world metres, taken to stand from `eye` (in place). */
  set(vertices: Float32Array, eye: readonly [number, number, number]): void {
    this.count = vertices.length / SWING_FLOATS;
    if (this.count === 0) return;
    for (let start = 0; start < vertices.length; start += SWING_FLOATS)
      for (let axis = 0; axis < 3; axis++) vertices[start + axis] = (vertices[start + axis] ?? 0) - (eye[axis] ?? 0);
    if (!this.buffer || this.buffer.size < vertices.byteLength) {
      this.buffer?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(vertices.byteLength)));
      this.buffer = this.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    this.device.queue.writeBuffer(this.buffer, 0, vertices);
  }

  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    if (!this.buffer || this.count === 0) return;
    this.device.queue.writeBuffer(this.view, 0, fromEye);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.count);
  }
}
