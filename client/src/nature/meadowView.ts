import { SKY_NOW } from '../sky/skyDriver.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import { boxSeen, viewPlanes } from '../frustum.ts';
import { BUFFER_USAGE, type Gpu, SHADER_STAGE, TEXTURE_USAGE } from '../gpu.ts';
import { ShadowMap, shadowLayouts } from '../shadow.ts';
import { SLOW_CLOCK_S } from '../water/shore.ts';
import { SAMPLES } from '../water/waterView.ts';
import type { NatureGround } from './field.ts';
import { smooth } from './ground.ts';
import { meadowLevels } from './meadowAtlas.ts';
import { CELL_M, GRID, MEADOW_BIOMES, MeadowField, REACH_M, TUFTS } from './meadowField.ts';
import { FAR_FROM, FAR_VERTICES, MEADOW_FRAME_FLOATS, MEADOW_SHADER, NEAR_VERTICES } from './meadowShader.ts';
import type { NatureFrame } from './natureView.ts';
import { plantWind } from './natureView.ts';

/** The cells kept at once: every cell within the reach and the margin a cell is kept past it. */
export const KEPT_CELLS = 512;
/** The anchor the cells are placed from moves in steps this long, metres, so it rarely moves. */
const ANCHOR_STEP_M = 256;
/** How much higher than the reach the eye may stand over the ground below before no meadow is drawn, metres. */
const HIGH_MARGIN_M = 200;
/** A card stands this tall at most over its root, and reaches this far beside it, metres, for culling a cell. */
const TALLEST_M = 1.7;
const WIDEST_M = 1.2;
/** The plants' breeze, the wind's way before the weather is read, as natureView's. */
const GUST_PER_M = 0.035;

/** One cell drawn: its slot, how many of its tufts and with which cards. */
interface CellDraw {
  readonly slot: number;
  readonly count: number;
  readonly far: boolean;
  readonly away: number;
}

type MeadowPipelines = {
  readonly layout: GPUBindGroupLayout;
  readonly near: GPURenderPipeline;
  readonly far: GPURenderPipeline;
};
const made = new WeakMap<GPUDevice, Map<GPUTextureFormat, MeadowPipelines>>();

function meadowPipelines(gpu: Gpu): MeadowPipelines {
  const { device } = gpu;
  const byFormat = made.get(device) ?? new Map<GPUTextureFormat, MeadowPipelines>();
  made.set(device, byFormat);
  const known = byFormat.get(gpu.format);
  if (known) return known;
  const seen = SHADER_STAGE.vertex | SHADER_STAGE.fragment;
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: seen, buffer: { type: 'uniform' } },
      { binding: 1, visibility: SHADER_STAGE.vertex, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: SHADER_STAGE.vertex, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: SHADER_STAGE.fragment, texture: {} },
      { binding: 4, visibility: SHADER_STAGE.fragment, sampler: {} },
    ],
  });
  const module = device.createShaderModule({ code: MEADOW_SHADER });
  const sky = skyUniformFor(device);
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout, shadowLayouts(device).receiver, sky.empty, sky.layout],
  });
  const drawn = (vertex: string) =>
    device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: vertex },
      fragment: { module, entryPoint: 'meadow_fragment', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: { count: SAMPLES },
    });
  const pipelines = { layout, near: drawn('meadow_near'), far: drawn('meadow_far') };
  byFormat.set(gpu.format, pipelines);
  return pipelines;
}

/**
 * The meadow round the eye: the owner's tufts, flowers and bushes over the grass, drawn with WebGPU into the land's
 * pass after the plants. Each frame: `update` with the camera and the ground the plants grow on, then `drawInto`.
 */
export class MeadowView {
  private readonly gpu: Gpu;
  private readonly pipelines: MeadowPipelines;
  private readonly field: MeadowField;
  private readonly frameBuffer: GPUBuffer;
  private readonly cellBuffer: GPUBuffer;
  private readonly gridBuffer: GPUBuffer;
  private readonly atlas: GPUTexture;
  private readonly bind: GPUBindGroup;
  private anchor: [number, number] | null = null;
  private draws: CellDraw[] = [];

