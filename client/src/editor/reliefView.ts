import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import type { LandView } from '../rules/landRules.ts';
import { stillLevels } from '../water/shore.ts';
import { SHARED_WGSL, wideTexels } from '../water/waterCommon.ts';
import type { Camera } from './camera.ts';
import type { CellRect } from './landMask.ts';

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
 *  each cell's mark (rivers, roads, towns, ports), the frame's edge and the brush. */
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
  unused: f32,
  ground: vec4f,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var heights: texture_2d<f32>;
@group(0) @binding(2) var lakes: texture_2d<f32>;
@group(0) @binding(3) var marks: texture_2d<u32>;

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

/** Draws one landmass's relief with WebGPU: three textures of its cells, one full-screen pass. */
export class ReliefView {
  private readonly gpu: Gpu;
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private textures: { heights: GPUTexture; lakes: GPUTexture; marks: GPUTexture } | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private land: LandView | null = null;
  /** The lakes' still water (shore.ts stillLevels), made again when the whole window is sent. */
  private banked: Float32Array | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    this.uniforms = device.createBuffer({ size: 80, usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination });
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

  /** Draws one frame into the canvas, `width` by `height` pixels. */
  draw(scene: ReliefScene, width: number, height: number): void {
    const { device, context } = this.gpu;
    const land = this.land;
    const floats = new Float32Array(20);
    floats.set([scene.camera.centreX, scene.camera.centreY, width, height]);
    if (land) floats.set([land.leftM, land.topM, land.width * land.cellM, land.height * land.cellM], 4);
    floats.set([scene.frameWidthM, scene.frameHeightM, scene.brushX, scene.brushY], 8);
    floats.set([scene.camera.metresPerPixel, land?.cellM ?? 1000, scene.brushRadiusM, 0], 12);
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
