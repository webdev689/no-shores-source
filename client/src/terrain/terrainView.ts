import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { SHADOW_WGSL, ShadowMap } from '../shadow.ts';
import { SLOW_CLOCK_S, stillLevels } from '../water/shore.ts';
import { ANCHOR_M, SHARED_WGSL, wideTexels } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { CLIPMAP_LEVELS, CLIPMAP_QUADS, type ClipLevel } from './clipmap.ts';
import { GROUND_COLOUR_WGSL, TILE_LAYERS, TILE_M, TILE_TURN, WIDE_TILE_M } from './groundColour.ts';
/** A rectangle of whole cells, right and bottom exclusive. */
export interface CellRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * One landmass window's terrain, one value a cell, row by row from the north-west. Heights in metres: land at 1 or
 * more, the seabed at -2 or less. `lakes` holds a lake's surface in metres, 0 where there is none; `marks` holds
 * what each cell is marked with (marks.ts MARK): rivers, roads, towns, ports. A cell is `cellM` metres square.
 */
export interface TerrainData {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  readonly heights: Float32Array;
  /** Each cell centre's distance from the painted coast, metres, positive on land. */
  readonly coast: Float32Array;
  /** Each cell's height carried over the coast from the other side (ground.rs). */
  readonly across: Float32Array;
  readonly lakes: Float32Array;
  readonly marks: Uint8Array;
  /** The biome's low ground (0..1) and snow line in metres; the default green and 2,300 m without one. */
  readonly ground?: readonly [number, number, number];
  readonly snowM?: number;
  /** The window's north-west corner in world metres, where the woods' grove field is read. */
  readonly leftM?: number;
  readonly topM?: number;
  /** The biome's woods (nature's woodsOf), coloured on the land past the reach of its drawn trees; none without. */
  readonly woods?: {
    readonly canopy: readonly [number, number, number];
    readonly cover: number;
    readonly gather: number;
  };
}

/** The exact ground round the camera's target: samples `step` metres apart, sample (0, 0) at `corner` (window
 *  metres); each sample's height, its still water (shore.ts stillLevels, two floats) and its mark (3 road, 4 town,
 *  5 port). */
export interface CloseUpData {
  readonly corner: readonly [number, number];
  readonly step: number;
  readonly width: number;
  readonly height: number;
  readonly heights: Float32Array;
  readonly levels: Float32Array;
  readonly marks: Uint8Array;
}

/** What one frame shows besides the terrain. `brush` is a circle on the ground in metres, or null for none. */
export interface TerrainOptions {
  readonly exaggeration: number;
  readonly brush: { readonly x: number; readonly y: number; readonly radiusM: number } | null;
}

/** The camera a frame is drawn from: its view-projection of points measured from its eye, the eye in window metres
 *  (height as drawn), the moment in seconds, and the rings of land round the eye. */
export interface TerrainFrame {
  readonly fromEye: Float32Array;
  readonly eye: readonly [number, number, number];
  readonly time: number;
  readonly rings: readonly ClipLevel[];
  /** The farthest the camera draws, metres, and the angle one pixel spans, radians. */
  readonly far: number;
  readonly pixelAngle: number;
}

const UNIFORM_FLOATS = 56 + CLIPMAP_LEVELS * 8;
/** The low ground and snow line drawn for a landmass with no biome. */
const DEFAULT_GROUND = [0.3, 0.48, 0.22] as const;
const DEFAULT_SNOW_M = 2300;

/**
 * The land is drawn as rings round the eye (clipmap.ts), from the vertex index and the ring alone. A ring's heights
 * are read along Catmull-Rom splines through the samples, the close-up's eased into the 1 km land's, so a coast or a
 * bank is a smooth curve wherever the vertices fall. Toward a ring's edge its odd vertices slide onto the next ring's
 * grid, so the rings meet without a crack; the quads under the finer ring are left empty. Every ring's vertices lie on
 * one lattice of the finest ring's steps, counted in whole numbers from its corner, so a vertex two rings share is the
 * same point to the bit. It is the bed: the water is drawn over it afterwards, from the same splines. Points are
 * measured from the eye, and from the noise's anchor.
 */
const SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${GROUND_COLOUR_WGSL}

struct View {
  from_eye: mat4x4f,
  brush: vec4f,
  eye: vec4f,
  local: vec4f,
  close: vec4f,
  wide: vec4f,
  ground: vec4f,
  // The finest ring's corner from the eye, and its step: the lattice every ring's corner and step count in.
  lattice: vec4f,
  // The biome's woods: their canopy's colour and cover; and the window's corner in world metres, and how strongly
  // the woods gather in the groves.
  woods: vec4f,
  world: vec4f,
  // Where the noise's anchor falls in the tiles, as fractions of a tile: the plain reading, then the wide turned one.
  tiles: vec4f,
  rings: array<vec4f, ${CLIPMAP_LEVELS * 2}>,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var wide_heights: texture_2d<f32>;
@group(0) @binding(2) var wide_lakes: texture_2d<f32>;
@group(0) @binding(3) var wide_marks: texture_2d<u32>;
@group(0) @binding(4) var close_heights: texture_2d<f32>;
@group(0) @binding(5) var close_levels: texture_2d<f32>;
@group(0) @binding(6) var close_marks: texture_2d<u32>;
@group(0) @binding(7) var ground_tiles: texture_2d_array<f32>;
@group(0) @binding(8) var tile_sampler: sampler;

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) offset: vec2f,
  // The mesh's height here: the ground at its vertices, straight between them.
  @location(1) bed: f32,
};


const QUADS = ${CLIPMAP_QUADS}u;
const CORNERS = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
const NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const AMBIENT = 0.35;
const RIVER = vec3f(0.18, 0.42, 0.72);
const ROAD = vec3f(0.62, 0.48, 0.30);
const TOWN = vec3f(0.75, 0.30, 0.22);
const PORT = vec3f(0.95, 0.95, 0.90);
const RING = vec3f(1.0, 0.95, 0.70);

fn wide_at(offset: vec2f) -> vec2f {
  return (view.eye.xy + offset) / view.wide.x - 0.5;
}

fn close_at(offset: vec2f) -> vec2f {
  return (offset + view.local.zw) / view.close.x;
}

