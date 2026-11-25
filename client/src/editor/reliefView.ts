import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import type { LandView } from '../rules/landRules.ts';
import { stillLevels } from '../water/shore.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { wideTexels } from '../water/wideTexels.ts';
import type { Camera } from './camera.ts';
import type { CellRect } from './landMask.ts';
import { MOST_TILES, TILE_SAMPLES, TILE_STEPS, type Tile } from './reliefTiles.ts';

/** The low ground and snow line drawn for a landmass with no biome. */
const DEFAULT_GROUND = [0.33, 0.52, 0.29] as const;
const DEFAULT_SNOW_M = 2300;

/** What one frame of the relief map shows besides the land. */
export interface ReliefScene {
  readonly camera: Camera;
  readonly frameWidthM: number;
  readonly frameHeightM: number;
  readonly brushX: number;
  readonly brushY: number;
  /** Zero hides the brush. */
  readonly brushRadiusM: number;
}

/** One full-screen pass over a landmass's window: the seabed by depth, the land by height under a hillshade, lakes,
 *  each cell's mark (rivers, roads, towns, ports), the frame's edge and the brush; where a tile of the exact ground
 *  is kept (reliefTiles.ts), the finest one over a pixel is drawn instead, its cliffs in rock, faded into the 1 km
 *  land at the kept tiles' edge. */
