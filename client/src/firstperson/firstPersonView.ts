import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';

/** A picture on the screen: its texture and its rectangle on the 320 by 200 design screen, mirrored or not. */
export interface ScreenQuad {
  readonly texture: GPUTexture;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly flip: boolean;
}

const QUAD_BYTES = 32;

const SHADER = /* wgsl */ `
struct Quad { corners: vec4f, flip: vec4f }
@group(0) @binding(0) var<uniform> quad: Quad;
@group(0) @binding(1) var picture: texture_2d<f32>;

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn quadVertex(@builtin(vertex_index) index: u32) -> Out {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let corner = corners[index];
  var out: Out;
  out.position = vec4f(mix(quad.corners.xy, quad.corners.zw, corner), 0.0, 1.0);
  out.corner = corner;
  return out;
}

@fragment fn quadFragment(in: Out) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(picture));
  var at = in.corner;
  if (quad.flip.x > 0.5) { at.x = 1.0 - at.x; }
  let texel = textureLoad(picture, vec2i(min(at * size, size - 1.0)), 0);
  if (texel.a < 0.5) { discard; }
  return vec4f(texel.rgb, 1.0);
}
`;

/** The first person's pictures drawn over the scene: each a flat quad on the screen, texel for texel, its clear
 *  texels cut out, over whatever the scene drew there. */
export class FirstPersonView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module, entryPoint: 'quadVertex' },
      fragment: { module, entryPoint: 'quadFragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  /** A composed picture as a texture the view can draw. */
  texture(pixels: Uint8Array, width: number, height: number): GPUTexture {
    const texture = this.gpu.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    return texture;
  }

  /** The uniform slot of the `index`th quad drawn, its bind group remade only for a new texture. */
  private slot(index: number, texture: GPUTexture): { buffer: GPUBuffer; group: GPUBindGroup } {
    let slot = this.slots[index];
    if (!slot) {
      const usage = BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination;
      slot = { buffer: this.gpu.device.createBuffer({ size: QUAD_BYTES, usage }), texture: null, group: null };
      this.slots[index] = slot;
    }
    if (slot.texture !== texture || !slot.group) {
      slot.texture = texture;
      slot.group = this.gpu.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: slot.buffer } },
          { binding: 1, resource: texture.createView() },
        ],
      });
    }
    return { buffer: slot.buffer, group: slot.group };
  }

  /** Forgets a texture's bind group, before the texture is let go. */
  forget(texture: GPUTexture): void {
    for (const slot of this.slots) {
      if (slot.texture === texture) [slot.texture, slot.group] = [null, null];
    }
  }

  /** Draws `quads` in order into `colourView`, `width` by `height` pixels, keeping what is drawn there already. */
  draw(
    encoder: GPUCommandEncoder,
    colourView: GPUTextureView,
    width: number,
    height: number,
    quads: readonly ScreenQuad[],
  ): void {
    if (!quads.length) return;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colourView, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.pipeline);
    // Edges on whole canvas pixels keep every texel the same size. The design screen's top left is clip space's
    // (-1, 1), its bottom right (1, -1).
    const clipX = (designX: number) => (Math.round((designX * width) / DESIGN_WIDTH) / width) * 2 - 1;
    const clipY = (designY: number) => 1 - (Math.round((designY * height) / DESIGN_HEIGHT) / height) * 2;
    quads.forEach((quad, index) => {
      const { buffer, group } = this.slot(index, quad.texture);
      const values = new Float32Array([
        clipX(quad.x),
        clipY(quad.y),
        clipX(quad.x + quad.width),
        clipY(quad.y + quad.height),
        quad.flip ? 1 : 0,
        0,
        0,
        0,
      ]);
      this.gpu.device.queue.writeBuffer(buffer, 0, values);
      pass.setBindGroup(0, group);
      pass.draw(6);
    });
    pass.end();
  }
}
