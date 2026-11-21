// The Test Ground's view between its panels: drawn into a texture of its own, the view's size, with the fight's
// display over it, then copied into its place on the canvas, where the panels are drawn either side of it.
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';

export class ViewTexture {
  private readonly gpu: Gpu;
  texture: GPUTexture;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    this.texture = this.made(1, 1);
  }

  /** Makes the texture `width` by `height` device pixels, if it is not already. */
  fit(width: number, height: number): void {
    if (this.texture.width === width && this.texture.height === height) return;
    this.texture.destroy();
    this.texture = this.made(width, height);
  }

  /** Copies the view into the canvas's texture, `left` device pixels in. */
  show(left: number): void {
    const { device, context } = this.gpu;
    const canvas = context.getCurrentTexture();
    const width = Math.min(this.texture.width, canvas.width - left);
    const height = Math.min(this.texture.height, canvas.height);
    if (width <= 0 || height <= 0) return;
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToTexture({ texture: this.texture }, { texture: canvas, origin: [left, 0] }, [width, height]);
    device.queue.submit([encoder.finish()]);
  }

  private made(width: number, height: number): GPUTexture {
    return this.gpu.device.createTexture({
      size: [width, height],
      format: this.gpu.format,
      usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
    });
  }
}
