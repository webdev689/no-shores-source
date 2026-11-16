import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { PX_PER_M } from '../player/figures.ts';
import type { Card, CardAt, CardMaker } from '../player/cards.ts';
import { SAMPLES } from '../water/waterView.ts';

const VIEW_BYTES = 80;
const CARD_BYTES = 48;

/** A figure's card stands upright on its feet, turned to the eye about its upright, measured from the eye as the
 *  land is; the forge's pixels are drawn texel for texel and anything clear is cut away. */
const SHADER = /* wgsl */ `
struct View { from_eye: mat4x4f, right: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Card { feet: vec4f, size: vec4f, root: vec4f }
@group(1) @binding(0) var<uniform> card: Card;
@group(1) @binding(1) var picture: texture_2d<f32>;

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn card_vertex(@builtin(vertex_index) index: u32) -> Out {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let corner = corners[index];
  let across = corner.x * card.size.x - card.root.x;
  let up = card.root.y - corner.y * card.size.y;
  let offset = vec3f(card.feet.xy + view.right.xy * across, card.feet.z + up);
  var out: Out;
  out.position = view.from_eye * vec4f(offset, 1.0);
  out.corner = corner;
  return out;
}

// A figure's contact shade: a soft dark disc on the ground at its feet, leaning a little the way the sun throws
// shadows (SHARED_WGSL's SUN), so a card that casts no shadow still stands on the ground and not over it.
const SUN = vec3f(-0.5417, 0.5417, 0.6428);
const SHADE_SEGMENTS = 12u;
struct Shade { @builtin(position) position: vec4f, @location(0) rim: f32 }

@vertex fn shade_vertex(@builtin(vertex_index) index: u32) -> Shade {
  let corner = index % 3u;
  let angle = f32(index / 3u + select(0u, 1u, corner == 2u)) / f32(SHADE_SEGMENTS) * 6.2831853;
  let rim = select(1.0, 0.0, corner == 0u);
  let lean = -SUN.xy / SUN.z * card.size.y * 0.25;
  let radius = vec2f(0.45, 0.45) * rim;
  let offset = vec3f(card.feet.xy + lean * 0.5 * rim + vec2f(cos(angle), sin(angle)) * radius, card.feet.z + 0.03);
  var out: Shade;
  out.position = view.from_eye * vec4f(offset, 1.0);
  out.rim = rim;
  return out;
}

@fragment fn shade_fragment(shade: Shade) -> @location(0) vec4f {
  let soft = 1.0 - shade.rim * shade.rim;
  return vec4f(0.0, 0.0, 0.0, 0.42 * soft * soft);
}

@fragment fn card_fragment(in: Out) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(picture));
  var at = in.corner;
  if (card.feet.w > 0.5) { at.x = 1.0 - at.x; }
  let texel = textureLoad(picture, vec2i(min(at * size, size - 1.0)), 0);
  if (texel.a < 0.5) { discard; }
  return vec4f(texel.rgb, 1.0);
}
`;

/** Draws the forge's figures into the scene's pass, after the land and before the water. */
export class FigureView implements CardMaker {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly shade: GPURenderPipeline;
  private readonly cardLayout: GPUBindGroupLayout;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const viewLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex, buffer: {} }],
    });
    this.cardLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: {} },
      ],
    });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, this.cardLayout] }),
      vertex: { module, entryPoint: 'card_vertex' },
      fragment: { module, entryPoint: 'card_fragment', targets: [{ format: gpu.format }] },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: true, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    // The shade only darkens what is under it, as the plants' contact shades do.
    const darken: GPUBlendState = {
      color: { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.shade = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, this.cardLayout] }),
      vertex: { module, entryPoint: 'shade_vertex' },
      fragment: { module, entryPoint: 'shade_fragment', targets: [{ format: gpu.format, blend: darken }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
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

  /** A composed picture as a texture the figures can be drawn with. */
  card(pixels: Uint8Array, width: number, height: number, root: readonly [number, number]): Card {
    const texture = this.gpu.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    return { texture, width, height, root };
  }

  private slot(index: number, texture: GPUTexture): { buffer: GPUBuffer; group: GPUBindGroup } {
    let slot = this.slots[index];
    if (!slot) {
      const buffer = this.gpu.device.createBuffer({
        size: CARD_BYTES,
        usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
      });
      slot = { buffer, texture: null, group: null };
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

  /** Draws the figures from an eye at `eye` (world metres), with the camera's view-projection measured from the eye
   *  and its yaw (radians clockwise from north). */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
  ): void {
    if (figures.length === 0) return;
    const right = [Math.cos(yaw), Math.sin(yaw)];
    const values = new Float32Array(VIEW_BYTES / 4);
    values.set(fromEye);
    values.set([right[0] ?? 1, right[1] ?? 0, 0, 0], 16);
    this.gpu.device.queue.writeBuffer(this.viewBuffer, 0, values);
    const groups = figures.map(({ card, x, y, z, flip }, index) => {
      const { buffer, group } = this.slot(index, card.texture);
      const rootX = (flip ? card.width - card.root[0] : card.root[0]) / PX_PER_M;
      const cardValues = new Float32Array([
        ...[x - eye[0], y - eye[1], z - eye[2], flip ? 1 : 0],
        ...[card.width / PX_PER_M, card.height / PX_PER_M, 0, 0],
        ...[rootX, card.root[1] / PX_PER_M, 0, 0],
      ]);
      this.gpu.device.queue.writeBuffer(buffer, 0, cardValues);
      return group;
    });
    pass.setBindGroup(0, this.viewGroup);
    pass.setPipeline(this.shade);
    for (const group of groups) {
      pass.setBindGroup(1, group);
      pass.draw(36);
    }
    pass.setPipeline(this.pipeline);
    for (const group of groups) {
      pass.setBindGroup(1, group);
      pass.draw(6);
    }
  }
}
