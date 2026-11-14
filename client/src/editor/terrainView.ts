import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import type { CellRect } from './landMask.ts';
import { viewProjection, type Orbit } from './orbit.ts';

/**
 * One landmass window's terrain, one value a cell, row by row from the north-west. Heights in metres: land at 1 or
 * more, the seabed at -2 or less. `lakes` holds a lake's surface in metres, 0 where there is none; `rivers` is 1
 * where a river runs through the cell. A cell is `cellM` metres square.
 */
export interface TerrainData {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  readonly heights: Float32Array;
  readonly lakes: Float32Array;
  readonly rivers: Uint8Array;
}

/** What one frame shows besides the terrain. `brush` is a circle on the ground in metres, or null for none. */
export interface TerrainOptions {
  readonly exaggeration: number;
  readonly brush: { readonly x: number; readonly y: number; readonly radiusM: number } | null;
}

/** The most mesh vertices along the window's longer side; past it the mesh skips cells, keeping about 1.2 million. */
const MESH_SIDE = 1100;

const UNIFORM_BYTES = 96;

/**
 * The mesh is built in the vertex shader from the vertex index alone: a grid of quads, two triangles each, one
 * vertex every `step` cells at that cell's centre. Water sits on the mesh at its surface (the sea at 0); the
 * fragment shader tells land from lake from sea by the bed height and lake surface it is given.
 */
const SHADER = /* wgsl */ `
struct View {
  view_projection: mat4x4f,
  brush_centre: vec2f,
  brush_radius: f32,
  exaggeration: f32,
  cell_m: f32,
  step: u32,
  quads_x: u32,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var heights: texture_2d<f32>;
@group(0) @binding(2) var lakes: texture_2d<f32>;
@group(0) @binding(3) var rivers: texture_2d<u32>;

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) world: vec2f,
  @location(1) bed: f32,
  @location(2) lake: f32,
  @location(3) normal: vec3f,
  @location(4) slope: f32,
};

const CORNERS = array<vec2i, 6>(vec2i(0, 0), vec2i(1, 0), vec2i(0, 1), vec2i(0, 1), vec2i(1, 0), vec2i(1, 1));
const SUN = vec3f(-0.5417, 0.5417, 0.6428);
const AMBIENT = 0.35;
const LOWLAND = vec3f(0.30, 0.48, 0.22);
const HIGHLAND = vec3f(0.50, 0.40, 0.27);
const ROCK = vec3f(0.48, 0.47, 0.45);
const SNOW = vec3f(0.94, 0.95, 0.97);
const SHALLOW_SEA = vec3f(0.16, 0.40, 0.58);
const DEEP_SEA = vec3f(0.03, 0.09, 0.24);
const LAKE = vec3f(0.22, 0.52, 0.68);
const RIVER = vec3f(0.18, 0.42, 0.72);
const RING = vec3f(1.0, 0.95, 0.70);

fn last_cell() -> vec2i {
  return vec2i(textureDimensions(heights)) - 1;
}

fn top_at(cell: vec2i) -> f32 {
  return max(max(textureLoad(heights, cell, 0).r, textureLoad(lakes, cell, 0).r), 0.0);
}

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> Surface {
  let stride = i32(view.step);
  let quad = vec2i(i32((index / 6u) % view.quads_x), i32((index / 6u) / view.quads_x));
  let last = last_cell();
  let cell = min((quad + CORNERS[index % 6u]) * stride, last);

  let west = max(cell - vec2i(stride, 0), vec2i(0));
  let east = min(cell + vec2i(stride, 0), last);
  let north = max(cell - vec2i(0, stride), vec2i(0));
  let south = min(cell + vec2i(0, stride), last);
  let span = max(vec2f(f32(east.x - west.x), f32(south.y - north.y)), vec2f(1.0)) * view.cell_m;
  let gradient = vec2f(top_at(east) - top_at(west), top_at(south) - top_at(north)) / span;

  var surface: Surface;
  surface.world = (vec2f(cell) + 0.5) * view.cell_m;
  surface.bed = textureLoad(heights, cell, 0).r;
  surface.lake = textureLoad(lakes, cell, 0).r;
  surface.normal = normalize(vec3f(-gradient * view.exaggeration, 1.0));
  surface.slope = length(gradient);
  surface.clip = view.view_projection * vec4f(surface.world, top_at(cell) * view.exaggeration, 1.0);
  return surface;
}

fn land_colour(bed: f32, slope: f32) -> vec3f {
  let ground = mix(LOWLAND, HIGHLAND, smoothstep(200.0, 1600.0, bed));
  let bare = mix(ground, ROCK, smoothstep(0.25, 0.5, slope));
  return mix(bare, SNOW, smoothstep(2100.0, 2300.0, bed));
}

@fragment
fn fragment_main(surface: Surface) -> @location(0) vec4f {
  let from_brush = distance(surface.world, view.brush_centre);
  let ring_width = fwidth(from_brush);

  var colour: vec3f;
  var normal = vec3f(0.0, 0.0, 1.0);
  if (surface.lake > 0.0 && surface.lake > surface.bed) {
    colour = LAKE;
  } else if (surface.bed < 0.0) {
    colour = mix(SHALLOW_SEA, DEEP_SEA, smoothstep(0.0, 3000.0, -surface.bed));
  } else {
    colour = land_colour(surface.bed, surface.slope);
    normal = normalize(surface.normal);
    let cell = clamp(vec2i(floor(surface.world / view.cell_m)), vec2i(0), last_cell());
    if (textureLoad(rivers, cell, 0).r != 0u) { colour = mix(colour, RIVER, 0.7); }
  }
  colour *= AMBIENT + (1.0 - AMBIENT) * max(dot(normal, SUN), 0.0);

  if (view.brush_radius > 0.0 && abs(from_brush - view.brush_radius) < ring_width) { colour = RING; }
  return vec4f(colour, 1.0);
}
`;

