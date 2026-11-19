// The held map drawn over the finished picture: the forge's parchment, the world inked on it under the player's fog of
// war, then the gauntlets holding it. The ink is worked out a pixel at a time from the coast field, so its coasts are
// sharp at any zoom.
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../firstperson/fpMotion.ts';
import { FirstPersonView } from '../firstperson/firstPersonView.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import type { WatersWash } from './watersWash.ts';

/** The most points of a route the map inks: every pixel of the parchment measures itself against each. */
export const ROUTE_POINTS = 128;

const INK_SHADER = /* wgsl */ `
struct Ink {
  // The map's rectangle, screen pixels: left, top, width, height; and the screen's width and height.
  rect: vec4f,
  screen: vec4f,
  // The view: the world point at the map's top-left, metres, pixels a metre, and how many points the route has.
  view: vec4f,
  // The coast field's columns and rows and its cell's side, metres.
  field: vec4f,
  // The islands discovered, a bit each by their place among the outlines.
  known: vec4u,
};
@group(0) @binding(0) var<uniform> ink: Ink;
@group(0) @binding(1) var distances: texture_2d<f32>;
@group(0) @binding(2) var islands: texture_2d<u32>;
@group(0) @binding(3) var charted: texture_2d<f32>;
@group(0) @binding(4) var soft: sampler;
// Each of the route's points: where it lies, metres, and how far along the route.
@group(0) @binding(5) var<storage, read> route: array<vec4f>;
// The waters' wash over the charted sea, its holders' colours blended and its alpha how much is charted sea; and how
// much of it is contested, which is hatched (watersWash.ts).
@group(0) @binding(6) var wash: texture_2d<f32>;
@group(0) @binding(7) var hatch: texture_2d<f32>;

// Iron-gall ink, and the red-brown the route is drawn in.
const INK_RGB = vec3f(58.0, 40.0, 22.0) / 255.0;
const ROUTE_RGB = vec3f(120.0, 28.0, 20.0) / 255.0;
const NO_ISLAND = 255u;
// How strong the waters' wash and their hatching are, and the hatching's lines' spacing, screen pixels.
const WASH_ALPHA = 0.2;
const HATCH_ALPHA = 0.45;
const HATCH_PX = 7.0;

@vertex fn ink_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let pixel = ink.rect.xy + corners[index] * ink.rect.zw;
  return vec4f(pixel.x / ink.screen.x * 2.0 - 1.0, 1.0 - pixel.y / ink.screen.y * 2.0, 0.0, 1.0);
}

// The coast field's distance at a world point, metres, between its cells' middles.
fn distance_at(world: vec2f) -> f32 {
  let last = vec2i(ink.field.xy) - 1;
  let cell = world / ink.field.z - 0.5;
  let base = vec2i(floor(cell));
  let f = cell - floor(cell);
  let at = corners_at(base, last);
  return mix(mix(at.x, at.y, f.x), mix(at.z, at.w, f.x), f.y);
}

// The field at a cell and its neighbours east, south and south-east, held to the grid.
fn corners_at(base: vec2i, last: vec2i) -> vec4f {
  let a = textureLoad(distances, clamp(base, vec2i(0), last), 0).r;
  let b = textureLoad(distances, clamp(base + vec2i(1, 0), vec2i(0), last), 0).r;
  let c = textureLoad(distances, clamp(base + vec2i(0, 1), vec2i(0), last), 0).r;
  let d = textureLoad(distances, clamp(base + vec2i(1, 1), vec2i(0), last), 0).r;
  return vec4f(a, b, c, d);
}

// How strongly the route is inked at a point a pixel, dashed along its length.
fn route_at(world: vec2f) -> f32 {
  var strongest = 0.0;
  let count = u32(ink.view.w);
  for (var index = 1u; index < count; index++) {
    let a = route[index - 1u];
    let b = route[index];
    let along = b.xy - a.xy;
    let t = clamp(dot(world - a.xy, along) / max(dot(along, along), 1.0), 0.0, 1.0);
    let away = length(world - a.xy - along * t) * ink.view.z;
    let line = 1.0 - smoothstep(0.9, 1.8, away);
    let metres = mix(a.z, b.z, t) * ink.view.z;
    let dash = 1.0 - step(7.0, metres - floor(metres / 11.0) * 11.0);
    strongest = max(strongest, line * dash);
  }
  return strongest;
}

@fragment fn ink_fragment(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let world = ink.view.xy + (at.xy - ink.rect.xy) / ink.view.z;
  let size = ink.field.xy * ink.field.z;
  let cell = vec2i(clamp(floor(world / ink.field.z), vec2f(0.0), ink.field.xy - 1.0));
  let island = textureLoad(islands, cell, 0).r;
  let seen = island != NO_ISLAND && ((ink.known.x >> min(island, 31u)) & 1u) == 1u;
  let fog = textureSampleLevel(charted, soft, world / size, 0.0).r;
  let inside = all(world >= vec2f(0.0)) && all(world <= size);
  let metres = distance_at(world);
  let pixels = metres * ink.view.z;
  // The charted sea, a faint wash; the parchment itself is the land and the unknown.
  var alpha = select(0.0, 0.08 * fog, metres > 0.0 && inside);
  if (seen) {
    // The coast drawn twice, as a pen does: a soft wash on the sea's side, then the line.
    alpha = max(alpha, 0.92 * (1.0 - smoothstep(0.55, 1.35, abs(pixels))));
    if (pixels > 0.0) {
      alpha = max(alpha, 0.3 * (1.0 - smoothstep(0.0, 5.0, pixels)));
      // Engraved lines following the coast out to sea, fading as they go.
      let ring = abs(fract(pixels / 7.0 + 0.5) - 0.5) * 7.0;
      let fade = 1.0 - smoothstep(6.0, 32.0, pixels);
      alpha = max(alpha, 0.28 * fade * (1.0 - smoothstep(0.3, 1.0, ring)) * step(4.0, pixels));
    }
  }
  // The waters under the ink: their wash, and fine diagonal lines over the contested.
  let sea = select(0.0, 1.0, metres > 0.0 && inside);
  let tint = textureSampleLevel(wash, soft, world / size, 0.0);
  let contested = textureSampleLevel(hatch, soft, world / size, 0.0).r;
  let under = WASH_ALPHA * tint.a * sea;
  let stripe = 1.0 - smoothstep(0.5, 1.1, abs(fract((at.x + at.y) / HATCH_PX) - 0.5) * HATCH_PX);
  alpha = max(alpha, HATCH_ALPHA * contested * tint.a * sea * stripe);
  let course = route_at(world);
  let over = max(alpha, 0.9 * course);
  let colour = mix(INK_RGB, ROUTE_RGB, step(alpha, course));
  let shown = over + under * (1.0 - over);
  let mixed = (colour * over + tint.rgb * under * (1.0 - over)) / max(shown, 1e-4);
  return vec4f(mixed, shown);
}
`;

