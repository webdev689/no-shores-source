// The fight's marks on the GPU, for the Test Ground's scene and the game's alike. Solid marks write depth and are
// drawn with the figures; the see-through ones are blended after them, far to near, tested against what is drawn.
// The game draws its see-through marks after the water, testing them against the scene's depth by hand, so the water
// laid over the land near a coast never covers a mark that stands above it; and a lit keeper's mark after them with no
// depth, so no wall hides it and it is seen from everywhere (`setAbove`, `drawAbove`).
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE } from '../gpu.ts';
import { LIGHT_DEPTH, LIGHT_TARGET, LIGHT_WGSL } from './lightLayer.ts';
import { DITHER_M, MARK_FLOATS } from './marks.ts';
import { MarkOrder } from './markOrder.ts';

type Point = readonly [number, number, number];

/** The ground's dither repeats every four cells, so the eye's place in the world is carried wrapped to it. */
const DITHER_PERIOD_M = 4 * DITHER_M;
/** A solid mark is written this much nearer than it lies (depth units, and by its slope), so a see-through mark in
 *  its own plane (a glow round its core) stays behind it. */
const SOLID_BIAS = { depthBias: 16, depthBiasSlopeScale: 1 } as const;

export const MARK_WGSL = /* wgsl */ `
struct View { from_origin: mat4x4f, origin: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Out { @builtin(position) position: vec4f, @location(0) colour: vec4f, @location(1) world: vec2f }

const ORDER = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const CELL = ${DITHER_M};

@vertex fn mark_vertex(@location(0) position: vec3f, @location(1) colour: vec4f) -> Out {
  var out: Out;
  out.position = view.from_origin * vec4f(position, 1.0);
  out.colour = colour;
  out.world = position.xy + view.origin.xy;
  return out;
}

// An opacity above 1 is a mark on the ground dithered whole: 'share' of its cells kept in a 4 by 4 ordered pattern,
// each cell a whole square of the ground.
fn kept(world: vec2f, share: f32) -> bool {
  let cell = vec2u(vec2i(floor(world / CELL)) & vec2i(3));
  return share * 16.0 > ORDER[cell.y * 4u + cell.x] + 0.5;
}

@fragment fn solid_fragment(in: Out) -> @location(0) vec4f {
  if (in.colour.a > 1.0 && !kept(in.world, in.colour.a - 1.0)) { discard; }
  return vec4f(in.colour.rgb, 1.0);
}

// An opacity below none marks light added to what stands behind (a drop's line): its colour, covering nothing.
fn see_through(colour: vec4f) -> vec4f {
  if (colour.a < 0.0) { return vec4f(colour.rgb, 0.0); }
  return vec4f(colour.rgb * colour.a, colour.a);
}

@fragment fn clear_fragment(in: Out) -> @location(0) vec4f {
  return see_through(in.colour);
}

@group(0) @binding(1) var depths: texture_2d<f32>;

// Over the finished picture: hidden where the scene's depth (reversed, nearer is more) stands nearer.
@fragment fn over_fragment(in: Out) -> @location(0) vec4f {
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  return see_through(in.colour);
}

${LIGHT_WGSL}
// Its light: only what stands in the air gives any. A mark on the ground (a dither's code) and light already added
// (a drop's line, a muzzle's pool) give none.
@fragment fn light_fragment(in: Out) -> @location(0) vec4f {
  if (in.colour.a > 1.0 || in.colour.a < 0.0) { discard; }
  return light_of(in.colour.rgb, in.colour.a);
}
`;

const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: MARK_FLOATS * 4,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x4' },
  ],
};
const BLENDED = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;

/** Where `origin` (world metres) lies in the ground's dither, wrapped to its period. */
export function ditherOrigin(origin: Point): [number, number, number, number] {
  const wrap = (value: number) => ((value % DITHER_PERIOD_M) + DITHER_PERIOD_M) % DITHER_PERIOD_M;
  return [wrap(origin[0]), wrap(origin[1]), 0, 0];
}

