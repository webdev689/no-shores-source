import { BUFFER_USAGE, TEXTURE_USAGE, type Gpu } from '../gpu.ts';
import { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { SLOW_CLOCK_S, stillLevels } from '../water/shore.ts';
import { ANCHOR_M, wideTexels } from '../water/waterCommon.ts';
import { SAMPLES } from '../water/waterView.ts';
import { CLIPMAP_LEVELS, CLIPMAP_QUADS, type ClipLevel } from './clipmap.ts';
import {
  FINE_SQUARE_M,
  type GroundPaint,
  paintFormat,
  TILE_LAYERS,
  TILE_M,
  TILE_TURN,
  WIDE_TILE_M,
} from './groundColour.ts';
import { SHADER } from './terrainShader.ts';
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

const UNIFORM_FLOATS = 68 + CLIPMAP_LEVELS * 8;
/** The low ground and snow line drawn for a landmass with no biome. */
const DEFAULT_GROUND = [0.3, 0.48, 0.22] as const;
const DEFAULT_SNOW_M = 2300;

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
  /** What is laid on the land, painted (GroundPaint), or a blank texel with none; where it lies. */
  private paint: GPUTexture;
  private paintPlace: readonly [number, number, number, number] = [0, 0, 1, 0];
  /** The middle ground's heights (showMiddle), or a blank texel with none, and its corner and step. */
  private middle: GPUTexture;
  private middlePlace: { readonly corner: readonly [number, number]; readonly step: number } | null = null;
  private readonly paintSampler: GPUSampler;
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
    this.paint = this.texture(1, 1, 'rg8unorm');
    this.middle = this.texture(1, 1, 'r32float');
    this.paintSampler = gpu.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
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
        { binding: 9, resource: this.paint.createView() },
        { binding: 10, resource: this.paintSampler },
        { binding: 11, resource: this.middle.createView() },
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

  /**
   * Shows the ground sampled `step` metres apart over a wide square round the eye (its north-west sample at `corner`,
   * window metres), between the close-up and the 1 km land, so the land's carving reads from kilometres off; or none.
   */
  showMiddle(middle: { corner: readonly [number, number]; step: number; size: number; heights: Float32Array } | null) {
    this.middle.destroy();
    this.middle = this.texture(middle?.size ?? 1, middle?.size ?? 1, 'r32float');
    if (middle) {
      const { queue } = this.gpu.device;
      queue.writeTexture({ texture: this.middle }, middle.heights, { bytesPerRow: middle.size * 4 }, [
        middle.size,
        middle.size,
      ]);
    }
    this.middlePlace = middle ? { corner: middle.corner, step: middle.step } : null;
    this.bindGroup = this.bind();
  }

  /** Draws what is laid on the land as painted from now on, or nothing painted. */
  paintGround(paint: GroundPaint | null): void {
    this.paint.destroy();
    this.paint = this.texture(paint?.width ?? 1, paint?.height ?? 1, paintFormat(paint?.channels ?? 2));
    if (paint) {
      const { queue } = this.gpu.device;
      queue.writeTexture({ texture: this.paint }, paint.texels, { bytesPerRow: paint.width * paint.channels }, [
        paint.width,
        paint.height,
      ]);
    }
    this.paintPlace = paint ? [paint.west, paint.north, 1 / paint.texelM, 1] : [0, 0, 1, 0];
    this.bindGroup = this.bind();
  }

  /** Gives the GPU back this view's textures and buffers; the view draws nothing after. */
  destroy(): void {
    const owned = [this.wide, this.lakes, this.marks, this.plainTiles, this.paint, this.middle, this.uniforms];
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
    floats.set(this.paintPlace, 56);
    const square = (value: number) => value - Math.floor(value / FINE_SQUARE_M) * FINE_SQUARE_M;
    floats.set([square(worldX), square(worldY), 0, 0], 64);
    const middle = this.middlePlace;
    floats.set(middle ? [eyeX - middle.corner[0], eyeY - middle.corner[1], middle.step, 1] : [0, 0, 1, 0], 60);
    for (const [index, ring] of frame.rings.entries()) {
      const [steps, origin] = [finest?.spacing ?? ring.spacing, finest?.corner ?? ring.corner];
      const lattice = [(ring.corner[0] - origin[0]) / steps, (ring.corner[1] - origin[1]) / steps];
      floats.set([...lattice, ring.spacing / steps, 0], 68 + index * 8);
      floats.set([...(ring.hole ?? [0, 0]), ring.hole ? 1 : 0, 0], 72 + index * 8);
    }
    this.gpu.device.queue.writeBuffer(this.uniforms, 0, floats);
  }

  /** Draws the terrain into a pass whose uniforms `prepare` wrote, in the sun's shadows when a map is given. */
  drawInto(pass: GPURenderPassEncoder, shadow?: ShadowMap): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipeline));
    skyUniformFor(this.gpu.device).bindAuto(pass, this.pipeline, [2]);
    pass.draw(CLIPMAP_QUADS * CLIPMAP_QUADS * 6, CLIPMAP_LEVELS);
  }
}
