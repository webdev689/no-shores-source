import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { PX_PER_M } from '../player/figures.ts';
import type { Card, CardAt, CardMaker } from '../player/cards.ts';
import { NEAR, SHADOW_CAST_WGSL, SHADOW_WGSL, ShadowMap, shadowLayouts } from '../shadow.ts';
import { SAMPLES } from '../water/waterView.ts';

const VIEW_BYTES = 80;
const CARD_BYTES = 48;

/** A figure's card stands upright on its feet, measured from the eye as the land is; the forge's pixels are drawn
 *  texel for texel and anything clear is cut away. Shared by the figures' pass and their shadow's. */
const CARD = /* wgsl */ `
struct View { from_eye: mat4x4f, right: vec4f }
@group(0) @binding(0) var<uniform> view: View;
struct Card { feet: vec4f, size: vec4f, root: vec4f }
@group(2) @binding(0) var<uniform> card: Card;
@group(2) @binding(1) var picture: texture_2d<f32>;

// SHARED_WGSL's SUN (water/waterCommon.ts).
const SUN = vec3f(-0.5417, 0.5417, 0.6428);
const CORNERS = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));

// How far a corner (0 to 1 across, 0 to 1 down) stands across the card from its feet, metres.
fn across_of(corner: vec2f) -> f32 {
  return corner.x * card.size.x - card.root.x;
}

// A corner where it stands from the eye, the card's face turned along 'right'.
fn card_point(corner: vec2f, right: vec2f) -> vec3f {
  return vec3f(card.feet.xy + right * across_of(corner), card.feet.z + card.root.y - corner.y * card.size.y);
}

fn picture_at(corner: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(picture));
  var at = corner;
  if (card.feet.w > 0.5) { at.x = 1.0 - at.x; }
  return textureLoad(picture, vec2i(min(at * size, size - 1.0)), 0);
}
`;

/** The cards turned to the eye about their upright, lit through the sun's shadows, and their contact shades. */
const SHADER = /* wgsl */ `
${CARD}
${SHADOW_WGSL}

struct Out { @builtin(position) position: vec4f, @location(0) corner: vec2f, @location(1) from_eye: vec3f }

@vertex fn card_vertex(@builtin(vertex_index) index: u32) -> Out {
  let corner = CORNERS[index];
  let offset = card_point(corner, view.right.xy);
  var out: Out;
  out.position = view.from_eye * vec4f(offset, 1.0);
  out.corner = corner;
  out.from_eye = offset;
  return out;
}

// A figure in a shadow keeps what the land's ambient light gives an upright face: about half its sunlit colour.
const SHADED = 0.55;
// The way the light runs over the ground, away from the sun, and how much of a step along the sun is over the ground.
const LIGHT_ACROSS = vec2f(0.7071068, -0.7071068);
const SUN_ACROSS = 0.766;

@fragment fn card_fragment(in: Out) -> @location(0) vec4f {
  let texel = picture_at(in.corner);
  if (texel.a < 0.5) { discard; }
  // A figure's shadow is drawn from its card turned square to the sun about its feet. A point of the card the eye sees
  // that lies behind that one from the sun is asked of the map from past it, so a figure never shades itself.
  let behind = max(across_of(in.corner) * dot(view.right.xy, LIGHT_ACROSS), 0.0);
  let sun = sunlit(in.from_eye + SUN * (behind / SUN_ACROSS + 0.15), SUN);
  // A struck figure flashes white, or red for the player's own, by its share.
  let flash = select(vec3f(1.0), vec3f(1.0, 0.16, 0.1), card.root.w > 0.5);
  return vec4f(mix(texel.rgb * mix(SHADED, 1.0, sun), flash, card.root.z), 1.0);
}

// A figure's contact shade: a soft dark disc on the ground at its feet. Where the near shadow map holds the figure's
// own shadow it stays under the feet; past it, it leans a little the way the sun throws shadows and stands in for
// one, so a card still stands on the ground and not over it.
const SHADE_SEGMENTS = 12u;
struct Shade { @builtin(position) position: vec4f, @location(0) rim: f32, @location(1) darkness: f32 }

@vertex fn shade_vertex(@builtin(vertex_index) index: u32) -> Shade {
  let corner = index % 3u;
  let angle = f32(index / 3u + select(0u, 1u, corner == 2u)) / f32(SHADE_SEGMENTS) * 6.2831853;
  let rim = select(1.0, 0.0, corner == 0u);
  let light = shadow.near * vec4f(card.feet.xyz, 1.0);
  let own = shadow.map.w > 0.5 && max(abs(light.x), abs(light.y)) < 0.8;
  let lean = select(-SUN.xy / SUN.z * card.size.y * 0.25, vec2f(0.0), own);
  let radius = vec2f(0.45, 0.45) * rim * select(1.0, 0.75, own);
  let offset = vec3f(card.feet.xy + lean * 0.5 * rim + vec2f(cos(angle), sin(angle)) * radius, card.feet.z + 0.03);
  var out: Shade;
  out.position = view.from_eye * vec4f(offset, 1.0);
  out.rim = rim;
  out.darkness = select(0.42, 0.3, own);
  return out;
}

@fragment fn shade_fragment(shade: Shade) -> @location(0) vec4f {
  let soft = 1.0 - shade.rim * shade.rim;
  return vec4f(0.0, 0.0, 0.0, shade.darkness * soft * soft);
}
`;