/** The fight's marks drawn into a scene `samples` deep: each frame `set`, then drawn solid and see-through. */
export class MarkDraw {
  private readonly gpu: Gpu;
  private readonly module: GPUShaderModule;
  private readonly solid: GPURenderPipeline;
  private readonly clear: GPURenderPipeline;
  private readonly light: GPURenderPipeline;
  private over: {
    layout: GPUBindGroupLayout;
    pipeline: GPURenderPipeline;
    depth: GPUTexture | null;
    group: GPUBindGroup | null;
  } | null = null;
  private above: GPURenderPipeline | null = null;
  private readonly viewLayout: GPUBindGroupLayout;
  private readonly view: GPUBuffer;
  private readonly group: GPUBindGroup;
  private readonly order = new MarkOrder();
  private buffer: GPUBuffer | null = null;
  private counts = { solid: 0, clear: 0 };
  private aboveBuffer: GPUBuffer | null = null;
  private aboveCount = 0;
  /** The marks over everything as last laid, kept from frame to frame and grown to the most yet. */
  private aboveLaid = new Float32Array(0);
  private origin: [number, number, number, number] = [0, 0, 0, 0];
  private readonly values = new Float32Array(20);

  constructor(gpu: Gpu, samples: number) {
    this.gpu = gpu;
    const { device } = gpu;
    this.module = device.createShaderModule({ code: MARK_WGSL });
    const layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    this.viewLayout = layout;
    const pipeline = (fragment: string, depthWrite: boolean) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module: this.module, entryPoint: 'mark_vertex', buffers: [VERTEX_LAYOUT] },
        fragment: {
          module: this.module,
          entryPoint: fragment,
          targets: [{ format: gpu.format, blend: { color: BLENDED, alpha: BLENDED } }],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: {
          format: REVERSED_DEPTH.format,
          depthWriteEnabled: depthWrite,
          depthCompare: REVERSED_DEPTH.compare,
          ...(depthWrite ? SOLID_BIAS : {}),
        },
        multisample: { count: samples },
      });
    this.solid = pipeline('solid_fragment', true);
    this.clear = pipeline('clear_fragment', false);
    this.light = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: this.module, entryPoint: 'mark_vertex', buffers: [VERTEX_LAYOUT] },
      fragment: { module: this.module, entryPoint: 'light_fragment', targets: [LIGHT_TARGET] },
      primitive: { topology: 'triangle-list' },
      depthStencil: LIGHT_DEPTH,
    });
    this.view = device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.view } }] });
  }

  /** The marks the next frame draws, measured from a point `origin` in the world (where a mark at 0 lies), seen from
   *  an eye at `eye` measured alike. */
  set(vertices: ArrayLike<number>, eye: Point, origin: Point = [0, 0, 0]): void {
    const { laid, solid, clear } = this.order.lay(vertices, eye);
    this.counts = { solid, clear };
    this.origin = ditherOrigin(origin);
    if (laid.length === 0) return;
    this.buffer = this.grown(this.buffer, laid.byteLength);
    this.gpu.device.queue.writeBuffer(this.buffer, 0, laid);
  }

  /** The marks the next frame draws over everything (`drawAbove`), measured from the eye, in the order given. */
  setAbove(vertices: ArrayLike<number>): void {
    this.aboveCount = Math.floor(vertices.length / MARK_FLOATS);
    if (this.aboveCount === 0) return;
    const count = this.aboveCount * MARK_FLOATS;
    if (this.aboveLaid.length < count) this.aboveLaid = new Float32Array(2 ** Math.ceil(Math.log2(count)));
    for (let value = 0; value < count; value++) this.aboveLaid[value] = vertices[value] ?? 0;
    this.aboveBuffer = this.grown(this.aboveBuffer, count * 4);
    this.gpu.device.queue.writeBuffer(this.aboveBuffer, 0, this.aboveLaid, 0, count);
  }

  /** `buffer`, or a new one in its place when it holds fewer than `bytes`: a power of two, 4 KB at least. */
  private grown(buffer: GPUBuffer | null, bytes: number): GPUBuffer {
    if (buffer && buffer.size >= bytes) return buffer;
    buffer?.destroy();
    const size = Math.max(4096, 2 ** Math.ceil(Math.log2(bytes)));
    return this.gpu.device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
  }

  /** The solid marks, into a pass with the scene's depth, `matrix` taking the marks' points to clip space. */
  drawSolid(pass: GPURenderPassEncoder, matrix: Float32Array): void {
    if (!this.buffer || this.counts.solid === 0) return;
    this.writeView(matrix);
    pass.setPipeline(this.solid);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.counts.solid);
  }

  /** The see-through marks, far to near, into a pass with the scene's depth. */
  drawClear(pass: GPURenderPassEncoder, matrix: Float32Array): void {
    if (!this.buffer || this.counts.clear === 0) return;
    this.writeView(matrix);
    pass.setPipeline(this.clear);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.counts.clear, 1, this.counts.solid);
  }

  /** The see-through marks over a finished single-sampled picture `target`, hidden where `depth` (the scene's depth,
   *  one float a pixel) stands nearer. */
  drawClearOver(encoder: GPUCommandEncoder, target: GPUTextureView, depth: GPUTexture, matrix: Float32Array): void {
    if (!this.buffer || this.counts.clear === 0) return;
    const over = this.overOf(depth);
    this.writeView(matrix);
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(over.pipeline);
    pass.setBindGroup(0, over.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.counts.clear, 1, this.counts.solid);
    pass.end();
  }

  /** The marks `setAbove` gave over a finished single-sampled picture `target`, in the order given and hidden by
   *  nothing: a lit keeper's mark, seen from everywhere (`litMarksSeen` lays them far to near, so a nearer one stands
   *  over it). */
  drawAbove(encoder: GPUCommandEncoder, target: GPUTextureView, matrix: Float32Array): void {
    const [buffer, count] = [this.aboveBuffer, this.aboveCount];
    if (!buffer || count === 0) return;
    this.above ??= this.gpu.device.createRenderPipeline({
      layout: this.gpu.device.createPipelineLayout({ bindGroupLayouts: [this.viewLayout] }),
      vertex: { module: this.module, entryPoint: 'mark_vertex', buffers: [VERTEX_LAYOUT] },
      fragment: {
        module: this.module,
        entryPoint: 'clear_fragment',
        targets: [{ format: this.gpu.format, blend: { color: BLENDED, alpha: BLENDED } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.writeView(matrix);
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }] });
    pass.setPipeline(this.above);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, buffer);
    pass.draw(count);
    pass.end();
  }

  /** Every mark's light, into the light layer's pass (`LightLayer.encode`). */
  drawLight(pass: GPURenderPassEncoder, matrix: Float32Array): void {
    if (!this.buffer || this.counts.solid + this.counts.clear === 0) return;
    this.writeView(matrix);
    pass.setPipeline(this.light);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(this.counts.solid + this.counts.clear);
  }

  private writeView(matrix: Float32Array): void {
    this.values.set(matrix.subarray(0, 16));
    this.values.set(this.origin, 16);
    this.gpu.device.queue.writeBuffer(this.view, 0, this.values);
  }

  /** The over-the-picture pipeline, made the first time, and its bind group for `depth`, made again as it changes. */
  private overOf(depth: GPUTexture): { pipeline: GPURenderPipeline; group: GPUBindGroup } {
    const { device, format } = this.gpu;
    if (!this.over) {
      const layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} },
          { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
        ],
      });
      const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { module: this.module, entryPoint: 'mark_vertex', buffers: [VERTEX_LAYOUT] },
        fragment: {
          module: this.module,
          entryPoint: 'over_fragment',
          targets: [{ format, blend: { color: BLENDED, alpha: BLENDED } }],
        },
        primitive: { topology: 'triangle-list' },
      });
      this.over = { layout, pipeline, depth: null, group: null };
    }
    if (this.over.depth !== depth || !this.over.group) {
      this.over.depth = depth;
      this.over.group = device.createBindGroup({
        layout: this.over.layout,
        entries: [
          { binding: 0, resource: { buffer: this.view } },
          { binding: 1, resource: depth.createView() },
        ],
      });
    }
    return { pipeline: this.over.pipeline, group: this.over.group };
  }

  destroy(): void {
    this.buffer?.destroy();
    this.aboveBuffer?.destroy();
    this.view.destroy();
  }
}
