import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { ShadowMap, shadowLayouts } from '../shadow.ts';
import type { Swell } from '../rules/landRules.ts';
import { RippleField } from './ripples.ts';
import { GRAVITY, SHORE, type ShoreField, SLOW_CLOCK_S } from './shore.ts';
import { type HullMask, hullValues } from './hullMask.ts';
import type { SeaGrid, SeaSwell } from './seaWeather.ts';
import { ANCHOR_M, CHOP_WAVES, MOST_WAVES } from './waterCommon.ts';
import { WATER_SHADER } from './waterShader.ts';

type Vector = readonly [number, number, number];

/** The camera the water is drawn from: its eye in window metres (height as drawn), its directions and depth range,
 *  and its view-projection of points measured from the eye. */
export interface WaterCamera {
  readonly eye: Vector;
  readonly forward: Vector;
  readonly right: Vector;
  readonly up: Vector;
  readonly near: number;
  readonly far: number;
  readonly depthScale: number;
  readonly depthOffset: number;
  readonly fromEye: Float32Array;
  readonly tanHalfView: number;
}

/** The close-up's water on the GPU: where its sample (0, 0) lies in the window and its spacing. */
export interface PatchWater {
  readonly corner: readonly [number, number];
  readonly step: number;
  readonly heights: GPUTexture;
  readonly levels: GPUTexture;
  readonly shore: GPUTexture;
}

/** One frame of water: the camera, the moment, the land under it and what has been drawn already. */
export interface WaterScene {
  readonly camera: WaterCamera;
  readonly size: readonly [number, number];
  readonly time: number;
  readonly seconds: number;
  readonly exaggeration: number;
  readonly fogM: number;
  /** The window's north-west corner in the world, metres. */
  readonly world: readonly [number, number];
  readonly swell: Swell | undefined;
  readonly coarse: { readonly wide: GPUTexture; readonly lakes: GPUTexture; readonly cellM: number };
  readonly patch: PatchWater | null;
  /** The water at the eye's point now: its surface in metres and whether it is fresh; null where there is none. */
  readonly eyeWater: { readonly surface: number; readonly fresh: boolean } | null;
  /** How high the eye stands over the water or ground under it, metres: the water's rings grow from that. */
  readonly eyeAboveM: number;
  /** Where the ripples follow, window metres. */
  readonly focus: readonly [number, number];
  /** A ship on the water: no water inside her, foam round her bow. */
  readonly hulls: readonly HullMask[];
  /** The sun's shadows this frame, which shade the surface; none drawn without. */
  readonly shadow?: ShadowMap | undefined;
  /** The land drawn so far: its colour and depth (a float a pixel) to see through, and the multisampled colour and
   *  depth the water's pass draws into, testing against the land's. */
  readonly drawn: {
    readonly colour: GPUTexture;
    readonly depth: GPUTexture;
    readonly multisampled: GPUTexture;
    readonly multidepth: GPUTexture;
  };
  readonly target: GPUTextureView;
}

/** Where the waves begin in the frame's floats, after the camera's, the eye's and the sea by weather's. */
const WAVES_AT = 72;
const HULLS_AT = WAVES_AT + MOST_WAVES * 8 + CHOP_WAVES * 4;
const FRAME_FLOATS = HULLS_AT + hullValues([], [0, 0]).length;
/** Samples taken of each pixel by the land and the water, so every edge between them is smooth. */
export const SAMPLES = 4;
/** The disc of water round the eye: rings out to the far plane, each this share wider than the last, and segments. */
const RINGS = 220;
const SEGMENTS = 192;

/** The wind's chop: twelve short waves about the wind, each a whole number of waves along ANCHOR_M so the pattern never
 *  jumps as the anchor moves. Each is (wavenumber east, south, frequency, phase). */
function chopWaves(swell: Swell | undefined): Float32Array {
  const [windX, windY] = swell?.waves[0]?.direction ?? [0, -1];
  const out = new Float32Array(CHOP_WAVES * 4);
  for (let index = 0; index < CHOP_WAVES; index++) {
    // Lengths and courses are nudged off any even step (golden-ratio turns), so the waves never lock into a grid.
    const turn = (index * 0.618_034) % 1;
    const length = 0.25 * 1.36 ** index * (0.86 + 0.28 * turn);
    const spread = (turn * 2 - 1) * 0.6;
    const way = [
      windX * Math.cos(spread) - windY * Math.sin(spread),
      windX * Math.sin(spread) + windY * Math.cos(spread),
    ];
    const cycles = way.map((part) => Math.round(((part ?? 0) * ANCHOR_M) / length));
    const [numberX, numberY] = cycles.map((count) => (2 * Math.PI * count) / ANCHOR_M);
    const number = Math.hypot(numberX ?? 0, numberY ?? 0) || (2 * Math.PI) / ANCHOR_M;
    out.set([numberX ?? number, numberY ?? 0, Math.sqrt(GRAVITY * number), index * 1.7], index * 4);
  }
  return out;
}

