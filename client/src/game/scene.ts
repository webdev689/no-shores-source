import { LightLayer } from '../combat/lightLayer.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { ShadowMap } from '../shadow.ts';
import { CLOSE_RANGE_M, closeUpData, groundUnder, PATCH_SAMPLES, PATCH_STEP_M, REFRESH_M } from '../editor/closeUp.ts';
import type { GroundPatch, LandView, Swell } from '../rules/landRules.ts';
import { clipmapLevels, finestSpacing } from '../terrain/clipmap.ts';
import type { CloseGround } from '../terrain/landClient.ts';
import { type TerrainData, TerrainView } from '../terrain/terrainView.ts';
import type { HullMask } from '../water/hullMask.ts';
import { waterUnder } from '../water/shore.ts';
import { dropPatchWater, type PatchWater, SAMPLES, WaterView } from '../water/waterView.ts';
import { frameOf, fromEyeMatrix, type Shot } from './camera.ts';

/** Anything else drawn with the land, into the same pass: a city, its nature, the figures. Its points are measured
 *  from the eye, which it is handed in world metres. One that casts shadows draws them first, into the sun's map
 *  (`castInto`), and every one is handed the map to receive them; one may draw again over the water (`overWater`), and
 *  what gives light draws it into the light layer (`lightInto`). */