export const SHADER = /* wgsl */ `
${SHARED_WGSL}

struct View {
  centre: vec2f,
  viewport: vec2f,
  origin: vec2f,
  window_size: vec2f,
  frame: vec2f,
  brush: vec2f,
  metres_per_pixel: f32,
  cell_m: f32,
  brush_radius: f32,
  tile_count: f32,
  ground: vec4f,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var heights: texture_2d<f32>;
@group(0) @binding(2) var lakes: texture_2d<f32>;
@group(0) @binding(3) var marks: texture_2d<u32>;
// Each tile's samples (height, fresh water's surface, metres past its edge) and marks, one layer a tile; and each
// tile's first inner sample in metres from the view's centre, its step and its layer.
@group(0) @binding(4) var tile_ground: texture_2d_array<f32>;
@group(0) @binding(5) var tile_marks: texture_2d_array<u32>;
@group(0) @binding(6) var<storage, read> tile_table: array<vec4f, ${MOST_TILES}>;
const TILE_STEPS = ${TILE_STEPS}.0;

const OUTSIDE = vec3f(0.05, 0.05, 0.06);
const OPEN_SEA = vec3f(0.06, 0.13, 0.23);
const SHALLOW = vec3f(0.16, 0.36, 0.52);
const LAKE = vec3f(0.20, 0.45, 0.66);
const RIVER = vec3f(0.24, 0.52, 0.80);
const ROAD = vec3f(0.62, 0.48, 0.30);
const TOWN = vec3f(0.75, 0.30, 0.22);
const PORT = vec3f(0.95, 0.95, 0.90);

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}


// The low ground is the biome's (view.ground.rgb); snow lies above its snow line (view.ground.w).
fn land_colour(height: f32) -> vec3f {
  let low = view.ground.rgb;
  let hill = mix(low, vec3f(0.55, 0.58, 0.34), 0.5);
  let high = vec3f(0.52, 0.42, 0.31);
  let rock = vec3f(0.55, 0.53, 0.50);
  let snow = vec3f(0.93, 0.94, 0.96);
  var colour = mix(low, hill, smoothstep(0.0, 600.0, height));
  colour = mix(colour, high, smoothstep(600.0, 1500.0, height));
  colour = mix(colour, rock, smoothstep(1500.0, 2200.0, height));
  return mix(colour, snow, smoothstep(view.ground.w, view.ground.w + 400.0, height));
}

// The finest tile over a point, metres from the view's centre, or -1.
fn tile_over(offset: vec2f) -> i32 {
  var best = -1;
  var best_step = 1e9;
  for (var index = 0; index < i32(view.tile_count); index++) {
    let tile = tile_table[index];
    let at = (offset - tile.xy) / tile.z;
    if (all(at >= vec2f(0.0)) && all(at <= vec2f(TILE_STEPS)) && tile.z < best_step) {
      best = index;
      best_step = tile.z;
    }
  }
  return best;
}

// A tile's height, fresh water's surface and how far a point lies past that water's edge, at a point in its steps
// from its first inner sample, between the four samples round it.
fn tile_at(layer: i32, at: vec2f) -> vec3f {
  let last = vec2i(textureDimensions(tile_ground)) - 1;
  let base = floor(at) + 1.0;
  let fraction = at + 1.0 - base;
  let corner = vec2i(base);
  let a = textureLoad(tile_ground, clamp(corner, vec2i(0), last), layer, 0).rgb;
  let b = textureLoad(tile_ground, clamp(corner + vec2i(1, 0), vec2i(0), last), layer, 0).rgb;
  let c = textureLoad(tile_ground, clamp(corner + vec2i(0, 1), vec2i(0), last), layer, 0).rgb;
  let d = textureLoad(tile_ground, clamp(corner + vec2i(1, 1), vec2i(0), last), layer, 0).rgb;
  return mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
}

fn tile_marked(layer: i32, at: vec2f, first: u32, last: u32) -> f32 {
  let top = vec2i(textureDimensions(tile_marks)) - 1;
  let base = floor(at) + 1.0;
  let fraction = at + 1.0 - base;
  var cover = 0.0;
  for (var corner_index = 0; corner_index < 4; corner_index++) {
    let offset = vec2i(corner_index & 1, corner_index >> 1);
    let mark = textureLoad(tile_marks, clamp(vec2i(base) + offset, vec2i(0), top), layer, 0).r;
    let share = mix(1.0 - fraction.x, fraction.x, f32(offset.x)) * mix(1.0 - fraction.y, fraction.y, f32(offset.y));
    cover += select(0.0, share, mark >= first && mark <= last);
  }
  return smoothstep(0.3, 0.7, cover);
}

// The exact ground's colour over a tile, and how much of it shows: all of it inside the kept tiles, fading out over
// their last 48 m so a tile's edge never shows as a seam.
fn exact_colour(offset: vec2f, pixel_m: f32) -> vec4f {
  let found = tile_over(offset);
  if (found < 0) { return vec4f(0.0); }
  let tile = tile_table[found];
  let layer = i32(tile.w);
  let at = (offset - tile.xy) / tile.z;
  let here = tile_at(layer, at);
  let height = here.x;
  let slope = vec2f(
    tile_at(layer, at + vec2f(1.0, 0.0)).x - tile_at(layer, at - vec2f(1.0, 0.0)).x,
    tile_at(layer, at + vec2f(0.0, 1.0)).x - tile_at(layer, at - vec2f(0.0, 1.0)).x,
  ) / (2.0 * tile.z);
  let across = max(length(slope) * pixel_m, 1e-3);
  let normal = normalize(vec3f(-slope, 1.0));
  let shade = clamp(dot(normal, normalize(vec3f(-1.0, -1.0, 1.2))), 0.0, 1.0);
  // A face steeper than one in one is a carved cliff: rock, as the terrain lays it.
  var land = mix(land_colour(max(height, 0.0)), vec3f(0.50, 0.48, 0.46), smoothstep(0.6, 1.2, length(slope)));
  land = land * (0.4 + 0.8 * shade);
  // Fresh water by how far past its edge a point lies, so a river a few metres wide reads as water, not a tint.
  land = mix(land, RIVER, 1.0 - smoothstep(-0.5 * pixel_m, 0.5 * pixel_m, here.z));
  land = mix(mix(mix(land, ROAD, tile_marked(layer, at, 3u, 3u)), TOWN, 0.6 * tile_marked(layer, at, 4u, 4u)), PORT, tile_marked(layer, at, 5u, 5u));
  let sea = mix(SHALLOW, OPEN_SEA, smoothstep(0.0, 300.0, -height));
  let colour = mix(sea, land, smoothstep(-0.5, 0.5, height / across));
  var inside = 0.0;
  for (var ring = 1; ring <= 3; ring++) {
    let reach = f32(ring) * 16.0;
    inside += f32(tile_over(offset + vec2f(reach, 0.0)) >= 0) + f32(tile_over(offset - vec2f(reach, 0.0)) >= 0);
    inside += f32(tile_over(offset + vec2f(0.0, reach)) >= 0) + f32(tile_over(offset - vec2f(0.0, reach)) >= 0);
  }
  return vec4f(colour, inside / 12.0);
}

@fragment
fn fragment_main(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let step = view.metres_per_pixel;
  let world = view.centre + (pixel.xy - view.viewport * 0.5) * step;
  if (any(world < vec2f(0.0)) || any(world > view.frame)) {
    let edge = length(max(max(-world, world - view.frame), vec2f(0.0)));
    return vec4f(select(OUTSIDE, vec3f(0.85), edge < step * 1.5), 1.0);
  }
  let local = world - view.origin;
  if (any(local < vec2f(0.0)) || any(local >= view.window_size)) { return vec4f(OPEN_SEA, 1.0); }
  // The cells are read along the same splines the 3D view draws, and every edge (the coast, a lake's shore, a mark,
  // the brush) is softened across a pixel, so nothing shows the cells' squares.
  let at = local / view.cell_m - 0.5;
  let ground = wide_ground(heights, at).ground;
  let height = ground.x;
  let pixel_m = max(step, 1e-3);
  // How much the height changes across one pixel: the edges soften over that, not over a cell.
  let across = max(length(ground.yz) / view.cell_m * pixel_m, 1e-3);
  let sea = mix(SHALLOW, OPEN_SEA, smoothstep(0.0, 300.0, -height));
  let normal = normalize(vec3f(-0.5 * ground.yz / view.cell_m, 1.0));
  let shade = clamp(dot(normal, normalize(vec3f(-1.0, -1.0, 1.2))), 0.0, 1.0);
  var land = land_colour(max(height, 0.0)) * (0.45 + 0.75 * shade);
  // A lake's surface dips under its shore as far as the shore runs past it (shore.ts stillLevels).
  let still = grid_at(lakes, at).rg;
  let lake = still.x - max(still.y, 0.0) - height;
  land = mix(land, LAKE, smoothstep(-0.5, 0.5, lake / across) * select(0.0, 1.0, still.x > 0.0));
  land = mix(land, RIVER, 0.85 * marked(marks, at, 1u, 2u));
  land = mix(mix(mix(land, ROAD, marked(marks, at, 3u, 3u)), TOWN, 0.6 * marked(marks, at, 4u, 4u)), PORT, marked(marks, at, 5u, 5u));
  var colour = mix(sea, land, smoothstep(-0.5, 0.5, height / across));
  let exact = exact_colour((pixel.xy - view.viewport * 0.5) * step, pixel_m);
  colour = mix(colour, exact.rgb, exact.a);
  let ring = 1.0 - smoothstep(0.0, pixel_m * 1.2, abs(distance(world, view.brush) - view.brush_radius));
  colour = mix(colour, vec3f(1.0), select(0.0, ring, view.brush_radius > 0.0));
  return vec4f(colour, 1.0);
}
`;

