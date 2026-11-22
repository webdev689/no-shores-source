/** What the client draws with: the GPU device and the canvas it presents to. */
export interface Gpu {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
}

/** Why the GPU could not start, in words a player can act on. */
export class GpuUnavailable extends Error {
  override readonly name = 'GpuUnavailable';
}

/** Starts WebGPU on a canvas. The game draws with WebGPU only, so a browser without it gets a clear reason. */
export async function startGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (!('gpu' in navigator)) {
    throw new GpuUnavailable('This browser does not support WebGPU. Try a current Chrome, Edge or Safari.');
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new GpuUnavailable('WebGPU is on, but no graphics adapter is available. Update your graphics drivers.');
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!(context instanceof GPUCanvasContext)) {
    throw new GpuUnavailable('The page could not open a WebGPU drawing surface.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  // Copied from as well as drawn into: the death's drain copies the finished picture aside to draw it back grey.
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
    usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
  });
  return { device, context, format };
}

/** WebGPU's usage flags we use, by the specification's values: TypeScript's DOM types declare no constants for them. */
export const TEXTURE_USAGE = {
  copySource: 0x01,
  copyDestination: 0x02,
  textureBinding: 0x04,
  storageBinding: 0x08,
  renderAttachment: 0x10,
} as const;
export const BUFFER_USAGE = {
  mapRead: 0x01,
  copyDestination: 0x08,
  index: 0x10,
  vertex: 0x20,
  uniform: 0x40,
  storage: 0x80,
} as const;
export const SHADER_STAGE = { vertex: 0x1, fragment: 0x2, compute: 0x4 } as const;

/** Says so through `stop` once `device` is lost (a driver's reset, the GPU taken away), which leaves nothing to draw
 *  with; a device destroyed on purpose says nothing. */
export function stopWhenLost(device: Pick<GPUDevice, 'lost'>, stop: (message: string) => void): void {
  void device.lost.then((lost) => {
    if (lost.reason !== 'destroyed') stop(`The graphics device was lost (${lost.message}). Reload the page.`);
  });
}