/** Draws the water over a scene already drawn: the sky and haze or the view under water, then the surface. */
export class WaterView {
  private readonly gpu: Gpu;
  private readonly layout: GPUBindGroupLayout;
  private readonly backdrop: GPURenderPipeline;
  private readonly surface: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly ripples: RippleField;
  private readonly empty: { readonly flat: GPUTexture; readonly shore: GPUTexture };
  private chop: { readonly swell: Swell | undefined; readonly waves: Float32Array } | null = null;
  /** The shelter grid last sent to the GPU, and its texture. */
  private shelter: { readonly grid: SeaGrid; readonly texture: GPUTexture } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device } = gpu;
    const seen = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
    const cells = { sampleType: 'unfilterable-float' } as const;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: seen, buffer: { type: 'uniform' } },
        { binding: 1, visibility: seen, texture: { sampleType: 'float' } },
        ...[2, 3, 4, 5, 6, 7, 8].map((binding) => ({ binding, visibility: seen, texture: cells })),
        { binding: 9, visibility: seen, sampler: { type: 'filtering' } },
        { binding: 10, visibility: seen, texture: cells },
      ],
    });
    const module = device.createShaderModule({ code: WATER_SHADER });
    const pipeline = (entry: 'backdrop' | 'surface', depthCompare: GPUCompareFunction) =>
      device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout, shadowLayouts(device).receiver] }),
        vertex: { module, entryPoint: `${entry}_vertex` },
        fragment: { module, entryPoint: `${entry}_fragment`, targets: [{ format: gpu.format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare },
        multisample: { count: SAMPLES },
      });
    this.backdrop = pipeline('backdrop', 'always');
    this.surface = pipeline('surface', 'greater');
    this.uniforms = device.createBuffer({
      size: FRAME_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.ripples = new RippleField(device);
    const tiny = (format: GPUTextureFormat) =>
      device.createTexture({ size: [1, 1], format, usage: TEXTURE_USAGE.textureBinding });
    this.empty = { flat: tiny('r32float'), shore: tiny('rgba32float') };
  }

  /** The close-up's water sent to the GPU; `window` is the window's corner in the world. */
  patchWater(field: ShoreField, window: readonly [number, number]): PatchWater {
    const { device } = this.gpu;
    const upload = (values: Float32Array, format: GPUTextureFormat, floats: number) => {
      const texture = device.createTexture({
        size: [field.width, field.height],
        format,
        usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
      });
      device.queue.writeTexture({ texture }, values, { bytesPerRow: field.width * floats * 4 }, [
        field.width,
        field.height,
      ]);
      return texture;
    };
    return {
      corner: [field.left - window[0], field.top - window[1]],
      step: field.step,
      heights: upload(field.heights, 'r32float', 1),
      levels: upload(field.levels, 'rg32float', 2),
      shore: upload(field.shore, 'rgba32float', 4),
    };
  }

  /** Presses the water at a window point, at the ripples' next step. */
  stir(x: number, y: number, radiusM: number, strength: number): void {
    this.ripples.stir(x, y, radiusM, strength);
  }

  /** Steps the ripples and draws the water into `scene.target`. */
  encode(encoder: GPUCommandEncoder, scene: WaterScene): void {
    this.ripples.advance(encoder, scene.focus[0], scene.focus[1], scene.seconds);
    this.gpu.device.queue.writeBuffer(this.uniforms, 0, this.frameValues(scene));
    const patch = scene.patch;
    const bindGroup = this.gpu.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: scene.drawn.colour.createView() },
        { binding: 2, resource: scene.drawn.depth.createView() },
        { binding: 3, resource: scene.coarse.wide.createView() },
        { binding: 4, resource: scene.coarse.lakes.createView() },
        { binding: 5, resource: (patch?.heights ?? this.empty.flat).createView() },
        { binding: 6, resource: (patch?.levels ?? this.empty.flat).createView() },
        { binding: 7, resource: (patch?.shore ?? this.empty.shore).createView() },
        { binding: 8, resource: this.ripples.heights.createView() },
        { binding: 9, resource: this.sampler },
        { binding: 10, resource: this.shelterOf(scene.swell).createView() },
      ],
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: scene.drawn.multisampled.createView(),
          resolveTarget: scene.target,
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: { view: scene.drawn.multidepth.createView(), depthReadOnly: true },
    });
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, (scene.shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.surface));
    pass.setPipeline(this.backdrop);
    pass.draw(3);
    pass.setPipeline(this.surface);
    pass.draw(RINGS * SEGMENTS * 6);
    pass.end();
  }

  private frameValues(scene: WaterScene): Float32Array {
    const { camera, exaggeration } = scene;
    const values = new Float32Array(FRAME_FLOATS);
    const [eyeX, eyeY, eyeZ] = camera.eye;
    values.set(camera.fromEye);
    values.set([eyeX, eyeY, eyeZ, scene.time % SLOW_CLOCK_S], 16);
    values.set([...camera.forward, camera.tanHalfView], 20);
    values.set([...camera.right, scene.size[0] / scene.size[1]], 24);
    values.set([...camera.up, camera.near], 28);
    const { far } = camera;
    values.set([camera.depthScale, camera.depthOffset, far, exaggeration], 32);
    const surface = scene.eyeWater ? scene.eyeWater.surface * exaggeration : -1e9;
    values.set([scene.size[0], scene.size[1], scene.fogM, surface], 36);
    const patch = scene.patch;
    values.set(patch ? [patch.corner[0], patch.corner[1], patch.step, 1] : [0, 0, 1, 0], 40);
    values.set([scene.coarse.cellM, scene.eyeWater?.fresh ? 1 : 0, 0, 0], 44);
    const inner = Math.max(0.3, scene.eyeAboveM * 0.04);
    values.set([inner, Math.max(far, inner * 10), RINGS, SEGMENTS], 48);
    const [rippleX, rippleY, rippleCell, rippleCells] = this.ripples.area;
    values.set([rippleX - eyeX, rippleY - eyeY, rippleCell, rippleCells], 52);
    const sea = scene.swell && 'grid' in scene.swell ? (scene.swell as SeaSwell) : null;
    if (sea) {
      const corner = [sea.grid.corner[0] - scene.world[0] - eyeX, sea.grid.corner[1] - scene.world[1] - eyeY];
      values.set([sea.height, corner[0] ?? 0, corner[1] ?? 0, sea.grid.cellM, sea.grid.cells, 1, 0, 0], 64);
    } else {
      // No weather: a moderate sea, its swell whole everywhere.
      values.set([1, 0, 0, 1, 0, 0, 0, 0], 64);
    }
    const waves = scene.swell?.waves.slice(0, MOST_WAVES) ?? [];
    const breakerClock = scene.time % SHORE.periodS;
    values.set([scene.swell?.fullDepthM ?? 15, scene.swell?.goneDepthM ?? 1, waves.length, breakerClock], 56);
    const fromCorner = patch ? [eyeX - patch.corner[0], eyeY - patch.corner[1]] : [0, 0];
    const fromAnchor = [eyeX - Math.floor(eyeX / ANCHOR_M) * ANCHOR_M, eyeY - Math.floor(eyeY / ANCHOR_M) * ANCHOR_M];
    values.set([...fromAnchor, ...fromCorner], 60);
    const [worldX, worldY] = [eyeX + scene.world[0], eyeY + scene.world[1]];
    for (const [index, wave] of waves.entries()) {
      const along = wave.direction[0] * worldX + wave.direction[1] * worldY;
      const phase = (wave.number * along - wave.frequency * scene.time + wave.phase) % (2 * Math.PI);
      values.set([wave.direction[0], wave.direction[1], wave.number, phase], WAVES_AT + index * 8);
      values.set([wave.amplitude, wave.shift, 0, 0], WAVES_AT + 4 + index * 8);
    }
    const chop =
      this.chop && this.chop.swell === scene.swell ? this.chop : { swell: scene.swell, waves: chopWaves(scene.swell) };
    this.chop = chop;
    values.set(chop.waves, WAVES_AT + MOST_WAVES * 8);
    values.set(hullValues(scene.hulls, [eyeX, eyeY]), HULLS_AT);
    return values;
  }

  /** The shelter grid's texture for the swell drawn now, sent again when the grid is new; a 1 × 1 one without. */
  private shelterOf(swell: Swell | undefined): GPUTexture {
    const grid = swell && 'grid' in swell ? (swell as SeaSwell).grid : null;
    if (!grid) return this.empty.flat;
    if (this.shelter?.grid === grid) return this.shelter.texture;
    this.shelter?.texture.destroy();
    const texture = this.gpu.device.createTexture({
      size: [grid.cells, grid.cells],
      format: 'r32float',
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    this.gpu.device.queue.writeTexture({ texture }, grid.shares, { bytesPerRow: grid.cells * 4 }, [
      grid.cells,
      grid.cells,
    ]);
    this.shelter = { grid, texture };
    return texture;
  }

  destroy(): void {
    this.ripples.destroy();
    this.uniforms.destroy();
    this.empty.flat.destroy();
    this.empty.shore.destroy();
    this.shelter?.texture.destroy();
  }
}

/** Gives a close-up's water textures back to the GPU. */
export function dropPatchWater(patch: PatchWater | null): void {
  patch?.heights.destroy();
  patch?.levels.destroy();
  patch?.shore.destroy();
}
