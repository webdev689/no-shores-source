import { GLOW_PAD, GLOW_WGSL, type GlowField, type GlowLook } from '../elementGlow.ts';
import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';

/** A picture on the screen: its texture and its rectangle on the 320 by 200 design screen, mirrored or not. `part`
 *  draws only that share of the picture across (one frame of a strip); `reach` runs the rectangle that many times the
 *  picture's height down it, its last row carried down past its foot. A weapon that glows carries its outline's field
 *  and element (none for a plain one taking a blow's rim), how hard it surges (1 at rest), whether a blow's white rim
 *  lights it, and the seconds since a blow it landed threw its element off it (none unless said); it is drawn whole. */
export interface ScreenQuad {
  readonly texture: GPUTexture;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly flip: boolean;
  readonly part?: readonly [left: number, right: number];
  readonly reach?: number;
  readonly glow?: {
    readonly texture: GPUTexture;
    readonly look: GlowLook;
    readonly surge?: number;
    readonly rim?: boolean;
    readonly burst?: number | null;
  };
}

const QUAD_BYTES = 48;
const GLOW_BYTES = 48;
/** The glow's clock wraps here, every rate in its shader whole over it. */
const CLOCK_WRAP_S = 240;

/** A weapon's outline: its quad grown by the pad, each texel of its field lit by `glow_colour` at the picture's own
 *  pixel. */
export const GLOW_SHADER = /* wgsl */ `
${GLOW_WGSL}

// The corners in clip space; whether it is mirrored, its element and the glow's clock; its surge, whether a blow's rim
// lights it, and the seconds since a blow threw its element off it (below none for none).
struct Glow { corners: vec4f, drawn: vec4f, more: vec4f }
@group(0) @binding(0) var<uniform> glow: Glow;
@group(0) @binding(1) var glow_field: texture_2d<f32>;

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn glowVertex(@builtin(vertex_index) index: u32) -> Out {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let corner = corners[index];
  var out: Out;
  out.position = vec4f(mix(glow.corners.xy, glow.corners.zw, corner), 0.0, 1.0);
  out.corner = corner;
  return out;
}

@fragment fn glowFragment(in: Out) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(glow_field));
  var across = in.corner.x;
  if (glow.drawn.x > 0.5) { across = 1.0 - across; }
  let texel = glow_texel(vec2f(across, in.corner.y), size);
  let field = textureLoad(glow_field, vec2i(texel), 0);
  let look = u32(glow.drawn.y);
  let cell = texel - floor(size / 2.0);
  var colour = glow_colour(look, field, cell, glow.drawn.z, max(glow.more.x, 1.0));
  let burst = glow_burst(look, field, cell, glow.more.z);
  if (burst.a > colour.a) { colour = burst; }
  if (glow.more.y > 0.5) {
    let rim = glow_contact(field);
    if (rim.a > 0.0) { colour = rim; }
  }
  if (colour.a <= 0.0) { discard; }
  return colour;
}
`;

export const SHADER = /* wgsl */ `
// The corners in clip space; whether it is mirrored, the share of the picture across it draws, and how far down;
// and the light on it, against a clear afternoon's.
struct Quad { corners: vec4f, drawn: vec4f, light: vec4f }
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
  var across = in.corner.x;
  if (quad.drawn.x > 0.5) { across = 1.0 - across; }
  let at = vec2f(mix(quad.drawn.y, quad.drawn.z, across), min(in.corner.y * quad.drawn.w, 1.0));
  // Within the part's own last column, so a frame never shows its neighbour's edge.
  let last = vec2f(round(quad.drawn.z * size.x) - 1.0, size.y - 1.0);
  let texel = textureLoad(picture, vec2i(min(at * size, last)), 0);
  if (texel.a < 0.5) { discard; }
  return vec4f(texel.rgb * quad.light.rgb, 1.0);
}
`;

/** The first person's pictures drawn over the scene: each a flat quad on the screen, texel for texel, its clear
 *  texels cut out, over whatever the scene drew there. */
