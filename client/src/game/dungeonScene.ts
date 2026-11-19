// A dungeon's scene: no land, sky, sea or sun, only what is handed in, drawn into one pass and shown.
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { fromEyeMatrix, type Shot } from './camera.ts';
import type { Drawer } from './scene.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { ShadowMap } from '../shadow.ts';
import { SAMPLES } from '../water/waterView.ts';

/** The dark past the farthest torch's reach, where nothing is drawn. */
const DARK: GPUColor = [0.01, 0.01, 0.015, 1];

export class DungeonScene {
  private readonly gpu: Gpu;
  private targets: { colour: GPUTexture; depth: GPUTexture } | null = null;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
  }

  /** Draws one frame from `shot` into the canvas: each drawer into one pass, measured from the eye as the game's
   *  scene measures it, under no sun's shadow; `after` may draw over the finished picture (the first person's hands). */
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
        view: targets.depth.createView(),
        depthClearValue: REVERSED_DEPTH.clearValue,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    const none = ShadowMap.none(this.gpu);
    for (const drawer of drawers) drawer.drawInto(pass, fromEye, shot, time, none);
    pass.end();
    after?.(encoder, target);
    device.queue.submit([encoder.finish()]);
  }

  private targetsOf(width: number, height: number) {
    if (this.targets?.colour.width === width && this.targets.colour.height === height) return this.targets;
    this.targets?.colour.destroy();
    this.targets?.depth.destroy();
    const { device, format } = this.gpu;
    const usage = TEXTURE_USAGE.renderAttachment;
    this.targets = {
      colour: device.createTexture({ size: [width, height], format, usage, sampleCount: SAMPLES }),
      depth: device.createTexture({
        size: [width, height],
        format: REVERSED_DEPTH.format,
        usage,
        sampleCount: SAMPLES,
      }),
    };
    return this.targets;
  }
}