export interface Drawer {
  drawInto(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void;
  castInto?(pass: GPURenderPassEncoder, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap): void;
  /** Draws over the finished picture `target`, after the water, tested against the scene's `depth` (one float a pixel,
   *  reversed) by hand: what is seen through and must not be covered by the water laid over the land. */
  overWater?(encoder: GPUCommandEncoder, target: GPUTextureView, fromEye: Float32Array, depth: GPUTexture): void;
  /** Draws its light into the light layer's pass (`LightLayer.encode`), after the water and under the hands. */
  lightInto?(pass: GPURenderPassEncoder, fromEye: Float32Array): void;
}

/** Where the exact ground round a point comes from: the land worker's sampler. */
export type CloseSource = (left: number, top: number, step: number, size: number) => Promise<CloseGround>;

interface CloseUp {
  readonly ground: CloseGround;
  readonly water: PatchWater;
  readonly centre: readonly [number, number];
}

const DEPTH_COPY = /* wgsl */ `
@group(0) @binding(0) var depths: texture_depth_multisampled_2d;
@vertex fn copy_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn copy_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var sample = 0; sample < ${SAMPLES}; sample++) { sum += textureLoad(depths, vec2i(position.xy), sample); }
  return vec4f(sum / ${SAMPLES}.0, 0.0, 0.0, 1.0);
}
`;

/**
 * One landmass drawn for the game: its 1 km land in rings round the eye, the exact ground round the player, the
 * drawers handed in, then the water's sky, haze and surface over all of it. The land is drawn in its window's metres,
 * as the terrain and the water read it; everything else is handed world metres.
 */
export class GameScene {
  readonly gpu: Gpu;
  private readonly water: WaterView;
  private readonly shadow: ShadowMap;
  private readonly copy: GPURenderPipeline;
  private readonly light: LightLayer;
  private terrain: { view: LandView; drawn: TerrainView } | null = null;
  private close: CloseUp | null = null;
  private shownClose: CloseUp | null = null;
  private pending = false;
  private targets: { colour: GPUTexture; depth: GPUTexture; multisampled: GPUTexture; multidepth: GPUTexture } | null =
    null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.water = new WaterView(gpu);
    this.shadow = new ShadowMap(gpu);
    this.light = new LightLayer(gpu, 'float');
    const module = gpu.device.createShaderModule({ code: DEPTH_COPY });
    this.copy = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'copy_vertex' },
      fragment: { module, entryPoint: 'copy_fragment', targets: [{ format: 'r32float' }] },
    });
  }

  /** Draws this landmass from now on. */
  setLand(view: LandView, data: TerrainData): void {
    this.terrain?.drawn.destroy();
    this.terrain = { view, drawn: new TerrainView(this.gpu, data) };
    dropPatchWater(this.close?.water ?? null);
    [this.close, this.shownClose] = [null, null];
  }

  get land(): LandView | null {
    return this.terrain?.view ?? null;
  }

  /** The ground's height at a world point: exact within the close-up, the 1 km land's elsewhere, 0 off the window. */
  groundAt(x: number, y: number): number | null {
    const view = this.terrain?.view;
    if (!view) return null;
    const close = this.close?.ground.patch;
    const exact = close ? groundUnder(close, x, y) : null;
    if (exact !== null) return exact;
    const [column, row] = [(x - view.leftM) / view.cellM - 0.5, (y - view.topM) / view.cellM - 0.5];
    const [left, top] = [Math.floor(column), Math.floor(row)];
    if (left < 0 || top < 0 || left >= view.width - 1 || top >= view.height - 1) return null;
    const cell = (east: number, south: number) => view.heights[(top + south) * view.width + left + east] ?? 0;
    const [across, down] = [column - left, row - top];
    const upper = cell(0, 0) + (cell(1, 0) - cell(0, 0)) * across;
    const lower = cell(0, 1) + (cell(1, 1) - cell(0, 1)) * across;
    return upper + (lower - upper) * down;
  }

  /** Keeps the exact ground round a world point, sampled again once the point moves 400 m. */
  keepClose(focus: readonly [number, number], source: CloseSource, redraw: () => void): void {
    const view = this.terrain?.view;
    if (!view || this.pending) return;
    if (this.close && Math.hypot(focus[0] - this.close.centre[0], focus[1] - this.close.centre[1]) < REFRESH_M) return;
    this.pending = true;
    const half = ((PATCH_SAMPLES - 1) * PATCH_STEP_M) / 2;
    // The land's door samples in world metres, as the patch and the shore's field keep them.
    const [left, top] = [Math.round(focus[0] - half), Math.round(focus[1] - half)];
    source(left, top, PATCH_STEP_M, PATCH_SAMPLES)
      .then((ground) => {
        this.pending = false;
        if (this.terrain?.view !== view) return;
        dropPatchWater(this.close?.water ?? null);
        this.close = { ground, water: this.water.patchWater(ground.field, [view.leftM, view.topM]), centre: focus };
        redraw();
      })
      .catch(() => {
        this.pending = false;
      });
  }

  /** The exact ground round the player as last sampled, or null before any. */
  closePatch(): GroundPatch | null {
    return this.close?.ground.patch ?? null;
  }

  /** Whether the exact ground round a world point has come. */
  closeReady(x: number, y: number): boolean {
    const centre = this.close?.centre;
    return !!centre && Math.hypot(x - centre[0], y - centre[1]) < REFRESH_M;
  }

  /** The water at a world point now: its surface over the sea or a lake or river, or null on dry ground. */
  waterAt(x: number, y: number, time: number): { surface: number; fresh: boolean } | null {
    const view = this.terrain?.view;
    const field = this.close?.ground.field;
    if (view && field) {
      const water = waterUnder(field, view.swell, { x, y }, time);
      if (water) return water.kind === 'dry' ? null : { surface: water.surface, fresh: water.kind === 'fresh' };
    }
    return (this.groundAt(x, y) ?? 0) < 0 ? { surface: 0, fresh: false } : null;
  }

  /** Presses the water's ripples at a world point, at their next step. */
  stir(stir: { readonly x: number; readonly y: number; readonly radiusM: number; readonly strength: number }): void {
    const view = this.terrain?.view;
    if (view) this.water.stir(stir.x - view.leftM, stir.y - view.topM, stir.radiusM, stir.strength);
  }

  /** Draws one frame from `shot` into the canvas, with the drawers drawn with the land; `after` may draw over the
   *  finished picture (the first person's hands) before it is shown, `hulls` are the ships on the water (world
   *  metres), which it keeps out of and foams round, and the water's ripples follow `focus` (world metres; the eye
   *  unless said). */
  draw(
    shot: Shot,
    size: { width: number; height: number },
    time: number,
    seconds: number,
    drawers: readonly Drawer[],
    more: {
      readonly after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void;
      readonly hulls?: readonly HullMask[];
      readonly focus?: readonly [number, number];
      /** The swell to draw in place of the land's: the sea by weather. */
      readonly swell?: Swell;
    } = {},
  ): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const { view, drawn } = terrain;
    const origin = [view.leftM, view.topM] as const;
    const local: Shot = { ...shot, eye: [shot.eye[0] - origin[0], shot.eye[1] - origin[1], shot.eye[2]] };
    const fromEye = fromEyeMatrix(shot, size.width / size.height);
    const ground = this.groundAt(shot.eye[0], shot.eye[1]) ?? 0;
    const above = Math.max(1, shot.eye[2] - Math.max(0, ground));
    const near = above < CLOSE_RANGE_M ? this.close : null;
    if (near !== this.shownClose) {
      drawn.showCloseUp(near && closeUpData(near.ground.patch, near.ground.field.levels, view));
      this.shownClose = near;
    }
    const rings = clipmapLevels(local.eye[0], local.eye[1], finestSpacing(above));
    const pixelAngle = (2 * Math.tan(shot.fov / 2)) / size.height;
    drawn.prepare(
      { fromEye, eye: local.eye, time, rings, far: shot.far, pixelAngle },
      { exaggeration: 1, brush: null },
    );
    const targets = this.targetsOf(size.width, size.height);
    const encoder = this.gpu.device.createCommandEncoder();
    // The sun's shadows first: what casts draws its depth along the sun into each cascade, for everything after to read.
    this.shadow.update(shot.eye, shot.yaw, above);
    this.shadow.cast(encoder, (cast) => {
      for (const drawer of drawers) drawer.castInto?.(cast, fromEye, shot, time, this.shadow);
    });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targets.multisampled.createView(),
          resolveTarget: targets.colour.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: targets.multidepth.createView(),
        depthClearValue: 0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    drawn.drawInto(pass, this.shadow);
    for (const drawer of drawers) drawer.drawInto(pass, fromEye, shot, time, this.shadow);
    pass.end();
    const copy = encoder.beginRenderPass({
      colorAttachments: [
        { view: targets.depth.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
    });
    copy.setPipeline(this.copy);
    copy.setBindGroup(
      0,
      this.gpu.device.createBindGroup({
        layout: this.copy.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: targets.multidepth.createView() }],
      }),
    );
    copy.draw(3);
    copy.end();
    const camera = frameOf(local);
    const target = this.gpu.context.getCurrentTexture().createView();
    const eyeWater = this.waterAt(shot.eye[0], shot.eye[1], time);
    this.water.encode(encoder, {
      camera: { ...camera, fromEye, tanHalfView: Math.tan(shot.fov / 2) },
      size: [size.width, size.height],
      time,
      seconds,
      exaggeration: 1,
      fogM: Math.max(25_000, above * 60),
      world: [...origin],
      swell: more.swell ?? view.swell,
      coarse: drawn.cells,
      patch: near?.water ?? null,
      eyeWater,
      eyeAboveM: Math.abs(shot.eye[2] - (eyeWater?.surface ?? ground)),
      focus: more.focus ? [more.focus[0] - origin[0], more.focus[1] - origin[1]] : [local.eye[0], local.eye[1]],
      hulls: (more.hulls ?? []).map((hull) => ({ ...hull, x: hull.x - origin[0], y: hull.y - origin[1] })),
      drawn: targets,
      target,
    });
    for (const drawer of drawers) drawer.overWater?.(encoder, target, fromEye, targets.depth);
    if (drawers.some((drawer) => drawer.lightInto))
      this.light.encode(encoder, target, targets.depth, (light) => {
        for (const drawer of drawers) drawer.lightInto?.(light, fromEye);
      });
    more.after?.(encoder, target);
    this.gpu.device.queue.submit([encoder.finish()]);
  }

  private targetsOf(width: number, height: number) {
    if (this.targets?.colour.width === width && this.targets.colour.height === height) return this.targets;
    for (const texture of Object.values(this.targets ?? {})) texture.destroy();
    const usage = TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.textureBinding;
    const { device, format } = this.gpu;
    const size = [width, height];
    this.targets = {
      colour: device.createTexture({ size, format, usage }),
      depth: device.createTexture({ size, format: 'r32float', usage }),
      multisampled: device.createTexture({ size, format, usage: TEXTURE_USAGE.renderAttachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: 'depth32float', usage, sampleCount: SAMPLES }),
    };
    return this.targets;
  }
}
