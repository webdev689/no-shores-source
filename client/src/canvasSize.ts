/** A canvas's drawing-buffer size, in device pixels, and the device pixels a CSS pixel is drawn at: the screen's, or
 *  fewer where the buffer is shrunk, so what is drawn by the ratio lands under the pointer. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

/** WebGPU's default maxTextureDimension2D, which every device has: a canvas's texture is no wider or taller. */
const MOST_SIDE = 8192;

/**
 * The drawing-buffer size for a canvas shown at `cssWidth` by `cssHeight` on a screen with `pixelRatio` device
 * pixels per CSS pixel. Never below one pixel, so a hidden canvas still has a valid buffer.
 */
export function canvasSize(cssWidth: number, cssHeight: number, pixelRatio: number): CanvasSize {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const [width, height] = [cssWidth * ratio, cssHeight * ratio];
  // Shrunk, keeping its shape, to the widest texture the device draws into (`startGpu` asks no higher limits).
  const shrink = Math.min(1, MOST_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * shrink)),
    height: Math.max(1, Math.round(height * shrink)),
    ratio: ratio * shrink,
  };
}