/** Draws one landmass's terrain in 3D with WebGPU: three textures of cell values and a mesh made on the GPU. */
export class TerrainView {
  private readonly gpu: Gpu;
  private readonly width: number;
  private readonly height: number;
  private readonly cellM: number;
  private readonly step: number;
  private readonly quadsX: number;
  private readonly vertexCount: number;
  private readonly heights: GPUTexture;
  private readonly lakes: GPUTexture;
  private readonly rivers: GPUTexture;
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private depth: GPUTexture | null = null;

  constructor(gpu: Gpu, data: TerrainData) {
    this.gpu = gpu;
    this.width = data.width;
    this.height = data.height;
    this.cellM = data.cellM;
    this.step = Math.ceil(Math.max(data.width, data.height) / MESH_SIDE);
    this.quadsX = Math.ceil((data.width - 1) / this.step);
    this.vertexCount = this.quadsX * Math.ceil((data.height - 1) / this.step) * 6;
    const { device } = gpu;
    const cellTexture = (format: GPUTextureFormat) =>
      device.createTexture({
        size: [data.width, data.height],
        format,
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
      });
    this.heights = cellTexture('r32float');
    this.lakes = cellTexture('r32float');
    this.rivers = cellTexture('r8uint');
    this.uniforms = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    const module = device.createShaderModule({ code: SHADER });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vertex_main' },
      fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.heights.createView() },
        { binding: 2, resource: this.lakes.createView() },
        { binding: 3, resource: this.rivers.createView() },
      ],
    });
    this.update(data, null);
  }

  /**
   * Sends changed cells to the GPU: a rectangle after an edit, or everything when `rect` is null. `data` is the
   * same window the view was made for, with new values.
   */
  update(data: TerrainData, rect: CellRect | null): void {
    const { left, top, right, bottom } = rect ?? { left: 0, top: 0, right: this.width, bottom: this.height };
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;
    const { queue } = this.gpu.device;
    const first = top * this.width + left;
    const sources = [
      [this.heights, data.heights],
      [this.lakes, data.lakes],
      [this.rivers, data.rivers],
    ] as const;
    for (const [texture, values] of sources) {
      const bytes = values.BYTES_PER_ELEMENT;
      const layout = { offset: first * bytes, bytesPerRow: this.width * bytes, rowsPerImage: height };
      queue.writeTexture({ texture, origin: [left, top] }, values, layout, [width, height]);
    }
  }

  /** Draws one frame into the canvas, `width` by `height` pixels, seen from `orbit`. */
  draw(orbit: Orbit, width: number, height: number, options: TerrainOptions): void {
    const { device, context } = this.gpu;
    const target = context.getCurrentTexture();
    if (!this.depth || this.depth.width !== target.width || this.depth.height !== target.height) {
      this.depth?.destroy();
      this.depth = device.createTexture({
        size: [target.width, target.height],
        format: 'depth24plus',
        usage: TEXTURE_USAGE.renderAttachment,
      });
    }

    const values = new ArrayBuffer(UNIFORM_BYTES);
    const floats = new Float32Array(values);
    floats.set(viewProjection(orbit, width / height));
    const brush = options.brush ?? { x: 0, y: 0, radiusM: 0 };
    floats.set([brush.x, brush.y, brush.radiusM, options.exaggeration, this.cellM], 16);
    new Uint32Array(values).set([this.step, this.quadsX], 21);
    device.queue.writeBuffer(this.uniforms, 0, values);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: target.createView(), clearValue: [0.04, 0.05, 0.08, 1], loadOp: 'clear', storeOp: 'store' },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(this.vertexCount);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
