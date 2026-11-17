import { BUFFER_USAGE, SHADER_STAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { type Orbit, REVERSED_DEPTH, viewProjection } from '../editor/orbit.ts';
import { MARK_FLOATS } from '../combat/marks.ts';
import type { Card, CardAt, CardMaker } from '../player/cards.ts';
import { PX_PER_M } from '../player/figures.ts';
import type { Block } from '../rules/movementRules.ts';

const SKY = [0.55, 0.66, 0.78] as const;
/** The ground's tiles a side. A ground of a few large triangles reaching behind the eye is interpolated wrongly near
 *  it, so the ground is drawn as many small ones. */
const TILES = 100;
const SCENE_BYTES = 96;
const CARD_BYTES = 48;

const SHADER = /* wgsl */ `
struct Scene { viewProjection: mat4x4f, eye: vec4f, marker: vec4f }
@group(0) @binding(0) var<uniform> scene: Scene;

const SKY = vec3f(${SKY.join(', ')});
const EXTENT = 1500.0;
const TILES = ${TILES}u;

struct GroundOut { @builtin(position) position: vec4f, @location(0) world: vec2f }

@vertex fn groundVertex(@builtin(vertex_index) index: u32) -> GroundOut {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let tile = index / 6u;
  let size = 2.0 * EXTENT / f32(TILES);
  let cell = vec2f(f32(tile % TILES), f32(tile / TILES)) + corners[index % 6u];
  // The ground follows the eye, a tile at a time, so it never ends.
  let world = floor(scene.eye.xy / size) * size - EXTENT + cell * size;
  var out: GroundOut;
  out.position = scene.viewProjection * vec4f(world, 0.0, 1.0);
  out.world = world;
  return out;
}

fn gridLine(world: vec2f, spacing: f32) -> f32 {
  let cell = world / spacing;
  let line = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2f(1e-4));
  return 1.0 - min(min(line.x, line.y), 1.0);
}

@fragment fn groundFragment(in: GroundOut) -> @location(0) vec4f {
  let metre = gridLine(in.world, 1.0);
  let ten = gridLine(in.world, 10.0);
  var colour = mix(vec3f(0.33, 0.40, 0.27), vec3f(0.80, 0.84, 0.74), max(metre * 0.22, ten * 0.55));
  let axis = 1.0 - min(min(abs(in.world.x), abs(in.world.y)) / max(fwidth(in.world.x), 1e-4), 1.0);
  colour = mix(colour, vec3f(0.85, 0.75, 0.30), axis * 0.8);
  // The chosen figure's ring: 0.6 m round its feet.
  let ring = abs(length(in.world - scene.marker.xy) - 0.6) / max(fwidth(in.world.x), 1e-4);
  colour = mix(colour, vec3f(1.0, 0.85, 0.2), scene.marker.w * (1.0 - min(ring / 2.0, 1.0)));
  let fog = clamp(length(in.world - scene.eye.xy) / 1200.0, 0.0, 1.0);
  return vec4f(mix(colour, SKY, fog * fog), 1.0);
}

struct MarkOut { @builtin(position) position: vec4f, @location(0) colour: vec4f }

@vertex fn markVertex(@location(0) position: vec3f, @location(1) colour: vec4f) -> MarkOut {
  var out: MarkOut;
  out.position = scene.viewProjection * vec4f(position, 1.0);
  out.colour = colour;
  return out;
}

@fragment fn markFragment(in: MarkOut) -> @location(0) vec4f {
  return vec4f(in.colour.rgb * in.colour.a, in.colour.a);
}

struct BlockOut { @builtin(position) position: vec4f, @location(0) normal: vec3f, @location(1) world: vec3f }

@vertex fn blockVertex(@location(0) position: vec3f, @location(1) normal: vec3f) -> BlockOut {
  var out: BlockOut;
  out.position = scene.viewProjection * vec4f(position, 1.0);
  out.normal = normal;
  out.world = position;
  return out;
}

@fragment fn blockFragment(in: BlockOut) -> @location(0) vec4f {
  let light = normalize(vec3f(0.4, -0.3, 0.85));
  let shade = 0.55 + 0.45 * max(dot(in.normal, light), 0.0);
  // A darker line at each metre of height on the sides, to judge a lip's height by.
  let metre = 1.0 - min(abs(fract(in.world.z + 0.5) - 0.5) / max(fwidth(in.world.z), 1e-4), 1.0);
  let side = 1.0 - abs(in.normal.z);
  let stone = vec3f(0.64, 0.61, 0.56) * (1.0 - 0.35 * metre * side);
  let fog = clamp(length(in.world.xy - scene.eye.xy) / 1200.0, 0.0, 1.0);
  return vec4f(mix(stone * shade, SKY, fog * fog), 1.0);
}

struct Card { feet: vec4f, side: vec4f, root: vec4f }
@group(1) @binding(0) var<uniform> card: Card;
@group(1) @binding(1) var picture: texture_2d<f32>;

struct CardOut { @builtin(position) position: vec4f, @location(0) corner: vec2f }

@vertex fn cardVertex(@builtin(vertex_index) index: u32) -> CardOut {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let corner = corners[index];
  let size = card.side.zw;
  // Across from the feet along the eye's right, and up from them: the card stands upright on its root.
  let across = corner.x * size.x - card.root.x;
  let up = card.root.y - corner.y * size.y;
  let world = vec3f(card.feet.xy + card.side.xy * across, card.feet.z + up);
  var out: CardOut;
  out.position = scene.viewProjection * vec4f(world, 1.0);
  out.corner = corner;
  return out;
}

@fragment fn cardFragment(in: CardOut) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(picture));
  var at = in.corner;
  if (card.feet.w > 0.5) { at.x = 1.0 - at.x; }
  let texel = textureLoad(picture, vec2i(min(at * size, size - 1.0)), 0);
  if (texel.a < 0.5) { discard; }
  let flash = select(vec3f(1.0), vec3f(1.0, 0.16, 0.1), card.root.w > 0.5);
  return vec4f(mix(texel.rgb, flash, card.root.z), 1.0);
}
`;

/** The Test Ground drawn with WebGPU: the open ground with a metre grid, and each figure's card standing on it. */
export class SceneView implements CardMaker {
  private readonly gpu: Gpu;
  private readonly sceneBuffer: GPUBuffer;
  private readonly sceneGroup: GPUBindGroup;
  private readonly ground: GPURenderPipeline;
  private readonly cards: GPURenderPipeline;
  private readonly cardLayout: GPUBindGroupLayout;
  private readonly blockPipeline: GPURenderPipeline;
  private blockVertices: { buffer: GPUBuffer; count: number } | null = null;
  private readonly markPipeline: GPURenderPipeline;
  private markBuffer: GPUBuffer | null = null;
  private markCount = 0;
  private readonly slots: { buffer: GPUBuffer; texture: GPUTexture | null; group: GPUBindGroup | null }[] = [];
  private depth: GPUTexture | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const module = device.createShaderModule({ code: SHADER });
    const depthStencil = {
      format: REVERSED_DEPTH.format,
      depthWriteEnabled: true,
      depthCompare: REVERSED_DEPTH.compare,
    } as const;
    // One scene layout both pipelines share, so the scene's bind group fits each.
    const both = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const sceneLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: both, buffer: {} }] });
    this.cardLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: both, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
      ],
    });
    const pipeline = (vertex: string, fragment: string, groups: GPUBindGroupLayout[]) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: groups }),
        vertex: { module, entryPoint: vertex },
        fragment: { module, entryPoint: fragment, targets: [{ format: gpu.format }] },
        primitive: { topology: 'triangle-list' },
        depthStencil,
      });
    this.ground = pipeline('groundVertex', 'groundFragment', [sceneLayout]);
    this.cards = pipeline('cardVertex', 'cardFragment', [sceneLayout, this.cardLayout]);
    this.blockPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] }),
      vertex: {
        module,
        entryPoint: 'blockVertex',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'blockFragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil,
    });
    // Marks lie over the ground, blended, tested against the scene's depth but writing none, so figures stand over
    // them and they never hide one another.
    this.markPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout] }),
      vertex: {
        module,
        entryPoint: 'markVertex',
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
        entryPoint: 'markFragment',
        targets: [
          {
            format: gpu.format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
    });
    this.sceneBuffer = device.createBuffer({
      size: SCENE_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.sceneGroup = device.createBindGroup({
      layout: sceneLayout,
      entries: [{ binding: 0, resource: { buffer: this.sceneBuffer } }],
    });
  }

  /** The marks the next frames draw: telegraphed blows on the ground and shots in flight, as `marksMesh` lays them. */
  setMarks(vertices: Float32Array): void {
    const { device } = this.gpu;
    this.markCount = vertices.length / MARK_FLOATS;
    if (this.markCount === 0) return;
    if (!this.markBuffer || this.markBuffer.size < vertices.byteLength) {
      this.markBuffer?.destroy();
      const size = Math.max(4096, 2 ** Math.ceil(Math.log2(vertices.byteLength)));
      this.markBuffer = device.createBuffer({ size, usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination });
    }
    device.queue.writeBuffer(this.markBuffer, 0, vertices);
  }

  /** A composed picture as a texture the scene can draw. */
  card(pixels: Uint8Array, width: number, height: number, root: readonly [number, number]): Card {
    const texture = this.gpu.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeTexture({ texture }, pixels, { bytesPerRow: width * 4 }, [width, height]);
    return { texture, width, height, root };
  }

  /** The card's uniform slot for the `index`th card drawn this frame, its bind group remade only for a new texture. */
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

  /** The blocks the scene stands on the ground, each a box from the ground to its top. */
  setBlocks(blocks: readonly Block[]): void {
    const faces: [number, number, number, number[][]][] = [];
    for (const { minX, minY, maxX, maxY, top } of blocks) {
      faces.push([
        0,
        0,
        1,
        [
          [minX, minY, top],
          [maxX, minY, top],
          [maxX, maxY, top],
          [minX, maxY, top],
        ],
      ]);
      faces.push([
        0,
        -1,
        0,
        [
          [minX, minY, 0],
          [maxX, minY, 0],
          [maxX, minY, top],
          [minX, minY, top],
        ],
      ]);
      faces.push([
        0,
        1,
        0,
        [
          [maxX, maxY, 0],
          [minX, maxY, 0],
          [minX, maxY, top],
          [maxX, maxY, top],
        ],
      ]);
      faces.push([
        -1,
        0,
        0,
        [
          [minX, maxY, 0],
          [minX, minY, 0],
          [minX, minY, top],
          [minX, maxY, top],
        ],
      ]);
      faces.push([
        1,
        0,
        0,
        [
          [maxX, minY, 0],
          [maxX, maxY, 0],
          [maxX, maxY, top],
          [maxX, minY, top],
        ],
      ]);
    }
    const values: number[] = [];
    for (const [normalX, normalY, normalZ, corners] of faces)
      for (const corner of [0, 1, 2, 0, 2, 3]) values.push(...(corners[corner] ?? []), normalX, normalY, normalZ);
    this.blockVertices?.buffer.destroy();
    const data = new Float32Array(values);
    const buffer = this.gpu.device.createBuffer({
      size: Math.max(16, data.byteLength),
      usage: BUFFER_USAGE.vertex | BUFFER_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeBuffer(buffer, 0, data);
    this.blockVertices = { buffer, count: values.length / 6 };
  }

  /** Draws the ground, the blocks and the cards as seen from `orbit` into the canvas, `width` by `height` device
   *  pixels, with a ring round the chosen figure's feet; `after` may draw over the frame before it is shown. */
  draw(
    orbit: Orbit,
    width: number,
    height: number,
    drawn: readonly CardAt[],
    chosen: { x: number; y: number } | null,
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void,
  ): void {
    const { device, context } = this.gpu;
    if (!this.depth || this.depth.width !== width || this.depth.height !== height) {
      this.depth?.destroy();
      this.depth = device.createTexture({
        size: [width, height],
        format: REVERSED_DEPTH.format,
        usage: TEXTURE_USAGE.renderAttachment,
      });
    }
    const values = new Float32Array(SCENE_BYTES / 4);
    values.set(viewProjection(orbit, width / height));
    const right = [Math.cos(orbit.yaw), Math.sin(orbit.yaw)] as const;
    values.set([orbit.targetX, orbit.targetY, orbit.targetZ, 0], 16);
    values.set([chosen?.x ?? 0, chosen?.y ?? 0, 0, chosen ? 1 : 0], 20);
    device.queue.writeBuffer(this.sceneBuffer, 0, values);
    const encoder = device.createCommandEncoder();
    const colourView = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colourView,
          clearValue: { r: SKY[0], g: SKY[1], b: SKY[2], a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    pass.setPipeline(this.ground);
    pass.setBindGroup(0, this.sceneGroup);
    pass.draw(6 * TILES * TILES);
    if (this.blockVertices) {
      pass.setPipeline(this.blockPipeline);
      pass.setBindGroup(0, this.sceneGroup);
      pass.setVertexBuffer(0, this.blockVertices.buffer);
      pass.draw(this.blockVertices.count);
    }
    pass.setPipeline(this.cards);
    pass.setBindGroup(0, this.sceneGroup);
    drawn.forEach(({ card, x, y, z, flip, flash }, index) => {
      const { buffer, group } = this.slot(index, card.texture);
      const rootX = (flip ? card.width - card.root[0] : card.root[0]) / PX_PER_M;
      const cardValues = new Float32Array([
        ...[x, y, z, flip ? 1 : 0],
        ...[...right, card.width / PX_PER_M, card.height / PX_PER_M],
        ...[rootX, card.root[1] / PX_PER_M, flash?.share ?? 0, flash?.red ? 1 : 0],
      ]);
      device.queue.writeBuffer(buffer, 0, cardValues);
      pass.setBindGroup(1, group);
      pass.draw(6);
    });
    if (this.markBuffer && this.markCount > 0) {
      pass.setPipeline(this.markPipeline);
      pass.setBindGroup(0, this.sceneGroup);
      pass.setVertexBuffer(0, this.markBuffer);
      pass.draw(this.markCount);
    }
    pass.end();
    after?.(encoder, colourView);
    device.queue.submit([encoder.finish()]);
  }
}
