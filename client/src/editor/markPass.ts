// The editor's marks over its views (the overlays' lines, fills and dots, `strokes.ts`), drawn by the GPU over the
// view and under the interface: each segment a capsule whose edge is smoothed across a pixel, cut square where a
// line's end is, each fill a fan of triangles. Each ink is painted once where its pieces overlap, as a page paints a
// path, so a translucent line is never darker at its joints: the stencil holds which ink last painted a pixel. Its
// wholly covered pixels are painted before its smoothed edge, so one piece's soft edge never keeps the next piece
// from a pixel it covers wholly.
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { CUT, type Ink, inkVertices, VERTEX_FLOATS } from './strokes.ts';

export const MARK_SHADER = /* wgsl */ `
struct View { size: vec2f, spare: vec2f }
@group(0) @binding(0) var<uniform> view: View;

struct Out {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) ends: vec4f,
  @location(1) @interpolate(flat) shape: vec2f,
  @location(2) @interpolate(flat) colour: vec4f,
}

@vertex
fn vertex_main(@location(0) at: vec2f, @location(1) ends: vec4f, @location(2) shape: vec2f,
               @location(3) colour: vec4f) -> Out {
  var out: Out;
  out.position = vec4f(at.x / view.size.x * 2.0 - 1.0, 1.0 - at.y / view.size.y * 2.0, 0.0, 1.0);
  out.ends = ends;
  out.shape = shape;
  out.colour = colour;
  return out;
}

/** How much of the pixel the piece covers, 0 to 1. */
fn cover_of(in: Out) -> f32 {
  var cover = 1.0;
  let half = in.shape.x;
  let cut = u32(in.shape.y);
  let p = in.position.xy;
  if ((cut & ${CUT.ring}u) != 0u) {
    // A ring's edge: ends holds its middle and its radius.
    cover = clamp(half + 0.5 - abs(distance(p, in.ends.xy) - in.ends.z), 0.0, 1.0);
  } else if (half >= 0.0) {
    let a = in.ends.xy;
    let ab = in.ends.zw - a;
    let span = length(ab);
    var along = 0.0;
    var direction = vec2f(1.0, 0.0);
    if (span > 0.0) {
      direction = ab / span;
      along = dot(p - a, direction);
    }
    let nearest = a + direction * clamp(along, 0.0, span);
    cover = clamp(half + 0.5 - distance(p, nearest), 0.0, 1.0);
    if ((cut & ${CUT.start}u) != 0u) { cover *= clamp(along + 0.5, 0.0, 1.0); }
    if ((cut & ${CUT.end}u) != 0u) { cover *= clamp(span - along + 0.5, 0.0, 1.0); }
  }
  return cover;
}

fn painted(colour: vec4f, cover: f32) -> vec4f {
  let alpha = colour.a * cover;
  return vec4f(colour.rgb * alpha, alpha);
}

/** The pixels an ink covers wholly, painted first. */
@fragment
fn fragment_solid(in: Out) -> @location(0) vec4f {
  let cover = cover_of(in);
  if (cover < 0.999) { discard; }
  return painted(in.colour, cover);
}

/** Its smoothed edge after, where no piece of it covered the pixel wholly. */
@fragment
fn fragment_edge(in: Out) -> @location(0) vec4f {
  let cover = cover_of(in);
  if (cover <= 0.0 || cover >= 0.999) { discard; }
  return painted(in.colour, cover);
}
`;

/** Inks a pass holds before the stencil is cleared: one stencil value each. */
const INKS_A_PASS = 255;

export class MarkPass {
  private readonly gpu: Gpu;
  /** The wholly covered pixels' pipeline, then the smoothed edge's. */
  private readonly pipelines: readonly [GPURenderPipeline, GPURenderPipeline];
  private readonly view: GPUBuffer;
  private readonly binding: GPUBindGroup;
  private vertices: GPUBuffer | null = null;
  private stencil: GPUTexture | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device, format } = gpu;
    const module = device.createShaderModule({ code: MARK_SHADER });
    const attribute = (shaderLocation: number, offset: number, size: 2 | 4) => ({
      shaderLocation,
      offset: offset * 4,
      format: size === 2 ? ('float32x2' as const) : ('float32x4' as const),
    });
    const once: GPUStencilFaceState = { compare: 'not-equal', passOp: 'replace' };
    const bindings = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: { type: 'uniform' } }],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bindings] });
    const pipeline = (entryPoint: string) =>
      device.createRenderPipeline({
        layout,
        vertex: {
          module,
          entryPoint: 'vertex_main',
          buffers: [
            {
              arrayStride: VERTEX_FLOATS * 4,
              attributes: [attribute(0, 0, 2), attribute(1, 2, 4), attribute(2, 6, 2), attribute(3, 8, 4)],
            },
          ],
        },
        fragment: {
          module,
          entryPoint,
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'stencil8', stencilFront: once, stencilBack: once },
      });
    this.pipelines = [pipeline('fragment_solid'), pipeline('fragment_edge')];
    this.view = device.createBuffer({ size: 16, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.binding = device.createBindGroup({
      layout: bindings,
      entries: [{ binding: 0, resource: { buffer: this.view } }],
    });
  }

  /** Draws `inks` over what `target` holds, `width` by `height` device pixels, `scale` device pixels a CSS pixel, the
   *  view `left` CSS pixels in from the target's edge. */
  draw(
    target: GPUTextureView,
    inks: readonly Ink[],
    size: { width: number; height: number; scale: number; left: number },
  ) {
    if (inks.length === 0) return;
    const { device } = this.gpu;
    const { floats, items } = inkVertices(inks, size.scale, size.left);
    if (items.length === 0) return;
    if (!this.vertices || this.vertices.size < floats.byteLength) {
      this.vertices?.destroy();
      this.vertices = device.createBuffer({
        size: Math.max(floats.byteLength * 2, 64 * 1024),
        usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
      });
    }
    const stencil = this.stencilOf(size.width, size.height);
    device.queue.writeBuffer(this.vertices, 0, floats);
    device.queue.writeBuffer(this.view, 0, new Float32Array([size.width, size.height, 0, 0]));
    const encoder = device.createCommandEncoder();
    for (let start = 0; start < items.length; start += INKS_A_PASS) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: {
          view: stencil.createView(),
          stencilClearValue: 0,
          stencilLoadOp: 'clear',
          stencilStoreOp: 'discard',
        },
      });
      pass.setBindGroup(0, this.binding);
      pass.setVertexBuffer(0, this.vertices);
      items.slice(start, start + INKS_A_PASS).forEach(({ first, count }, index) => {
        pass.setStencilReference(index + 1);
        for (const pipeline of this.pipelines) {
          pass.setPipeline(pipeline);
          pass.draw(count, 1, first);
        }
      });
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }

  private stencilOf(width: number, height: number): GPUTexture {
    if (this.stencil?.width !== width || this.stencil.height !== height) {
      this.stencil?.destroy();
      this.stencil = this.gpu.device.createTexture({
        size: [width, height],
        format: 'stencil8',
        usage: TEXTURE_USAGE.renderAttachment,
      });
    }
    return this.stencil;
  }
}