/** The view that fits a landmass's window into the canvas with a margin. */
export function fitWindow(view: LandView, width: number, height: number): Camera {
  const [windowWidth, windowHeight] = [view.width * view.cellM, view.height * view.cellM];
  const metresPerPixel = Math.max(windowWidth / (width * 0.9), windowHeight / (height * 0.9));
  return { centreX: view.leftM + windowWidth / 2, centreY: view.topM + windowHeight / 2, metresPerPixel };
}

/** The ground's height in metres at a world point, or null off the window. */
export function heightAt(view: LandView, x: number, y: number): number | null {
  const i = Math.floor((x - view.leftM) / view.cellM);
  const j = Math.floor((y - view.topM) / view.cellM);
  if (i < 0 || j < 0 || i >= view.width || j >= view.height) return null;
  return view.heights[j * view.width + i] ?? null;
}

/** The cursor's readout: where it points, and the height of the 1 km cell there or the sea's depth. */
export function readoutAt(view: LandView | null, world: { readonly x: number; readonly y: number } | null): string {
  const ground = view && world ? heightAt(view, world.x, world.y) : null;
  if (!world || ground === null) return '';
  const kilometres = (metres: number) => Math.round(metres / 1000).toLocaleString('en-US');
  const where = `${kilometres(world.x)} km east, ${kilometres(world.y)} km south`;
  return `${where} · ${ground >= 0 ? `${Math.round(ground)} m` : `sea, ${Math.round(-ground)} m deep`}`;
}