@vertex
fn vertex_main(@builtin(vertex_index) index: u32, @builtin(instance_index) ring: u32) -> Surface {
  var surface: Surface;
  let first = view.rings[ring * 2u];
  let hole = view.rings[ring * 2u + 1u];
  let spacing = first.z * view.lattice.z;
  let corner = view.lattice.xy + first.xy * view.lattice.z;
  let quad = vec2u((index / 6u) % QUADS, (index / 6u) / QUADS);
  let finer = vec2f(quad) - hole.xy;
  if (hole.z > 0.5 && all(finer >= vec2f(0.0)) && all(finer < vec2f(f32(QUADS / 2u)))) {
    surface.clip = NOWHERE;
    return surface;
  }
  // Quads off the window, or past the far plane, hold nothing to draw.
  let near_corner = view.eye.xy + corner + vec2f(quad) * spacing;
  let nearest = clamp(vec2f(0.0), corner + vec2f(quad) * spacing, corner + vec2f(quad + 1u) * spacing);
  if (any(near_corner + spacing < vec2f(0.0)) || any(near_corner > view.close.zw) || length(nearest) > view.wide.y) {
    surface.clip = NOWHERE;
    return surface;
  }
  let grid = vec2f(quad + CORNERS[index % 6u]);
  let half = f32(QUADS) * 0.5;
  let reach = max(abs(grid.x - half), abs(grid.y - half)) / half;
  let morph = clamp((reach - 0.7) / 0.25, 0.0, 1.0);
  let snapped = grid - (grid - 2.0 * floor(grid * 0.5)) * morph;
  // Whole lattice steps, exact in f32, then one rounding: the same for every ring at a shared vertex.
  let offset = view.lattice.xy + (first.xy + snapped * first.z) * view.lattice.z;
  let share = close_share(close_heights, close_at(offset), view.close.y > 0.5);
  let ground = ground_at(wide_heights, wide_at(offset), view.wide.x, close_heights, close_at(offset), view.close.x, share);
  // A triangle across the coast must reach the sea's level on the painted line or inland of it, never out at sea,
  // or it would stand over water the ground lies under. So a vertex inland, within a triangle's reach of the coast,
  // is lowered as far as that asks of the lowest the sea can be at its seaward neighbour, a pixel short of the line;
  // the pixel then draws the land and the water's edge from the ground itself.
  // The coast's distance is held at COAST_REACH, so the rule fades out short of it: a ring coarser than that
  // would otherwise take all its land for coast.
  let span = spacing * (1.0 + morph) * 1.4142;
  let coast = ground.ground.w - length(vec3f(offset, ground.ground.x * view.brush.w - view.eye.z)) * view.wide.z;
  let held = 1.0 - smoothstep(0.6 * COAST_REACH, 0.9 * COAST_REACH, ground.ground.w);
  var bed = ground.ground.x;
  if (coast < span && ground.ground.w > 0.0 && held > 0.0) {
    let seaward = -coast_meet(ground.sides.x, ground.sides.y, ground.ground.w - span);
    bed = mix(bed, min(bed, coast * max(seaward, 0.0) / max(span - coast, 1e-3)), held);
  }
  // Round fresh water the same holds: a vertex within a step's rise (4 m at most) of a lake's or a river's level
  // sinks under it.
  let still = still_at(wide_lakes, wide_at(offset), close_levels, close_at(offset), share);
  let rise = min(length(ground.ground.yz) * span, 4.0);
  if (still.y > 0.5) {
    bed = min(bed, mix(still.z - FRESH_SINK, bed, smoothstep(1.0, 2.0, (bed - still.z) / max(rise, 1e-3))));
  }
  // Under the water and just above it, where its swash runs, the mesh lies a step's rise (half a metre at most)
  // under the ground, so a triangle cutting across the ground never hides the thin water over it.
  bed -= (min(rise, 0.5) + 0.02) * (1.0 - smoothstep(2.0, 3.0, bed - still.z));
  surface.offset = offset;
  surface.bed = bed;
  surface.clip = view.from_eye * vec4f(offset, bed * view.brush.w - view.eye.z, 1.0);
  return surface;
}