/** What one frame of the held map draws, screen pixels. */
export interface HeldMapFrame {
  readonly screen: { readonly width: number; readonly height: number };
  /** The painting, where it is in its rise, and the map within its parchment. */
  readonly sprite: Rect;
  readonly ink: Rect;
  /** The world point at the map's top-left, metres, and screen pixels a metre. */
  readonly view: { readonly left: number; readonly top: number; readonly scale: number };
  /** Which frame of the hands' strip shows. */
  readonly handsFrame: number;
  /** The islands discovered, a bit each by their place among the outlines. */
  readonly knownIslands: number;
  /** The route's points: where each lies, metres, and how far along the route, four floats a point. */
  readonly route: Float32Array;
}

const INK_BYTES = 80;

export class HeldMapView {
  private readonly gpu: Gpu;
  /** The parchment and the hands, each drawn as the first person's pictures are, one drawer each so their quads'
   *  terms never share a slot within a frame. */
  private readonly sheetDrawer: FirstPersonView;
  private readonly handsDrawer: FirstPersonView;
  private readonly inking: GPURenderPipeline;
  private readonly inkUniforms: GPUBuffer;
  private readonly routeBuffer: GPUBuffer;
  private readonly charted: GPUTexture;
  private readonly chartedBytes: Uint8Array;
  private readonly wash: GPUTexture;
  private readonly hatch: GPUTexture;
  private readonly inkGroup: GPUBindGroup;
  private readonly field: CoastField;
  private pictures: { sheet: GPUTexture; hands: GPUTexture; frames: number } | null = null;