/** A card's depth along the sun, for the near shadow map: turned square to the sun about its feet, the picture kept
 *  the way round the eye sees it, and anything clear cut away. */
const CAST_SHADER = /* wgsl */ `
${CARD}
${SHADOW_CAST_WGSL}

struct Shadowed { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn card_cast(@builtin(vertex_index) index: u32) -> Shadowed {
  let corner = CORNERS[index];
  let square = normalize(vec2f(-SUN.y, SUN.x));
  let right = select(-square, square, dot(square, view.right.xy) >= 0.0);
  var out: Shadowed;
  out.position = shadow.from_eye * vec4f(card_point(corner, right), 1.0);
  out.corner = corner;
  return out;
}

@fragment fn card_cast_fragment(in: Shadowed) {
  if (picture_at(in.corner).a < 0.5) { discard; }
}
`;

/** Draws the forge's figures into the scene's pass, after the land and before the water, and their shadows into the
 *  sun's near map before that. */
export class FigureView implements CardMaker {
  private readonly gpu: Gpu;
  private readonly pipeline: GPURenderPipeline;
  private readonly shade: GPURenderPipeline;
  private readonly cast: GPURenderPipeline;
  private readonly cardLayout: GPUBindGroupLayout;
  private readonly viewBuffer: GPUBuffer;
  private readonly viewGroup: GPUBindGroup;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];
  /** The frame the cards' uniforms were last written for, and their groups. */
  private written: { fromEye: Float32Array; figures: readonly CardAt[]; groups: GPUBindGroup[] } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const castModule = device.createShaderModule({ code: CAST_SHADER });
    const viewLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} }],
    });
    this.cardLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: {} },
      ],
    });
    const shadows = shadowLayouts(device);
    const drawLayout = device.createPipelineLayout({
      bindGroupLayouts: [viewLayout, shadows.receiver, this.cardLayout],
    });
    this.pipeline = device.createRenderPipeline({
      layout: drawLayout,
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
      layout: drawLayout,
      vertex: { module, entryPoint: 'shade_vertex' },
      fragment: { module, entryPoint: 'shade_fragment', targets: [{ format: gpu.format, blend: darken }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: REVERSED_DEPTH.format, depthWriteEnabled: false, depthCompare: REVERSED_DEPTH.compare },
      multisample: { count: SAMPLES },
    });
    this.cast = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [viewLayout, shadows.caster, this.cardLayout] }),
      vertex: { module: castModule, entryPoint: 'card_cast' },
      fragment: { module: castModule, entryPoint: 'card_cast_fragment', targets: [] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
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

  /** Writes the view's and each card's terms once a frame, for its shadow's pass and its own, and answers each card's
   *  group. */
  private groupsFor(
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
  ): GPUBindGroup[] {
    if (this.written?.fromEye === fromEye && this.written.figures === figures) return this.written.groups;
    const values = new Float32Array(VIEW_BYTES / 4);
    values.set(fromEye);
    values.set([Math.cos(yaw), Math.sin(yaw), 0, 0], 16);
    this.gpu.device.queue.writeBuffer(this.viewBuffer, 0, values);
    const groups = figures.map(({ card, x, y, z, flip, flash }, index) => {
      const { buffer, group } = this.slot(index, card.texture);
      const rootX = (flip ? card.width - card.root[0] : card.root[0]) / PX_PER_M;
      const cardValues = new Float32Array([
        ...[x - eye[0], y - eye[1], z - eye[2], flip ? 1 : 0],
        ...[card.width / PX_PER_M, card.height / PX_PER_M, 0, 0],
        ...[rootX, card.root[1] / PX_PER_M, flash?.share ?? 0, flash?.red ? 1 : 0],
      ]);
      this.gpu.device.queue.writeBuffer(buffer, 0, cardValues);
      return group;
    });
    this.written = { fromEye, figures, groups };
    return groups;
  }

  /** Draws the figures' shadows into the sun's near map (they are near the eye; far off their contact shades stand
   *  in), from an eye at `eye` (world metres) looking along `yaw`. */
  castInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
    shadow: ShadowMap,
  ): void {
    if (figures.length === 0 || shadow.cascade !== NEAR) return;
    const groups = this.groupsFor(fromEye, eye, yaw, figures);
    pass.setPipeline(this.cast);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(1, shadow.casterGroup(this.cast));
    for (const group of groups) {
      pass.setBindGroup(2, group);
      pass.draw(6);
    }
  }

  /** Draws the figures from an eye at `eye` (world metres), with the camera's view-projection measured from the eye
   *  and its yaw (radians clockwise from north), in the sun's shadows when a map is given. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    yaw: number,
    figures: readonly CardAt[],
    shadow?: ShadowMap,
  ): void {
    if (figures.length === 0) return;
    const groups = this.groupsFor(fromEye, eye, yaw, figures);
    pass.setBindGroup(0, this.viewGroup);
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipeline));
    pass.setPipeline(this.shade);
    for (const group of groups) {
      pass.setBindGroup(2, group);
      pass.draw(36);
    }
    pass.setPipeline(this.pipeline);
    for (const group of groups) {
      pass.setBindGroup(2, group);
      pass.draw(6);
    }
  }
}