// Each pixel reads the ground under it, not the mesh: far off a ring's triangles are kilometres across, and only
// place the pixel. Its light and colour come from the ground itself, and the water draws its edge against it too.
@fragment
fn fragment_main(surface: Surface) -> @location(0) vec4f {
  let point = view.eye.xy + surface.offset;
  let local = surface.offset + view.local.xy;
  let from_brush = distance(point, view.brush.xy);
  let ring_width = max(fwidth(from_brush), 1e-3);
  let close = close_at(surface.offset);
  let wide = wide_at(surface.offset);
  let share = close_share(close_heights, close, view.close.y > 0.5);
  let ground = ground_at(wide_heights, wide, view.wide.x, close_heights, close, view.close.x, share).ground;
  let bed = ground.x;
  let slope = length(ground.yz);
  let still = still_at(wide_lakes, wide, close_levels, close, share);
  // A pixel's footprint on the ground, metres: its angle times the distance, stretched as the view grazes; smooth
  // from triangle to triangle, unlike the mesh's own derivatives.
  let on_mesh = vec3f(surface.offset, surface.bed * view.brush.w - view.eye.z);
  let reach_to = max(length(on_mesh), 1e-4);
  let ray = on_mesh / reach_to;
  let footprint = reach_to * view.wide.z / max(abs(ray.z), 0.02);
  let fine = 1.0 - smoothstep(0.06, 0.3, footprint);
  let depth = still.x - bed;
  // The bed's colour turns to the land's across a pixel, not at a hard line, where the water's own edge is.
  let under = wet_share(depth, slope * footprint, still, share);
  let fresh = still.y > 0.5;
  let normal = normalize(vec3f(-ground.yz * view.brush.w, 1.0));

  var wet = bed_colour(max(depth, 0.0), slope, fresh);
  let light = caustics(local, view.eye.w) * fine * exp(-max(depth, 0.0) / 9.0) * smoothstep(0.0, 0.4, depth);
  wet += SUN_LIGHT * light * select(0.32, 0.12, fresh);

  let world = view.world.xy + point;
  var dry = wooded(land_colour(bed, slope, ground.w, world, local, normal), world, bed, slope, reach_to);
  let in_close = share > 0.5;
  dry = mix(dry, RIVER, 0.7 * select(marked(wide_marks, wide, 1u, 2u), 0.0, in_close));
  let road = select(marked(wide_marks, wide, 3u, 3u), marked(close_marks, close, 3u, 3u), in_close);
  let town = select(marked(wide_marks, wide, 4u, 4u), marked(close_marks, close, 4u, 4u), in_close);
  let port = select(marked(wide_marks, wide, 5u, 5u), marked(close_marks, close, 5u, 5u), in_close);
  dry = mix(mix(mix(dry, ROAD * tile_grain(DIRT_TILE, local), road), TOWN, 0.6 * town), PORT, port);

  var colour = mix(dry, wet, under);
  let direct = max(dot(normal, SUN), 0.0);
  let on_ground = vec3f(surface.offset, bed * view.brush.w - view.eye.z);
  let sun = select(1.0, sunlit(on_ground, normal), direct > 0.0);
  colour *= AMBIENT + (1.0 - AMBIENT) * direct * sun;
  let ring = 1.0 - smoothstep(0.0, ring_width * 1.5, abs(from_brush - view.brush.z));
  colour = mix(colour, RING, select(0.0, ring, view.brush.z > 0.0));

  return vec4f(colour, 1.0);
}
`;

/** Each GPU's terrain pipeline, compiled once: every landmass drawn on it shares one. */
const pipelines = new WeakMap<GPUDevice, Map<GPUTextureFormat, GPURenderPipeline>>();

function pipelineFor(gpu: Gpu): GPURenderPipeline {
  const byFormat = pipelines.get(gpu.device) ?? new Map<GPUTextureFormat, GPURenderPipeline>();
  pipelines.set(gpu.device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const module = gpu.device.createShaderModule({ code: SHADER });
  const pipeline = gpu.device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vertex_main' },
    fragment: { module, entryPoint: 'fragment_main', targets: [{ format: gpu.format }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
    multisample: { count: SAMPLES },
  });
  byFormat.set(gpu.format, pipeline);
  return pipeline;
}

/** Draws one landmass's terrain in 3D with WebGPU: its 1 km cells, the close-up's exact ground when one is shown,
 *  and rings of mesh made on the GPU round the eye. */
export class TerrainView {
  private readonly gpu: Gpu;
  private readonly width: number;
  private readonly height: number;
  private readonly cellM: number;
  private readonly ground: readonly [number, number, number];
  private readonly snowM: number;
  private readonly woods: readonly number[];
  /** The window's north-west corner in world metres. */
  private readonly corner: readonly [number, number];
  /** Plain tiles, worn until `wearTiles` is handed painted ones: every grain 1, the land in its flat colours. */
  private readonly plainTiles: GPUTexture;
  private tiles: GPUTextureView;
  private readonly tileSampler: GPUSampler;
  /** The cells for WGSL wide_ground: height, distance from the coast, height carried over it. */
  private readonly wide: GPUTexture;
  private readonly lakes: GPUTexture;
  private readonly marks: GPUTexture;
  private readonly uniforms: GPUBuffer;
  private readonly pipeline: GPURenderPipeline;
  private close: { readonly data: CloseUpData; readonly textures: readonly GPUTexture[] } | null = null;
  /** The lakes' still water, as the water reads it (stillLevels); made again when the whole window changes. */
  private banked: Float32Array | null = null;
  private bindGroup: GPUBindGroup;

  constructor(gpu: Gpu, data: TerrainData) {
    this.gpu = gpu;
    this.width = data.width;
    this.height = data.height;
    this.cellM = data.cellM;
    this.ground = data.ground ?? DEFAULT_GROUND;
    this.snowM = data.snowM ?? DEFAULT_SNOW_M;
    const woods = data.woods;
    this.woods = woods
      ? [...woods.canopy, woods.cover, data.leftM ?? 0, data.topM ?? 0, woods.gather, 0]
      : [0, 0, 0, 0, 0, 0, 0, 0];
    this.corner = [data.leftM ?? 0, data.topM ?? 0];
    this.plainTiles = gpu.device.createTexture({
      size: [1, 1, TILE_LAYERS.length],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    gpu.device.queue.writeTexture(
      { texture: this.plainTiles },
      new Uint8Array(4 * TILE_LAYERS.length).fill(255),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, TILE_LAYERS.length],
    );
    this.tiles = this.plainTiles.createView({ dimension: '2d-array' });
    this.tileSampler = gpu.device.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 8,
    });
    this.wide = this.texture(data.width, data.height, 'rgba32float');
    this.lakes = this.texture(data.width, data.height, 'rg32float');
    this.marks = this.texture(data.width, data.height, 'r8uint');
    this.uniforms = gpu.device.createBuffer({
      size: UNIFORM_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.pipeline = pipelineFor(gpu);
    this.bindGroup = this.bind();
    this.update(data, null);
  }

  private texture(width: number, height: number, format: GPUTextureFormat): GPUTexture {
    return this.gpu.device.createTexture({
      size: [width, height],
      format,
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
  }

  private bind(): GPUBindGroup {
    const [heights, levels, marks] = this.close?.textures ?? [this.wide, this.lakes, this.marks];
    const textures = [this.wide, this.lakes, this.marks, heights, levels, marks];
    return this.gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        ...textures.map((texture, index) => ({ binding: index + 1, resource: (texture ?? this.wide).createView() })),
        { binding: 7, resource: this.tiles },
        { binding: 8, resource: this.tileSampler },
      ],
    });
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
    if (!rect || !this.banked) this.banked = stillLevels(data.heights, data.lakes, null, this.width, this.height, 1);
    const texels = wideTexels(data, { left, top, right, bottom });
    queue.writeTexture({ texture: this.wide, origin: [left, top] }, texels, { bytesPerRow: width * 16 }, [
      width,
      height,
    ]);
    const sources = [
      [this.lakes, this.banked],
      [this.marks, data.marks],
    ] as const;
    for (const [texture, values] of sources) {
      const bytes = (values.length / (this.width * this.height)) * values.BYTES_PER_ELEMENT;
      const layout = { offset: first * bytes, bytesPerRow: this.width * bytes, rowsPerImage: height };
      queue.writeTexture({ texture, origin: [left, top] }, values, layout, [width, height]);
    }
  }

  /** Shows the exact ground round the camera's target in place of the 1 km cells there, or none. */
  showCloseUp(data: CloseUpData | null): void {
    for (const texture of this.close?.textures ?? []) texture.destroy();
    this.close = null;
    if (data) {
      const { queue } = this.gpu.device;
      const sources = [
        [data.heights, 'r32float', 1],
        [data.levels, 'rg32float', 2],
        [data.marks, 'r8uint', 1],
      ] as const;
      const textures = sources.map(([values, format, floats]) => {
        const texture = this.texture(data.width, data.height, format);
        const bytesPerRow = data.width * values.BYTES_PER_ELEMENT * floats;
        queue.writeTexture({ texture }, values, { bytesPerRow }, [data.width, data.height]);
        return texture;
      });
      this.close = { data, textures };
    }
    this.bindGroup = this.bind();
  }

  /** Wears the ground's painted tiles from now on: an array of TILE_LAYERS' pictures, in that order. */
  wearTiles(tiles: GPUTextureView): void {
    this.tiles = tiles;
    this.bindGroup = this.bind();
  }

  /** Gives the GPU back this view's textures and buffers; the view draws nothing after. */
  destroy(): void {
    const owned = [this.wide, this.lakes, this.marks, this.plainTiles, this.uniforms];
    for (const resource of [...owned, ...(this.close?.textures ?? [])]) {
      resource.destroy();
    }
  }

  /** The cells (wide_ground's) and lake surfaces on the GPU, for the water drawn over them, and their size, metres. */
  get cells(): { readonly wide: GPUTexture; readonly lakes: GPUTexture; readonly cellM: number } {
    return { wide: this.wide, lakes: this.lakes, cellM: this.cellM };
  }

  /** Writes this view's uniforms for one frame. */
  prepare(frame: TerrainFrame, options: TerrainOptions): void {
    const floats = new Float32Array(UNIFORM_FLOATS);
    floats.set(frame.fromEye);
    const brush = options.brush ?? { x: 0, y: 0, radiusM: 0 };
    floats.set([brush.x, brush.y, brush.radiusM, options.exaggeration], 16);
    const [eyeX, eyeY, eyeZ] = frame.eye;
    floats.set([eyeX, eyeY, eyeZ, frame.time % SLOW_CLOCK_S], 20);
    const anchor = [Math.floor(eyeX / ANCHOR_M) * ANCHOR_M, Math.floor(eyeY / ANCHOR_M) * ANCHOR_M] as const;
    const close = this.close?.data;
    const fromClose = close ? [eyeX - close.corner[0], eyeY - close.corner[1]] : [0, 0];
    floats.set([eyeX - anchor[0], eyeY - anchor[1], ...fromClose], 24);
    floats.set([close?.step ?? 1, close ? 1 : 0, this.width * this.cellM, this.height * this.cellM], 28);
    floats.set([this.cellM, frame.far, frame.pixelAngle, 0], 32);
    floats.set([...this.ground, this.snowM], 36);
    const finest = frame.rings[0];
    if (finest) floats.set([finest.corner[0] - eyeX, finest.corner[1] - eyeY, finest.spacing, 0], 40);
    floats.set(this.woods, 44);
    // The anchor in world metres, in double precision here: the shader reads the tiles from it in single.
    const [worldX, worldY] = [anchor[0] + this.corner[0], anchor[1] + this.corner[1]];
    const [cos, sin] = [Math.cos(TILE_TURN), Math.sin(TILE_TURN)];
    const fraction = (value: number) => value - Math.floor(value);
    floats.set(
      [
        fraction(worldX / TILE_M),
        fraction(worldY / TILE_M),
        fraction((cos * worldX - sin * worldY) / WIDE_TILE_M),
        fraction((sin * worldX + cos * worldY) / WIDE_TILE_M),
      ],
      52,
    );
    for (const [index, ring] of frame.rings.entries()) {
      const [steps, origin] = [finest?.spacing ?? ring.spacing, finest?.corner ?? ring.corner];
      const lattice = [(ring.corner[0] - origin[0]) / steps, (ring.corner[1] - origin[1]) / steps];
      floats.set([...lattice, ring.spacing / steps, 0], 56 + index * 8);
      floats.set([...(ring.hole ?? [0, 0]), ring.hole ? 1 : 0, 0], 60 + index * 8);
    }
    this.gpu.device.queue.writeBuffer(this.uniforms, 0, floats);
  }

  /** Draws the terrain into a pass whose uniforms `prepare` wrote, in the sun's shadows when a map is given. */
  drawInto(pass: GPURenderPassEncoder, shadow?: ShadowMap): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipeline));
    pass.draw(CLIPMAP_QUADS * CLIPMAP_QUADS * 6, CLIPMAP_LEVELS);
  }
}
