/** Where the editor looks: the world point at the canvas centre, and how many metres one screen pixel covers. */
export interface Camera {
  readonly centreX: number;
  readonly centreY: number;
  readonly metresPerPixel: number;
}

/** The closest and farthest the editor zooms: 50 m to 20 km a pixel. */
export const ZOOM_LIMITS = { closest: 50, farthest: 20_000 } as const;

/** The world point under a screen pixel, for a canvas `width` by `height` pixels. */
export function screenToWorld(camera: Camera, width: number, height: number, pixelX: number, pixelY: number) {
  return {
    x: camera.centreX + (pixelX - width / 2) * camera.metresPerPixel,
    y: camera.centreY + (pixelY - height / 2) * camera.metresPerPixel,
  };
}

/** The screen pixel over a world point. */
export function worldToScreen(camera: Camera, width: number, height: number, worldX: number, worldY: number) {
  return {
    x: (worldX - camera.centreX) / camera.metresPerPixel + width / 2,
    y: (worldY - camera.centreY) / camera.metresPerPixel + height / 2,
  };
}

/** Zooms by `factor` while the world point under the cursor stays under it. */
export function zoomAt(
  camera: Camera,
  width: number,
  height: number,
  pixelX: number,
  pixelY: number,
  factor: number,
): Camera {
  const metresPerPixel = Math.min(ZOOM_LIMITS.farthest, Math.max(ZOOM_LIMITS.closest, camera.metresPerPixel * factor));
  const anchor = screenToWorld(camera, width, height, pixelX, pixelY);
  return {
    metresPerPixel,
    centreX: anchor.x - (pixelX - width / 2) * metresPerPixel,
    centreY: anchor.y - (pixelY - height / 2) * metresPerPixel,
  };
}

/** Moves the view by a drag of `offsetX`, `offsetY` pixels. */
export function pan(camera: Camera, offsetX: number, offsetY: number): Camera {
  return {
    ...camera,
    centreX: camera.centreX - offsetX * camera.metresPerPixel,
    centreY: camera.centreY - offsetY * camera.metresPerPixel,
  };
}

/** The view that fits a frame `frameWidth` by `frameHeight` metres into the canvas with a margin. */
export function fitFrame(frameWidth: number, frameHeight: number, width: number, height: number): Camera {
  const metresPerPixel = Math.max(frameWidth / (width * 0.9), frameHeight / (height * 0.9));
  return { centreX: frameWidth / 2, centreY: frameHeight / 2, metresPerPixel };
}

/** A round length in metres (1, 2 or 5 times a power of ten) about `targetPixels` long on screen. */
export function niceLength(metresPerPixel: number, targetPixels: number): number {
  const raw = metresPerPixel * targetPixels;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((multiple) => multiple * power >= raw) ?? 10;
  return step * power;
}
