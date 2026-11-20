import { GLOW_PAD, GLOW_WGSL } from '../elementGlow.ts';
import { BUFFER_USAGE, SHADER_STAGE, type Gpu } from '../gpu.ts';
import type { Card } from './cards.ts';

/** A glowing card to draw: its card, where its feet stand in the view's own space, whether it is mirrored, how
 *  many metres a pixel of its picture is, and how hard its glow surges (1 at rest unless said). */
export interface GlowCardAt {
  readonly card: Card;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly flip: boolean;
  readonly metres: number;
  readonly surge?: number;
}

/** A glowing card's quad: its picture grown by GLOW_PAD pixels a side, in metres, and its feet on it. */
export function glowQuad(
  card: Card,
  metres: number,
): { width: number; height: number; root: readonly [number, number] } {
  return {
    width: (card.width + 2 * GLOW_PAD) * metres,
    height: (card.height + 2 * GLOW_PAD) * metres,
    root: [(card.root[0] + GLOW_PAD) * metres, (card.root[1] + GLOW_PAD) * metres],
  };
}

const VIEW_BYTES = 80;
const CARD_BYTES = 48;
/** The glow's clock wraps here, every rate in its shader whole over it. */
const CLOCK_WRAP_S = 240;

/** The outline round a card's weapon: the card's quad grown by the pad, upright and turned along the view's right as
 *  the cards are, each texel of its field lit by `glow_colour` at the picture's own pixel. */
export const SHADER = /* wgsl */ `
${GLOW_WGSL}

struct View { view_projection: mat4x4f, right: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Card { feet: vec4f, size: vec4f, root: vec4f }
@group(1) @binding(0) var<uniform> card: Card;
@group(1) @binding(1) var glow_field: texture_2d<f32>;

const CORNERS = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn glow_vertex(@builtin(vertex_index) index: u32) -> Out {
  let corner = CORNERS[index];
  let across = corner.x * card.size.x - card.root.x;
  let place = vec3f(card.feet.xy + view.right.xy * across, card.feet.z + card.root.y - corner.y * card.size.y);
  var out: Out;
  out.position = view.view_projection * vec4f(place, 1.0);
  // A hair nearer than its card (depth is reversed), so the light on the weapon's own edge is never lost to it.
  out.position.z = out.position.z * 1.0001;
  out.corner = corner;
  return out;
}

@fragment fn glow_fragment(in: Out) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(glow_field));
  var at = in.corner;
  if (card.feet.w > 0.5) { at.x = 1.0 - at.x; }
  let texel = min(floor(at * size), size - 1.0);
  let field = textureLoad(glow_field, vec2i(texel), 0);
  let colour = glow_colour(u32(card.size.z), field, texel - floor(size / 2.0), view.right.z, max(card.size.w, 1.0));
  if (colour.a <= 0.0) { discard; }
  return colour;
}
`;

/** Draws the outlines of the cards that glow, after the cards, blended over them and tested against their depth. */
export class GlowCards {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly cardLayout: GPUBindGroupLayout;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];

  constructor(gpu: Gpu, colourFormat: GPUTextureFormat, depthFormat: GPUTextureFormat, samples = 1) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const viewLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: both, buffer: {} }] });
    this.cardLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: both, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const premultiplied = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } as const;
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, this.cardLayout] }),
      vertex: { module, entryPoint: 'glow_vertex' },
      fragment: {
        module,
        entryPoint: 'glow_fragment',
        targets: [{ format: colourFormat, blend: { color: premultiplied, alpha: premultiplied } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'greater-equal' },
      multisample: { count: samples },
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

  /** The uniform slot of the `index`th outline drawn, its bind group remade only for a new field. */
  private slot(index: number, texture: GPUTexture): { buffer: GPUBuffer; group: GPUBindGroup } {
    let slot = this.slots[index];
    if (!slot) {
      const usage = BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination;
      slot = { buffer: this.gpu.device.createBuffer({ size: CARD_BYTES, usage }), texture: null, group: null };
      this.slots[index] = slot;
    }
    if (slot.texture !== texture || !slot.group) {
      slot.texture = texture;
      slot.group = this.gpu.device.createBindGroup({
        layout: this.cardLayout,
        entries: [
          { binding: 0, resource: { buffer: slot.buffer } },
          { binding: 1, resource: texture.createView() },
        ],
      });
    }
    return { buffer: slot.buffer, group: slot.group };
  }

  /** Draws each glowing card's outline into `pass`, seen through `viewProjection` with cards turned along `right` (east
   *  and south), at `time` seconds on the page's clock. */
  draw(
    pass: GPURenderPassEncoder,
    viewProjection: Float32Array,
    right: readonly [number, number],
    time: number,
    cards: readonly GlowCardAt[],
  ): void {
    const glowing = cards.filter((placed) => placed.card.glow);
    if (glowing.length === 0) return;
    const { queue } = this.gpu.device;
    const view = new Float32Array(VIEW_BYTES / 4);
    view.set(viewProjection);
    view.set([right[0], right[1], time % CLOCK_WRAP_S, 0], 16);
    queue.writeBuffer(this.viewBuffer, 0, view);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.viewGroup);
    glowing.forEach(({ card, x, y, z, flip, metres, surge = 1 }, index) => {
      if (!card.glow) return;
      const quad = glowQuad(card, metres);
      const rootX = flip ? quad.width - quad.root[0] : quad.root[0];
      const { buffer, group } = this.slot(index, card.glow.texture);
      const values = [x, y, z, flip ? 1 : 0, quad.width, quad.height, card.glow.look, surge, rootX, quad.root[1], 0, 0];
      queue.writeBuffer(buffer, 0, new Float32Array(values));
      pass.setBindGroup(1, group);
      pass.draw(6);
    });
  }
}
