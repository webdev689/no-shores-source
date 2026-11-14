/** A canvas's drawing-buffer size, in device pixels. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The drawing-buffer size for a canvas shown at `cssWidth` by `cssHeight` on a screen with `pixelRatio` device
 * pixels per CSS pixel. Never below one pixel, so a hidden canvas still has a valid buffer.
 */
export function canvasSize(cssWidth: number, cssHeight: number, pixelRatio: number): CanvasSize {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return {
    width: Math.max(1, Math.round(cssWidth * ratio)),
    height: Math.max(1, Math.round(cssHeight * ratio)),
  };
}
