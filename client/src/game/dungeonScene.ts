// A dungeon's scene: no land, sky, sea or sun, only what is handed in, drawn into one pass and shown, then what draws
// over the finished picture and what gives light, as the game's scene draws them, at the resolution it draws at; the
// flames of the dungeon shown (`DUNGEON_FLAMES`) among them.
import { LightLayer } from '../combat/lightLayer.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { fromEyeMatrix, type Shot } from './camera.ts';
import { DepthCopy } from './depthCopy.ts';
import { DrainView } from './drain.ts';
import { DUNGEON_FLAMES } from './dungeonView.ts';
import type { Drawer } from './scene.ts';
import { type Gpu, TEXTURE_USAGE, viewOf } from '../gpu.ts';
import { perfZone, PERF, timedEncoder } from '../perfMeter.ts';
import { sceneScale, sceneSize } from './renderScale.ts';
import { Upscale } from './upscale.ts';
import { ShadowMap } from '../shadow.ts';
import { type Lamp, type SkyLook, skyUniformFor } from '../sky/skyUniform.ts';
import { SAMPLES } from '../water/waterView.ts';

/** The dark past the farthest torch's reach, where nothing is drawn (a Breach's run's sky's fog, so its far pieces
 *  fade into it). */
export const DARK_RGB = [0.01, 0.01, 0.015] as const;
const DARK: GPUColor = [...DARK_RGB, 1];

export class DungeonScene {
  private readonly gpu: Gpu;
  private readonly copy: DepthCopy;
  private readonly light: LightLayer;
  private readonly drain: DrainView;
  private readonly upscale: Upscale;
  private targets: {
    colour: GPUTexture;
    multidepth: GPUTexture;
    depth: GPUTexture;
    picture: GPUTexture | null;
  } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.copy = new DepthCopy(gpu);
    this.light = new LightLayer(gpu, 'float');
    this.drain = new DrainView(gpu);
    this.upscale = new Upscale(gpu);
  }

  /** Draws one frame from `shot` into the canvas: each drawer into one pass, measured from the eye as the game's
   *  scene measures it, under no sun's shadow; then each drawer's over the picture (the blows' arcs, the see-through
   *  marks) and its light; `after` may draw over the finished picture (the first person's hands), and all of it
   *  drains toward grey by `drain` (0 to 1), as the game's scene does. Every frame writes the sky it is drawn under
   *  (`sky`), so none draws under the last frame's (a dungeon's after a Breach's run's). */
  draw(
    shot: Shot,
    size: { width: number; height: number },
    time: number,
    handed: readonly Drawer[],
    sky: { readonly look: SkyLook; readonly lamps: readonly Lamp[] },
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void,
    drain = 0,
  ): void {
    const { device } = this.gpu;
    const flames = DUNGEON_FLAMES.current;
    const drawers: readonly Drawer[] = flames && flames.count > 0 ? [...handed, flames] : handed;
    skyUniformFor(device).write(sky.look, sky.lamps, shot.eye);
    const drawnAt = sceneSize(size, sceneScale());
    PERF.current?.scene(drawnAt.width, drawnAt.height, drawnAt.width / size.width);
    const fromEye = fromEyeMatrix(shot, drawnAt.width / drawnAt.height);
    const scaled = drawnAt.width !== size.width || drawnAt.height !== size.height;
    const targets = this.targetsOf(drawnAt.width, drawnAt.height, scaled);
    const canvas = this.gpu.context.getCurrentTexture();
    const target = targets.picture ? viewOf(targets.picture) : canvas.createView();
    const encoder = timedEncoder(device);
    perfZone('main');
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: viewOf(targets.colour),
          resolveTarget: target,
          clearValue: DARK,
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: viewOf(targets.multidepth),
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    const none = ShadowMap.none(this.gpu);
    for (const drawer of drawers) drawer.drawInto(pass, fromEye, shot, time, none);
    pass.end();
    // The depth is copied only on a frame that something over the picture or its light reads it.
    const later = timedEncoder(device);
    this.copy.encodeIfRead(encoder, later, { from: targets.multidepth, into: targets.depth }, () => {
      perfZone('over');
      for (const drawer of drawers) drawer.overWater?.(later, target, fromEye, targets.depth);
      perfZone('light');
      if (drawers.some((drawer) => drawer.lightInto))
        this.light.encode(later, target, targets.depth, (light) => {
          for (const drawer of drawers) drawer.lightInto?.(light, fromEye, targets.depth);
        });
    });
    const shown = targets.picture ? canvas.createView() : target;
    if (targets.picture) {
      perfZone('upscale');
      this.upscale.encode(later, targets.picture, shown);
    }
    perfZone('hands');
    after?.(later, shown);
    perfZone('drain');
    this.drain.encode(later, canvas, drain);
    device.queue.submit([encoder.finish(), later.finish()]);
  }

  /** Lets go of the targets, the light layer's and the drain's copy, made again on the next frame drawn. */
  release(): void {
    for (const texture of Object.values(this.targets ?? {})) texture?.destroy();
    this.targets = null;
    this.light.destroy();
    this.drain.release();
  }

  /** The targets at `width` by `height`, with a picture of their own to draw into when `scaled` from the canvas's. */
  private targetsOf(width: number, height: number, scaled: boolean) {
    const kept = this.targets;
    if (kept?.colour.width === width && kept.colour.height === height && !!kept.picture === scaled) return kept;
    this.release();
    const { device, format } = this.gpu;
    const [size, attachment] = [[width, height], TEXTURE_USAGE.renderAttachment];
    const sampled = attachment | TEXTURE_USAGE.textureBinding;
    this.targets = {
      colour: device.createTexture({ size, format, usage: attachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: REVERSED_DEPTH.format, usage: sampled, sampleCount: SAMPLES }),
      depth: device.createTexture({ size, format: 'r32float', usage: sampled }),
      picture: scaled ? device.createTexture({ size, format, usage: sampled }) : null,
    };
    return this.targets;
  }
}
