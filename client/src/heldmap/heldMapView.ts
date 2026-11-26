// The held map drawn over the finished picture: the forge's parchment, the world inked on it, then the gauntlets
// holding it. The ink is worked out a pixel at a time from the coast field, so its coasts are
// sharp at any zoom.
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../firstperson/fpMotion.ts';
import { FirstPersonView } from '../firstperson/firstPersonView.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { routeTiles, TILE_PX, TILE_WORDS } from './routeTiles.ts';
import { HATCHES, WASH_STRENGTH, type WatersWash } from './watersWash.ts';

/** The most points of a route the map inks: a pixel measures itself against the legs between them near its tile. */
export const ROUTE_POINTS = 128;
/** The most keepers' coins the map rings at once, lit as their marks over them are (a social space's every keeper). */
export const MOST_PULSES = 16;
/** How often a lit coin's ring goes out, a second: as the lit marks over the keepers beat (combat/marksOver.ts). */
const PULSE_HZ = 0.75;

export const INK_SHADER = /* wgsl */ `
struct Ink {
  // The map's rectangle, screen pixels: left, top, width, height; and the screen's width and height.
  rect: vec4f,
  screen: vec4f,
  // The view: the world point at the map's top-left, metres, and pixels a metre.
  view: vec4f,
  // The coast field's columns and rows and its cell's side, metres.
  field: vec4f,
  // The islands shown, a bit each by their place among the outlines; then 1 while the lit cells are a region's land;
  // then the route's tiles across and down (routeTiles.ts).
  known: vec4u,
  // The parchment's rectangle, screen pixels: the pass covers it, the map's ink only within the map.
  sheet: vec4f,
  // The lit coins: how many, the map's clock, seconds, and 1 while motion is reduced; then each coin's middle and
  // radius, screen pixels.
  pulse: vec4f,
  pulses: array<vec4f, ${MOST_PULSES}>,
};
@group(0) @binding(0) var<uniform> ink: Ink;
@group(0) @binding(1) var distances: texture_2d<f32>;
@group(0) @binding(2) var islands: texture_2d<u32>;
@group(0) @binding(4) var soft: sampler;
// Each of the route's points: where it lies, metres, and how far along the route.
@group(0) @binding(5) var<storage, read> route: array<vec4f>;
// The waters' wash over the sea, its holders' colours blended and its alpha how much is sea; and how
// much of it is the Lattice's and how much the Grey Tithe's, each hatched (watersWash.ts).
@group(0) @binding(6) var wash: texture_2d<f32>;
@group(0) @binding(7) var hatch: texture_2d<f32>;
// The water under the pointer, 1 over its cells and the land beside them (litCells, heldMapAsk.ts).
@group(0) @binding(8) var lit: texture_2d<f32>;
// The locked seas and their islands, 1 over their cells (shutCells, watersWash.ts).
@group(0) @binding(9) var shut: texture_2d<f32>;
// The parchment's words, marks and key, painted at its own pixels, premultiplied (mapLetters.ts).
@group(1) @binding(0) var lettering: texture_2d<f32>;
// The route's legs near each tile of the map, a bit each (routeTiles.ts).
@group(2) @binding(0) var<storage, read> legs: array<vec4u>;
const TILE_PX = ${TILE_PX.toFixed(1)};

// Iron-gall ink, and the red-brown the route is drawn in.
const INK_RGB = vec3f(58.0, 40.0, 22.0) / 255.0;
const ROUTE_RGB = vec3f(120.0, 28.0, 20.0) / 255.0;
const NO_ISLAND = 255u;
const PULSE_HZ = ${PULSE_HZ.toFixed(3)};
// The lit water's wash, the parchment's light over it, and its edge with the other waters, in the ink.
const LIT_RGB = vec3f(255.0, 250.0, 232.0) / 255.0;
const LIT_ALPHA = 0.22;
const LIT_EDGE_ALPHA = 0.45;
// How far a locked sea and its island are darkened toward the ink.
const SHUT_ALPHA = 0.42;
// How strong the waters' wash is; the Lattice's and the Grey Tithe's level hatching, each its strength, colour and
// lines' spacing, device pixels (watersWash.ts).
const WASH_ALPHA = ${WASH_STRENGTH.toFixed(3)};
${Object.entries({ LATTICE: HATCHES.lattice, TITHE: HATCHES['grey-tithe'] })
  .map(
    ([name, hatch]) => `const ${name}_ALPHA = ${hatch.strength.toFixed(3)};
