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

/** Starts WebGPU on a canvas. Overlook draws with WebGPU only, so a browser without it gets a clear reason. */
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
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format };
}

/** WebGPU's usage flags we use, by the specification's values: TypeScript's DOM types declare no constants for them. */
export const TEXTURE_USAGE = { copyDestination: 0x02, textureBinding: 0x04, renderAttachment: 0x10 } as const;
export const BUFFER_USAGE = { copyDestination: 0x08, uniform: 0x40 } as const;
