import { LIGHT_DEPTH, LIGHT_TARGET } from '../combat/lightLayer.ts';
import { SWING_FLOATS } from '../combat/swingArcs.ts';
import { SWING_ATTRIBUTES, SWING_WGSL } from '../combat/swingLook.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';

/** The swings' arcs, measured from the eye as the land is, drawn with the arcs' own pixel fragment. */
export const SHADER = /* wgsl */ `
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

@group(0) @binding(1) var depths: texture_2d<f32>;

// Over the finished picture: hidden where the scene's depth (reversed, nearer is more) stands nearer.
@fragment fn swing_over(in: SwingOut) -> @location(0) vec4f {
  let shown = swing_shade(in);
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  return shown;
}
`;

/** The arcs of the blows being struck on foot, as the attack feel lays them: over the finished picture, after the
 *  water (which would paint its sky and surface over them), tested by hand against the scene's depth. */
export class SwingView {
  private readonly device: GPUDevice;
  private readonly over: GPURenderPipeline;
  private readonly overLayout: GPUBindGroupLayout;
  private overGroup: { depth: GPUTexture; group: GPUBindGroup } | null = null;
  private readonly light: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly group: GPUBindGroup;
  private buffer: GPUBuffer | null = null;
  private count = 0;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.device = device;
    const module = device.createShaderModule({ code: SHADER });
    const blend = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    const vertex: GPUVertexState = {
      module,
      entryPoint: 'swing_vertex',
      buffers: [{ arrayStride: SWING_FLOATS * 4, attributes: [...SWING_ATTRIBUTES] }],
    };
    const viewEntry = { binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} };
    const layout = device.createBindGroupLayout({ entries: [viewEntry] });
    this.overLayout = device.createBindGroupLayout({
      entries: [
        viewEntry,
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    this.over = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.overLayout] }),
      vertex,
      fragment: {
        module,
        entryPoint: 'swing_over',
        targets: [{ format: gpu.format, blend: { color: blend, alpha: blend } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.light = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex,
      fragment: { module, entryPoint: 'swingLight', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list' },
      depthStencil: LIGHT_DEPTH,
    });
    this.view = device.createBuffer({ size: 64, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.view } }] });
  }

  /** The arcs the next frame draws, their vertices measured from the eye (`AttackFeel.arcsMesh`'s origin). */
  set(vertices: Float32Array): void {
    this.count = vertices.length / SWING_FLOATS;
    if (this.count === 0) return;
    if (!this.buffer || this.buffer.size < vertices.byteLength) {
      this.buffer?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(vertices.byteLength)));
      this.buffer = this.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    this.device.queue.writeBuffer(this.buffer, 0, vertices);
  }

  /** The arcs over a finished single-sampled picture `target`, hidden where `depth` (the scene's depth, one float a
   *  pixel) stands nearer. */
  drawOver(encoder: GPUCommandEncoder, target: GPUTextureView, depth: GPUTexture, fromEye: Float32Array): void {
    if (!this.buffer || this.count === 0) return;
    if (this.overGroup?.depth !== depth) {
      const group = this.device.createBindGroup({
        layout: this.overLayout,
        entries: [
          { binding: 0, resource: { buffer: this.view } },
          { binding: 1, resource: depth.createView() },
        ],
      });
      this.overGroup = { depth, group };
    }
    this.device.queue.writeBuffer(this.view, 0, fromEye);
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.over);
    pass.setBindGroup(0, this.overGroup.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.count);
    pass.end();
  }

  /** The arcs' light, into the light layer's pass (`LightLayer.encode`). */
  drawLight(pass: GPURenderPassEncoder, fromEye: Float32Array): void {
    if (!this.buffer || this.count === 0) return;
    this.device.queue.writeBuffer(this.view, 0, fromEye);
    pass.setPipeline(this.light);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.count);
  }
}