  constructor(gpu: Gpu, field: CoastField) {
    this.gpu = gpu;
    this.field = field;
    const { device } = gpu;
    const blend: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.sheetDrawer = new FirstPersonView(gpu);
    this.handsDrawer = new FirstPersonView(gpu);
    const inkModule = device.createShaderModule({ code: INK_SHADER });
    const inkLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: SHADER_STAGE.vertex | SHADER_STAGE.fragment, buffer: {} },
        { binding: 1, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } },
        { binding: 2, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'uint' } },
        { binding: 3, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 4, visibility: SHADER_STAGE.fragment, sampler: {} },
        { binding: 5, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 7, visibility: SHADER_STAGE.fragment, texture: {} },
      ],
    });
    this.inking = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [inkLayout] }),
      vertex: { module: inkModule, entryPoint: 'ink_vertex' },
      fragment: { module: inkModule, entryPoint: 'ink_fragment', targets: [{ format: gpu.format, blend }] },
    });
    const uniform = (bytes: number) =>
      device.createBuffer({ size: bytes, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    this.inkUniforms = uniform(INK_BYTES);
    this.routeBuffer = device.createBuffer({
      size: ROUTE_POINTS * 16,
      usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination,
    });
    const { columns, rows } = field;
    const texture = (format: GPUTextureFormat) =>
      device.createTexture({
        size: [columns, rows],
        format,
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
      });
    const distances = texture('r32float');
    device.queue.writeTexture({ texture: distances }, field.distance, { bytesPerRow: columns * 4 }, [columns, rows]);
    const islands = texture('r8uint');
    device.queue.writeTexture({ texture: islands }, field.island, { bytesPerRow: columns }, [columns, rows]);
    this.charted = texture('r8unorm');
    this.chartedBytes = new Uint8Array(columns * rows);
    this.wash = texture('rgba8unorm');
    this.hatch = texture('r8unorm');
    this.inkGroup = device.createBindGroup({
      layout: inkLayout,
      entries: [
        { binding: 0, resource: { buffer: this.inkUniforms } },
        { binding: 1, resource: distances.createView() },
        { binding: 2, resource: islands.createView() },
        { binding: 3, resource: this.charted.createView() },
        { binding: 4, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
        { binding: 5, resource: { buffer: this.routeBuffer } },
        { binding: 6, resource: this.wash.createView() },
        { binding: 7, resource: this.hatch.createView() },
      ],
    });
  }

  /** The parchment and the hands' strip to draw, RGBA top row first; the strip holds `frames` frames side by side. */
  setPictures(
    sheet: { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray | Uint8Array },
    hands: { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray | Uint8Array },
    frames: number,
  ): void {
    if (this.pictures) {
      this.sheetDrawer.forget(this.pictures.sheet);
      this.handsDrawer.forget(this.pictures.hands);
      this.pictures.sheet.destroy();
      this.pictures.hands.destroy();
    }
    const bytes = (picture: typeof sheet) =>
      new Uint8Array(picture.data.buffer, picture.data.byteOffset, picture.data.byteLength);
    this.pictures = {
      sheet: this.sheetDrawer.texture(bytes(sheet), sheet.width, sheet.height),
      hands: this.handsDrawer.texture(bytes(hands), hands.width, hands.height),
      frames,
    };
  }

  /** Whether the pictures have come, so the map can be drawn. */
  get ready(): boolean {
    return this.pictures !== null;
  }

  /** Lays the charted sea on the map: a byte a cell, 1 where charted. */
  setCharted(charted: Uint8Array): void {
    for (let index = 0; index < charted.length; index++) this.chartedBytes[index] = charted[index] ? 255 : 0;
    const { columns, rows } = this.field;
    this.gpu.device.queue.writeTexture({ texture: this.charted }, this.chartedBytes, { bytesPerRow: columns }, [
      columns,
      rows,
    ]);
  }

  /** Lays the waters' wash on the map, on the coast field's own cells (`washOf`). */
  setWash(wash: WatersWash): void {
    const { columns, rows } = this.field;
    if (wash.hatch.length !== columns * rows) throw new Error('the waters’ wash is not on the coast field’s cells');
    const queue = this.gpu.device.queue;
    queue.writeTexture({ texture: this.wash }, wash.colour, { bytesPerRow: columns * 4 }, [columns, rows]);
    queue.writeTexture({ texture: this.hatch }, wash.hatch, { bytesPerRow: columns }, [columns, rows]);
  }

  /** Draws the held map over what `target` holds. */
  draw(encoder: GPUCommandEncoder, target: GPUTextureView, frame: HeldMapFrame): void {
    const pictures = this.pictures;
    if (!pictures) return;
    const { device } = this.gpu;
    const { screen, sprite, ink, view } = frame;
    // The painting on the first person's design screen; the hands' cuffs carried down to the screen's foot when the
    // painting stops short of it.
    const [toDesignX, toDesignY] = [DESIGN_WIDTH / screen.width, DESIGN_HEIGHT / screen.height];
    const foot = Math.max(sprite.y + sprite.height, screen.height);
    const placed = { x: sprite.x * toDesignX, y: sprite.y * toDesignY, width: sprite.width * toDesignX, flip: false };
    const handsFrame = Math.min(pictures.frames - 1, Math.max(0, frame.handsFrame));
    const sheetQuad = { ...placed, texture: pictures.sheet, height: sprite.height * toDesignY };
    const handsQuad = {
      ...placed,
      texture: pictures.hands,
      height: (foot - sprite.y) * toDesignY,
      part: [handsFrame / pictures.frames, (handsFrame + 1) / pictures.frames] as const,
      reach: (foot - sprite.y) / sprite.height,
    };
    const points = Math.min(ROUTE_POINTS, frame.route.length / 4);
    if (points) device.queue.writeBuffer(this.routeBuffer, 0, frame.route, 0, points * 4);
    const uniforms = new ArrayBuffer(INK_BYTES);
    new Float32Array(uniforms, 0, 16).set([
      ...[ink.x, ink.y, ink.width, ink.height],
      ...[screen.width, screen.height, 0, 0],
      ...[view.left, view.top, view.scale, points],
      ...[this.field.columns, this.field.rows, this.field.cellM, 0],
    ]);
    new Uint32Array(uniforms, 64, 4).set([frame.knownIslands >>> 0, 0, 0, 0]);
    device.queue.writeBuffer(this.inkUniforms, 0, uniforms);
    this.sheetDrawer.draw(encoder, target, screen.width, screen.height, [sheetQuad]);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.inking);
    pass.setBindGroup(0, this.inkGroup);
    pass.draw(6);
    pass.end();
    this.handsDrawer.draw(encoder, target, screen.width, screen.height, [handsQuad]);
  }
}