export class FirstPersonView {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly layout: GPUBindGroupLayout;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];
  /** The outlines' pipeline, made when a weapon first glows, and their slots. */
  private glowPipeline: GPURenderPipeline | null = null;
  private readonly glowSlots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];

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
    void device
      .createRenderPipelineAsync(this.glowMade())
      .then((pipeline) => (this.glowPipeline ??= pipeline))
      .catch(() => undefined);
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

  /** An outline's field as a texture its glow is drawn with. */
  glow(field: GlowField): GPUTexture {
    return this.texture(field.data, field.width, field.height);
  }

  /** The outlines' pipeline: blended premultiplied over what is drawn; made off the frame as the view is, so the first
   *  weapon to glow never waits on it, and at once should it not have come. */
  private glowing(): GPURenderPipeline {
    this.glowPipeline ??= this.gpu.device.createRenderPipeline(this.glowMade());
    return this.glowPipeline;
  }

  private glowMade(): GPURenderPipelineDescriptor {
    const module = this.gpu.device.createShaderModule({ code: GLOW_SHADER });
    const premultiplied = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    return {
      layout: this.gpu.device.createPipelineLayout({ bindGroupLayouts: [this.layout] }),
      vertex: { module, entryPoint: 'glowVertex' },
      fragment: {
        module,
        entryPoint: 'glowFragment',
        targets: [{ format: this.gpu.format, blend: { color: premultiplied, alpha: premultiplied } }],
      },
      primitive: { topology: 'triangle-list' },
    };
  }

  /** The uniform slot of the `index`th quad drawn (of `slots`, each `bytes` long), its bind group remade only for a new
   *  texture. */
  private slot(
    index: number,
    texture: GPUTexture,
    slots = this.slots,
    bytes = QUAD_BYTES,
  ): { buffer: GPUBuffer; group: GPUBindGroup } {
    let slot = slots[index];
    if (!slot) {
      const usage = BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination;
      slot = { buffer: this.gpu.device.createBuffer({ size: bytes, usage }), texture: null, group: null };
      slots[index] = slot;
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
    for (const slot of [...this.slots, ...this.glowSlots]) {
      if (slot.texture === texture) [slot.texture, slot.group] = [null, null];
    }
  }

  /** Draws `quads` in order into `colourView`, `width` by `height` pixels, keeping what is drawn there already, in
   *  `light` (a clear afternoon's is 1); a glowing one's outline straight after it, so a picture drawn later lies over
   *  it. */
  draw(
    encoder: GPUCommandEncoder,
    colourView: GPUTextureView,
    width: number,
    height: number,
    quads: readonly ScreenQuad[],
    light: readonly [number, number, number] = [1, 1, 1],
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
    let glows = 0;
    const time = (performance.now() / 1000) % CLOCK_WRAP_S;
    quads.forEach((quad, index) => {
      const { buffer, group } = this.slot(index, quad.texture);
      const values = new Float32Array([
        clipX(quad.x),
        clipY(quad.y),
        clipX(quad.x + quad.width),
        clipY(quad.y + quad.height),
        quad.flip ? 1 : 0,
        quad.part?.[0] ?? 0,
        quad.part?.[1] ?? 1,
        quad.reach ?? 1,
        ...light,
        1,
      ]);
      this.gpu.device.queue.writeBuffer(buffer, 0, values);
      pass.setBindGroup(0, group);
      pass.draw(6);
      if (!quad.glow) return;
      // The pad in design pixels: a texel of the picture is this much of the screen.
      const padX = (GLOW_PAD * quad.width) / quad.texture.width;
      const padY = (GLOW_PAD * quad.height) / quad.texture.height;
      const glow = this.slot(glows++, quad.glow.texture, this.glowSlots, GLOW_BYTES);
      const glowValues = new Float32Array([
        clipX(quad.x - padX),
        clipY(quad.y - padY),
        clipX(quad.x + quad.width + padX),
        clipY(quad.y + quad.height + padY),
        quad.flip ? 1 : 0,
        quad.glow.look,
        time,
        0,
        quad.glow.surge ?? 1,
        quad.glow.rim ? 1 : 0,
        quad.glow.burst ?? -1,
        0,
      ]);
      this.gpu.device.queue.writeBuffer(glow.buffer, 0, glowValues);
      pass.setPipeline(this.glowing());
      pass.setBindGroup(0, glow.group);
      pass.draw(6);
      pass.setPipeline(this.pipeline);
    });
    pass.end();
  }
}