/** Draws one landmass's relief with WebGPU: three textures of its cells, one full-screen pass. */
export class ReliefView {
  private readonly gpu: Gpu;
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private textures: { heights: GPUTexture; lakes: GPUTexture; marks: GPUTexture } | null = null;
  /** The exact ground's tiles, one layer a slot, and where each kept one lies. */
  private readonly tileGround: GPUTexture;
  private readonly tileMarks: GPUTexture;
  private readonly tileTable: GPUBuffer;
  private bindGroup: GPUBindGroup | null = null;
  private land: LandView | null = null;
  /** The lakes' still water (shore.ts stillLevels), made again when the whole window is sent. */
  private banked: Float32Array | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    this.uniforms = device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
    const layers = [TILE_SAMPLES, TILE_SAMPLES, MOST_TILES];
    const usage = TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination;
    this.tileGround = device.createTexture({ size: layers, format: 'rgba32float', usage });
    this.tileMarks = device.createTexture({ size: layers, format: 'r8uint', usage });
    this.tileTable = device.createBuffer({
      size: MOST_TILES * 16,
      usage: BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination,
    });
    const module = device.createShaderModule({ code: SHADER });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex_main' },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  /** Shows a landmass, replacing any shown before. */
  show(land: LandView, marks: Uint8Array): void {
    const { device } = this.gpu;
    this.textures?.heights.destroy();
    this.textures?.lakes.destroy();
    this.textures?.marks.destroy();
    const usage = TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination;
    const size = [land.width, land.height];
    this.textures = {
      heights: device.createTexture({ size, format: 'rgba32float', usage }),
      lakes: device.createTexture({ size, format: 'rg32float', usage }),
      marks: device.createTexture({ size, format: 'r8uint', usage }),
    };
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.textures.heights.createView() },
        { binding: 2, resource: this.textures.lakes.createView() },
        { binding: 3, resource: this.textures.marks.createView() },
        { binding: 4, resource: this.tileGround.createView({ dimension: '2d-array' }) },
        { binding: 5, resource: this.tileMarks.createView({ dimension: '2d-array' }) },
        { binding: 6, resource: { buffer: this.tileTable } },
      ],
    });
    this.land = land;
    this.update(land, marks, null);
  }

  /** Sends changed cells to the GPU: a rectangle after a brush stroke, or everything when `rect` is null. */
  update(land: LandView, marks: Uint8Array, rect: CellRect | null): void {
    if (!this.textures) return;
    this.land = land;
    const { left, top, right, bottom } = rect ?? { left: 0, top: 0, right: land.width, bottom: land.height };
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;
    const rows = (source: Float32Array | Uint8Array, per: number) => {
      const size = width * height * per;
      const out = source instanceof Float32Array ? new Float32Array(size) : new Uint8Array(size);
      for (let row = 0; row < height; row++) {
        const from = ((top + row) * land.width + left) * per;
        out.set(source.subarray(from, from + width * per), row * width * per);
      }
      return { out, bytesPerRow: width * per * source.BYTES_PER_ELEMENT };
    };
    const { queue } = this.gpu.device;
    const texels = wideTexels(land, { left, top, right, bottom });
    queue.writeTexture({ texture: this.textures.heights, origin: [left, top] }, texels, { bytesPerRow: width * 16 }, [
      width,
      height,
    ]);
    if (!rect || !this.banked) this.banked = stillLevels(land.heights, land.lakes, null, land.width, land.height, 1);
    for (const [texture, source, per] of [
      [this.textures.lakes, this.banked, 2],
      [this.textures.marks, marks, 1],
    ] as const) {
      const { out, bytesPerRow } = rows(source, per);
      queue.writeTexture({ texture, origin: [left, top] }, out, { bytesPerRow, rowsPerImage: height }, [width, height]);
    }
  }

  /** Sends a tile of the exact ground to its slot. */
  layTile(tile: Tile): void {
    const { patch, slot } = tile;
    const ground = new Float32Array(patch.width * patch.height * 4);
    for (let index = 0; index < patch.width * patch.height; index++)
      ground.set([patch.heights[index] ?? 0, patch.water[index] ?? 0, patch.edges[index] ?? 0], index * 4);
    const { queue } = this.gpu.device;
    const size = [patch.width, patch.height, 1];
    queue.writeTexture(
      { texture: this.tileGround, origin: [0, 0, slot] },
      ground,
      { bytesPerRow: patch.width * 16 },
      size,
    );
    queue.writeTexture(
      { texture: this.tileMarks, origin: [0, 0, slot] },
      patch.marks,
      { bytesPerRow: patch.width },
      size,
    );
  }

  /** Draws one frame into the canvas, `width` by `height` pixels, with the kept tiles of the exact ground. */
  draw(scene: ReliefScene, width: number, height: number, tiles: readonly Tile[] = []): void {
    const { device, context } = this.gpu;
    const land = this.land;
    // Each tile's place from the view's centre is worked out here in full precision: the shader's world positions
    // are only good to a quarter metre this far from the frame's corner.
    const table = new Float32Array(MOST_TILES * 4);
    const shownTiles = tiles.slice(0, MOST_TILES);
    shownTiles.forEach(({ left, top, step, slot }, index) =>
      table.set([left - scene.camera.centreX, top - scene.camera.centreY, step, slot], index * 4),
    );
    device.queue.writeBuffer(this.tileTable, 0, table);
    const floats = new Float32Array(20);
    floats.set([scene.camera.centreX, scene.camera.centreY, width, height]);
    if (land) floats.set([land.leftM, land.topM, land.width * land.cellM, land.height * land.cellM], 4);
    floats.set([scene.frameWidthM, scene.frameHeightM, scene.brushX, scene.brushY], 8);
    floats.set([scene.camera.metresPerPixel, land?.cellM ?? 1000, scene.brushRadiusM, shownTiles.length], 12);
    floats.set([...(land?.ground ?? DEFAULT_GROUND), land?.snowM ?? DEFAULT_SNOW_M], 16);
    device.queue.writeBuffer(this.uniforms, 0, floats);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
      ],
    });
    if (this.bindGroup) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(3);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