  constructor(gpu: Gpu, budgetMs = 3) {
    this.gpu = gpu;
    const { device } = gpu;
    this.pipelines = meadowPipelines(gpu);
    this.field = new MeadowField(KEPT_CELLS, budgetMs);
    this.frameBuffer = device.createBuffer({
      size: MEADOW_FRAME_FLOATS * 4,
      usage: BUFFER_USAGE.uniform | BUFFER_USAGE.copyDestination,
    });
    const stored = BUFFER_USAGE.storage | BUFFER_USAGE.copyDestination;
    this.cellBuffer = device.createBuffer({ size: KEPT_CELLS * 16, usage: stored });
    this.gridBuffer = device.createBuffer({ size: KEPT_CELLS * GRID * GRID * 8, usage: stored });
    const levels = meadowLevels();
    const [first] = levels;
    this.atlas = device.createTexture({
      size: [first?.width ?? 1, first?.height ?? 1],
      format: 'rgba8unorm',
      mipLevelCount: levels.length,
      usage: TEXTURE_USAGE.textureBinding | TEXTURE_USAGE.copyDestination,
    });
    levels.forEach((level, mip) =>
      device.queue.writeTexture({ texture: this.atlas, mipLevel: mip }, level.data, { bytesPerRow: level.width * 4 }, [
        level.width,
        level.height,
      ]),
    );
    // The owner's pixels, never blurred: each tuft reads one texel of one level.
    const nearest = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'nearest' });
    this.bind = device.createBindGroup({
      layout: this.pipelines.layout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.cellBuffer } },
        { binding: 2, resource: { buffer: this.gridBuffer } },
        { binding: 3, resource: this.atlas.createView() },
        { binding: 4, resource: nearest },
      ],
    });
  }

  /** Keeps the cells round the eye and works out what this frame draws. Answers whether cells still wait to be read,
   *  so a page that draws only when asked draws again. */
  update(frame: NatureFrame, ground: NatureGround): boolean {
    this.draws = [];
    if (!MEADOW_BIOMES.has(ground.biome)) return false;
    const [eyeX, eyeY, eyeZ] = frame.eye;
    if (eyeZ - ground.sample(eyeX, eyeY).height * frame.exaggeration > REACH_M + HIGH_MARGIN_M) return false;
    const waiting = this.field.update(eyeX, eyeY, ground);
    const anchor: [number, number] = [
      Math.round(eyeX / ANCHOR_STEP_M) * ANCHOR_STEP_M,
      Math.round(eyeY / ANCHOR_STEP_M) * ANCHOR_STEP_M,
    ];
    const moved = !this.anchor || this.anchor[0] !== anchor[0] || this.anchor[1] !== anchor[1];
    this.anchor = anchor;
    const { queue } = this.gpu.device;
    for (const cell of moved ? this.field.cells.values() : this.field.filled) {
      const corner = [cell.x * CELL_M - anchor[0], cell.y * CELL_M - anchor[1], cell.x, cell.y];
      queue.writeBuffer(this.cellBuffer, cell.slot * 16, new Float32Array(corner));
    }
    for (const cell of this.field.filled) queue.writeBuffer(this.gridBuffer, cell.slot * GRID * GRID * 8, cell.grid);
    const blowing = frame.wind ? { ...plantWind(null), way: frame.wind } : plantWind(SKY_NOW.current.reading);
    const way = blowing.way;
    const gusts = ((anchor[0] * way[0] + anchor[1] * way[1]) * GUST_PER_M) % (Math.PI * 2);
    const floats = new Float32Array(MEADOW_FRAME_FLOATS);
    floats.set(frame.fromEye);
    floats.set([anchor[0] - eyeX, anchor[1] - eyeY, -eyeZ, frame.exaggeration], 16);
    floats.set([frame.time % SLOW_CLOCK_S, way[0], way[1], gusts], 20);
    floats.set([ground.snowM, blowing.bend, blowing.gust, REACH_M], 24);
    floats.set([...(ground.groundColour ?? [0, 0, 0]), ground.groundColour ? 1 : 0], 28);
    queue.writeBuffer(this.frameBuffer, 0, floats);
    const planes = viewPlanes(frame.fromEye);
    for (const cell of this.field.cells.values()) {
      const [west, north] = [cell.x * CELL_M - eyeX, cell.y * CELL_M - eyeY];
      const [low, high] = [cell.low * frame.exaggeration - eyeZ, cell.high * frame.exaggeration - eyeZ + TALLEST_M];
      const across = Math.hypot(
        Math.max(west, Math.min(0, west + CELL_M)),
        Math.max(north, Math.min(0, north + CELL_M)),
      );
      const away = Math.hypot(across, Math.max(0, low, -high));
      if (away > REACH_M) continue;
      const lowest = [west - WIDEST_M, north - WIDEST_M, low];
      const highest = [west + CELL_M + WIDEST_M, north + CELL_M + WIDEST_M, high];
      if (!boxSeen(planes, lowest, highest)) continue;
      const fade = 1 - smooth(0.55 * REACH_M, REACH_M, away);
      const count = Math.min(TUFTS, Math.ceil(TUFTS * fade * 1.15));
      if (count > 0) this.draws.push({ slot: cell.slot, count, far: away > FAR_FROM * REACH_M, away });
    }
    this.draws.sort((a, b) => a.away - b.away);
    return waiting;
  }

  /** How many tufts the last update drew at most, and in how many draws, for a page's readout. */
  get drawn(): { readonly tufts: number; readonly draws: number } {
    return { tufts: this.draws.reduce((sum, draw) => sum + draw.count, 0), draws: this.draws.length };
  }

  /** Draws into the land's pass (four samples, depth reversed) what `update` worked out, nearest first, in the sun's
   *  shadows when a map is given. */
  drawInto(pass: GPURenderPassEncoder, shadow?: ShadowMap): void {
    if (this.draws.length === 0) return;
    pass.setPipeline(this.pipelines.near);
    pass.setBindGroup(0, this.bind);
    pass.setBindGroup(1, (shadow ?? ShadowMap.none(this.gpu)).receiverGroup(this.pipelines.near));
    skyUniformFor(this.gpu.device).bindShared(pass, [2]);
    let far = false;
    for (const draw of this.draws) {
      if (draw.far !== far) pass.setPipeline((far = draw.far) ? this.pipelines.far : this.pipelines.near);
      pass.draw(draw.far ? FAR_VERTICES : NEAR_VERTICES, draw.count, 0, draw.slot * TUFTS);
    }
  }

  /** Gives the GPU back this view's buffers and picture; it draws nothing after. */
  destroy(): void {
    for (const owned of [this.frameBuffer, this.cellBuffer, this.gridBuffer, this.atlas]) owned.destroy();
    this.draws = [];
  }
}
