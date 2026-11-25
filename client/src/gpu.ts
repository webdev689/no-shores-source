import { askDesktop, type GpuReport } from './desktop.ts';

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
    askDesktop({ ask: 'gpu', report: gpuReportOf(null, 'this browser has no WebGPU') });
    throw new GpuUnavailable('This browser does not support WebGPU. Try a current Chrome, Edge or Safari.');
  }
  askDesktop({ ask: 'gpuAsked' });
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (error) {
    askDesktop({ ask: 'gpu', report: gpuReportOf(null, String(error)) });
    throw error;
  }
  if (!adapter) {
    askDesktop({ ask: 'gpu', report: gpuReportOf(null, '') });
    throw new GpuUnavailable('WebGPU is on, but no graphics adapter is available. Update your graphics drivers.');
  }
  // The GPU's clock, where the adapter has one: the readout (`?perf`) times each pass with it, and the Auto resolution
  // reads the frame's GPU time from it.
  const requiredFeatures: GPUFeatureName[] = adapter.features.has('timestamp-query') ? ['timestamp-query'] : [];
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({ requiredFeatures });
  } catch (error) {
    askDesktop({ ask: 'gpu', report: gpuReportOf(adapter, String(error) || 'no reason given') });
    throw error;
  }
  askDesktop({ ask: 'gpu', report: gpuReportOf(adapter, '') });
  // A validation error drops the work it was in without a word: each is said once, so a picture that stops says why.
  const said = new Set<string>();
  device.addEventListener('uncapturederror', (event) => {
    const { message } = (event as GPUUncapturedErrorEvent).error;
    if (said.size < 20 && !said.has(message)) (said.add(message), console.error(`WebGPU: ${message}`));
  });
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

/** What the adapter WebGPU gave says of itself, for the desktop app's watch over the API it launched with (nothing
 *  is sent in a browser). Its backend, type and driver are said only where Chromium is asked to say them, as the app
 *  asks; `error` is why the device would not start, empty where it did. */
export function gpuReportOf(adapter: GPUAdapter | null, error: string): GpuReport {
  const info = (adapter?.info ?? {}) as unknown as Record<string, unknown>;
  const said = (field: string) => (typeof info[field] === 'string' ? (info[field] as string) : '');
  const older = adapter as unknown as { readonly isFallbackAdapter?: boolean } | null;
  return {
    adapter: adapter !== null,
    device: adapter !== null && error === '',
    backend: said('backend'),
    type: said('type'),
    vendor: said('vendor'),
    architecture: said('architecture'),
    description: said('description'),
    driver: said('driver'),
    fallback: info['isFallbackAdapter'] === true || older?.isFallbackAdapter === true,
    error,
  };
}

/** A texture's whole view, made once and kept with it: a target drawn into every frame asks for it every frame, and
 *  making a view is a call across to the GPU's process. */
const VIEWS = new WeakMap<GPUTexture, GPUTextureView>();
export function viewOf(texture: GPUTexture): GPUTextureView {
  let view = VIEWS.get(texture);
  if (!view) VIEWS.set(texture, (view = texture.createView()));
  return view;
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
  copySource: 0x04,
  copyDestination: 0x08,
  index: 0x10,
  vertex: 0x20,
  uniform: 0x40,
  storage: 0x80,
  queryResolve: 0x200,
} as const;
export const SHADER_STAGE = { vertex: 0x1, fragment: 0x2, compute: 0x4 } as const;

/** Says so through `stop` once `device` is lost (a driver's reset, the GPU taken away), which leaves nothing to draw
 *  with; a device destroyed on purpose says nothing. */
export function stopWhenLost(device: Pick<GPUDevice, 'lost'>, stop: (message: string) => void): void {
  void device.lost.then((lost) => {
    if (lost.reason !== 'destroyed') stop(`The graphics device was lost (${lost.message}). Reload the page.`);
  });
}
