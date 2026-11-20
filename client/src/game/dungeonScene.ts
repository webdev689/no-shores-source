// A dungeon's scene: no land, sky, sea or sun, only what is handed in, drawn into one pass and shown, then what draws
// over the finished picture and what gives light, as the game's scene draws them.
import { LightLayer } from '../combat/lightLayer.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { fromEyeMatrix, type Shot } from './camera.ts';
import { DepthCopy } from './depthCopy.ts';
import type { Drawer } from './scene.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { ShadowMap } from '../shadow.ts';
import { SAMPLES } from '../water/waterView.ts';

/** The dark past the farthest torch's reach, where nothing is drawn. */
const DARK: GPUColor = [0.01, 0.01, 0.015, 1];

export class DungeonScene {
  private readonly gpu: Gpu;
  private readonly copy: DepthCopy;
  private readonly light: LightLayer;
  private targets: { colour: GPUTexture; multidepth: GPUTexture; depth: GPUTexture } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.copy = new DepthCopy(gpu);
    this.light = new LightLayer(gpu, 'float');
  }

  /** Draws one frame from `shot` into the canvas: each drawer into one pass, measured from the eye as the game's
   *  scene measures it, under no sun's shadow; then each drawer's over the picture (the blows' arcs, the see-through
   *  marks) and its light; `after` may draw over the finished picture (the first person's hands). */
  draw(
    shot: Shot,
    size: { width: number; height: number },
    time: number,
    drawers: readonly Drawer[],
    after?: (encoder: GPUCommandEncoder, view: GPUTextureView) => void,
  ): void {
    const { device } = this.gpu;
    const fromEye = fromEyeMatrix(shot, size.width / Math.max(1, size.height));
    const targets = this.targetsOf(size.width, size.height);
    const target = this.gpu.context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: targets.colour.createView(),
          resolveTarget: target,
          clearValue: DARK,
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: targets.multidepth.createView(),
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    const none = ShadowMap.none(this.gpu);
    for (const drawer of drawers) drawer.drawInto(pass, fromEye, shot, time, none);
    pass.end();
    this.copy.encode(encoder, targets.multidepth, targets.depth);
    for (const drawer of drawers) drawer.overWater?.(encoder, target, fromEye, targets.depth);
    if (drawers.some((drawer) => drawer.lightInto))
      this.light.encode(encoder, target, targets.depth, (light) => {
        for (const drawer of drawers) drawer.lightInto?.(light, fromEye, targets.depth);
      });
    after?.(encoder, target);
    device.queue.submit([encoder.finish()]);
  }

  /** Lets go of the targets and the light layer's, made again on the next frame drawn. */
  release(): void {
    for (const texture of Object.values(this.targets ?? {})) texture.destroy();
    this.targets = null;
    this.light.destroy();
  }

  private targetsOf(width: number, height: number) {
    if (this.targets?.colour.width === width && this.targets.colour.height === height) return this.targets;
    this.release();
    const { device, format } = this.gpu;
    const [size, attachment] = [[width, height], TEXTURE_USAGE.renderAttachment];
    const sampled = attachment | TEXTURE_USAGE.textureBinding;
    this.targets = {
      colour: device.createTexture({ size, format, usage: attachment, sampleCount: SAMPLES }),
      multidepth: device.createTexture({ size, format: REVERSED_DEPTH.format, usage: sampled, sampleCount: SAMPLES }),
      depth: device.createTexture({ size, format: 'r32float', usage: sampled }),
    };
    return this.targets;
  }
}