const ${name}_RGB = vec3f(${hatch.colour.map((channel) => channel.toFixed(1)).join(', ')}) / 255.0;
const ${name}_PX = ${hatch.spacingPx.toFixed(1)};`,
  )
  .join('\n')}

@vertex fn ink_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
  let pixel = ink.sheet.xy + corners[index] * ink.sheet.zw;
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

// How strongly a lit coin's rings are inked at a point a pixel: one held round it, so it reads in a still frame, and
// one going out from it once a beat and fading as it goes, unless motion is reduced.
fn pulse_at(at: vec2f) -> f32 {
  var strongest = 0.0;
  let beat = fract(ink.pulse.y * PULSE_HZ);
  let moving = 1.0 - ink.pulse.z;
  for (var index = 0u; index < u32(ink.pulse.x); index++) {
    let coin = ink.pulses[index];
    let away = length(at - coin.xy);
    let width = max(1.4, coin.z * 0.14);
    let held = 1.0 - smoothstep(width * 0.5, width, abs(away - coin.z * 1.25));
    let going = moving * (1.0 - beat) * (1.0 - smoothstep(width * 0.5, width, abs(away - coin.z * (1.25 + 0.75 * beat))));
    strongest = max(strongest, max(0.9 * held, 0.8 * going));
  }
  return strongest;
}

// How strongly the route is inked at a point a pixel (at, on the screen), dashed along its length: measured against
// only the legs that pass near its tile, as the others are too far off to ink it.
fn route_at(world: vec2f, at: vec2f) -> f32 {
  var strongest = 0.0;
  let tiles = max(ink.known.zw, vec2u(1u));
  let tile = min(vec2u(max((at - ink.rect.xy) / TILE_PX, vec2f(0.0))), tiles - 1u);
  var near = legs[tile.y * tiles.x + tile.x];
  for (var word = 0u; word < ${TILE_WORDS}u; word++) {
    var bits = near[word];
    while (bits != 0u) {
      let index = word * 32u + countTrailingZeros(bits);
      bits &= bits - 1u;
      let a = route[index];
      let b = route[index + 1u];
      let along = b.xy - a.xy;
      let t = clamp(dot(world - a.xy, along) / max(dot(along, along), 1.0), 0.0, 1.0);
      let away = length(world - a.xy - along * t) * ink.view.z;
      let line = 1.0 - smoothstep(0.9, 1.8, away);
      let metres = mix(a.z, b.z, t) * ink.view.z;
      let dash = 1.0 - step(7.0, metres - floor(metres / 11.0) * 11.0);
      strongest = max(strongest, line * dash);
    }
  }
  return strongest;
}

@fragment fn ink_fragment(@builtin(position) at: vec4f) -> @location(0) vec4f {
  let world = ink.view.xy + (at.xy - ink.rect.xy) / ink.view.z;
  let size = ink.field.xy * ink.field.z;
  let cell = vec2i(clamp(floor(world / ink.field.z), vec2f(0.0), ink.field.xy - 1.0));
  let island = textureLoad(islands, cell, 0).r;
  let seen = island != NO_ISLAND && ((ink.known.x >> min(island, 31u)) & 1u) == 1u;
  let onMap = all(at.xy >= ink.rect.xy) && all(at.xy <= ink.rect.xy + ink.rect.zw);
  let inside = onMap && all(world >= vec2f(0.0)) && all(world <= size);
  let metres = distance_at(world);
  let pixels = metres * ink.view.z;
  // The sea, a faint wash; the parchment itself is the land.
  var alpha = select(0.0, 0.08, metres > 0.0 && inside);
  if (seen && onMap) {
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
  // The waters under the ink: their wash, and over the Lattice's and the Tithe's fine level lines in their dark ink.
  let sea = select(0.0, 1.0, metres > 0.0 && inside);
  let tint = textureSampleLevel(wash, soft, world / size, 0.0);
  let shares = textureSampleLevel(hatch, soft, world / size, 0.0).rg;
  let line = (1.0 - smoothstep(0.5, 1.1, abs(fract(at.y / LATTICE_PX) - 0.5) * LATTICE_PX));
  let level = (1.0 - smoothstep(0.5, 1.1, abs(fract(at.y / TITHE_PX) - 0.5) * TITHE_PX));
  let crystal = LATTICE_ALPHA * shares.r * tint.a * sea * line;
  let flat = TITHE_ALPHA * shares.g * tint.a * sea * level;
  let hatched = crystal + flat * (1.0 - crystal);
  let hatchedRgb = LATTICE_RGB * crystal + TITHE_RGB * flat * (1.0 - crystal);
  let tinted = WASH_ALPHA * tint.a * sea;
  let washed = hatched + tinted * (1.0 - hatched);
  let washedRgb = hatchedRgb + tint.rgb / max(tint.a, 1e-4) * tinted * (1.0 - hatched);
  // The lit water brightened, and softly lined where its share crosses a half between its cells and another's.
  // A water lit lights its sea; a region lit, its land (known.y 1), brightened and lined as a water's sea is.
  let litOn = select(sea, 1.0 - sea, ink.known.y == 1u);
  let share = textureSampleLevel(lit, soft, world / size, 0.0).r * litOn;
  let edge = LIT_EDGE_ALPHA * (1.0 - smoothstep(0.1, 0.4, abs(share - 0.5))) * litOn;
  let bright = LIT_ALPHA * share;
  let lifted = bright + washed * (1.0 - bright);
  let liftedRgb = LIT_RGB * bright + washedRgb * (1.0 - bright);
  let lined = edge + lifted * (1.0 - edge);
  let linedRgb = INK_RGB * edge + liftedRgb * (1.0 - edge);
  // A locked sea and its island, darkened toward the ink under the coasts' lines.
  let shade = SHUT_ALPHA * textureSampleLevel(shut, soft, world / size, 0.0).r * select(0.0, 1.0, inside);
  let under = shade + lined * (1.0 - shade);
  let underRgb = INK_RGB * shade + linedRgb * (1.0 - shade);
  // The route and a lit coin's rings in the route's red-brown, as the sea's map rings a place a quest names.
  let course = select(0.0, max(route_at(world, at.xy), pulse_at(at.xy)), onMap);
  let over = max(alpha, 0.9 * course);
  let colour = mix(INK_RGB, ROUTE_RGB, step(alpha, course));
  let shown = over + under * (1.0 - over);
  // The words over the ink, as the pen wrote them last.
  let last = vec2i(textureDimensions(lettering)) - 1;
  let letter = textureLoad(lettering, clamp(vec2i(at.xy - ink.sheet.xy), vec2i(0), last), 0);
  let below = colour * over + underRgb * (1.0 - over);
  let total = letter.a + shown * (1.0 - letter.a);
  return vec4f((letter.rgb + below * (1.0 - letter.a)) / max(total, 1e-4), total);
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
  /** The islands shown, a bit each by their place among the outlines. */
  readonly knownIslands: number;
  /** The route's points: where each lies, metres, and how far along the route, four floats a point. */
  readonly route: Float32Array;
  /** The keepers' coins lit, their middles and radii, screen pixels, three floats each; the map's clock, seconds; and
   *  whether motion is reduced, so their rings hold still. */
  readonly pulses: { readonly coins: Float32Array; readonly seconds: number; readonly held: boolean };
  /** The parchment where it is in its rise, and its picture of words, marks and key, as large. */
  readonly parchment: Rect;
  readonly lettering: OffscreenCanvas;
  /** What of the picture changed since it was last sent to the device: all of it, a part (its pixels), or none. */
  readonly letteringPainted: 'all' | Rect | null;
}

const INK_BYTES = 112 + MOST_PULSES * 16;

export class HeldMapView {
  private readonly gpu: Gpu;
  /** The parchment and the hands, each drawn as the first person's pictures are, one drawer each so their quads'
   *  terms never share a slot within a frame. */
  private readonly sheetDrawer: FirstPersonView;
  private readonly handsDrawer: FirstPersonView;
  private readonly inking: GPURenderPipeline;
  private readonly inkUniforms: GPUBuffer;
  private readonly routeBuffer: GPUBuffer;
  private readonly wash: GPUTexture;
  private readonly hatch: GPUTexture;
  private readonly lit: GPUTexture;
  private readonly shut: GPUTexture;
  /** Whether the cells lit are a region's land, not a water. */
  private litLand = false;
  private readonly inkGroup: GPUBindGroup;
  private readonly letteringLayout: GPUBindGroupLayout;
  private readonly legsLayout: GPUBindGroupLayout;
  /** The route's legs near each of the map's tiles on the device, its buffer grown as the map does, and what they were
   *  binned from: the route's points, the view and the map's size. */
  private legs: { buffer: GPUBuffer; group: GPUBindGroup; columns: number; rows: number; from: Float32Array } | null =
    null;
  /** The parchment's picture on the device, made again when its size changes. */
  private letters: { texture: GPUTexture; group: GPUBindGroup } | null = null;
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
        { binding: 4, visibility: SHADER_STAGE.fragment, sampler: {} },
        { binding: 5, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 7, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 8, visibility: SHADER_STAGE.fragment, texture: {} },
        { binding: 9, visibility: SHADER_STAGE.fragment, texture: {} },
      ],
    });
    this.letteringLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.fragment, texture: { sampleType: 'unfilterable-float' } }],
    });
    this.legsLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: SHADER_STAGE.fragment, buffer: { type: 'read-only-storage' } }],
    });
    this.inking = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [inkLayout, this.letteringLayout, this.legsLayout] }),
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
    this.wash = texture('rgba8unorm');
    this.hatch = texture('rg8unorm');
    this.lit = texture('r8unorm');
    this.shut = texture('r8unorm');
    this.inkGroup = device.createBindGroup({
      layout: inkLayout,
      entries: [
        { binding: 0, resource: { buffer: this.inkUniforms } },
        { binding: 1, resource: distances.createView() },
        { binding: 2, resource: islands.createView() },
        { binding: 4, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
        { binding: 5, resource: { buffer: this.routeBuffer } },
        { binding: 6, resource: this.wash.createView() },
        { binding: 7, resource: this.hatch.createView() },
        { binding: 8, resource: this.lit.createView() },
        { binding: 9, resource: this.shut.createView() },
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

  /** Lays the waters' wash on the map, on the coast field's own cells (`washOf`). */
  setWash(wash: WatersWash): void {
    const { columns, rows } = this.field;
    if (wash.hatch.length !== columns * rows * 2) throw new Error('the waters’ wash is not on the coast field’s cells');
    const queue = this.gpu.device.queue;
    queue.writeTexture({ texture: this.wash }, wash.colour, { bytesPerRow: columns * 4 }, [columns, rows]);
    queue.writeTexture({ texture: this.hatch }, wash.hatch, { bytesPerRow: columns * 2 }, [columns, rows]);
  }

  /** Lights the water under the pointer, or with `land` a region's land: a byte a cell on the coast field's own
   *  cells (`litCells`, `regionCells`). */
  setLit(cells: Uint8Array, land = false): void {
    const { columns, rows } = this.field;
    if (cells.length !== columns * rows) throw new Error('the lit water is not on the coast field’s cells');
    this.litLand = land;
    this.gpu.device.queue.writeTexture({ texture: this.lit }, cells, { bytesPerRow: columns }, [columns, rows]);
  }

  /** Darkens the locked seas and their islands: a byte a cell on the coast field's own cells (`shutCells`). */
  setShut(cells: Uint8Array): void {
    const { columns, rows } = this.field;
    if (cells.length !== columns * rows) throw new Error('the locked seas are not on the coast field’s cells');
    this.gpu.device.queue.writeTexture({ texture: this.shut }, cells, { bytesPerRow: columns }, [columns, rows]);
  }

  /** The parchment's picture copied to the device, its texture made again only when its size changes, and of the
   *  picture only what was painted (`painted`) sent, all of it into a texture made anew. */
  private lettersOf(
    picture: OffscreenCanvas,
    painted: 'all' | Rect | null,
  ): { texture: GPUTexture; group: GPUBindGroup } {
    const { device } = this.gpu;
    const size: [number, number] = [Math.max(1, picture.width), Math.max(1, picture.height)];
    let letters = this.letters;
    const made = !letters || letters.texture.width !== size[0] || letters.texture.height !== size[1];
    if (!letters || made) {
      letters?.texture.destroy();
      const texture = device.createTexture({
        size,
        format: 'rgba8unorm',
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination | TEXTURE_USAGE.renderAttachment,
      });
      const group = device.createBindGroup({
        layout: this.letteringLayout,
        entries: [{ binding: 0, resource: texture.createView() }],
      });
      letters = this.letters = { texture, group };
    }
    // Only what was painted goes to the device: under way, the few pixels round the ship's arrow.
    const part = made || painted === 'all' ? { x: 0, y: 0, width: picture.width, height: picture.height } : painted;
    if (part && part.width > 0 && part.height > 0 && picture.width > 0 && picture.height > 0)
      device.queue.copyExternalImageToTexture(
        { source: picture, origin: [part.x, part.y] },
        { texture: letters.texture, origin: [part.x, part.y], premultipliedAlpha: true },
        [part.width, part.height],
      );
    return letters;
  }

  /** The route's legs near each tile of the map (`routeTiles`), binned again and sent to the device only when the
   *  route, the view or the map's size has changed. */
  private legsOf(
    route: Float32Array,
    points: number,
    view: HeldMapFrame['view'],
    ink: Rect,
  ): { group: GPUBindGroup; columns: number; rows: number } {
    const from = new Float32Array([
      ...route.subarray(0, points * 4),
      view.left,
      view.top,
      view.scale,
      ink.width,
      ink.height,
    ]);
    const kept = this.legs;
    if (kept && kept.from.length === from.length && kept.from.every((value, index) => value === from[index]))
      return kept;
    const { columns, rows, masks } = routeTiles(route, points, view, ink);
    let { buffer, group } = kept ?? {};
    if (!buffer || !group || buffer.size < masks.byteLength) {
      buffer?.destroy();
      buffer = this.gpu.device.createBuffer({
        size: Math.max(256, masks.byteLength * 2),
        usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination,
      });
      group = this.gpu.device.createBindGroup({
        layout: this.legsLayout,
        entries: [{ binding: 0, resource: { buffer } }],
      });
    }
    this.gpu.device.queue.writeBuffer(buffer, 0, masks);
    this.legs = { buffer, group, columns, rows, from };
    return this.legs;
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
      ...[view.left, view.top, view.scale, 0],
      ...[this.field.columns, this.field.rows, this.field.cellM, 0],
    ]);
    const legs = this.legsOf(frame.route, points, view, ink);
    new Uint32Array(uniforms, 64, 4).set([frame.knownIslands >>> 0, this.litLand ? 1 : 0, legs.columns, legs.rows]);
    const { parchment } = frame;
    new Float32Array(uniforms, 80, 4).set([parchment.x, parchment.y, parchment.width, parchment.height]);
    const { coins, seconds, held } = frame.pulses;
    const lit = Math.min(MOST_PULSES, Math.floor(coins.length / 3));
    new Float32Array(uniforms, 96, 4).set([lit, seconds, held ? 1 : 0, 0]);
    const pulses = new Float32Array(uniforms, 112, MOST_PULSES * 4);
    for (let coin = 0; coin < lit; coin++) pulses.set(coins.subarray(coin * 3, coin * 3 + 3), coin * 4);
    const letters = this.lettersOf(frame.lettering, frame.letteringPainted);
    device.queue.writeBuffer(this.inkUniforms, 0, uniforms);
    this.sheetDrawer.draw(encoder, target, screen.width, screen.height, [sheetQuad]);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(this.inking);
    pass.setBindGroup(0, this.inkGroup);
    pass.setBindGroup(1, letters.group);
    pass.setBindGroup(2, legs.group);
    pass.draw(6);
    pass.end();
    this.handsDrawer.draw(encoder, target, screen.width, screen.height, [handsQuad]);
  }
}
