// A GPU for tests that makes what it is asked for and draws nothing, counting the buffers and textures made and not
// yet destroyed, so a test can hold a view to letting go of everything it made.
import type { Gpu } from './gpu.ts';

export interface CountingGpu {
  readonly gpu: Gpu;
  /** The buffers and textures made and not destroyed. */
  live(): number;
}

export function countingGpu(): CountingGpu {
  let live = 0;
  const held = <T extends object>(made: T): T & { destroy(): void } => {
    live++;
    let gone = false;
    return Object.assign(made, {
      destroy() {
        if (!gone) live--;
        gone = true;
      },
    });
  };
  const pass = { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, end() {} };
  const device = {
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createRenderPipelineAsync: () => Promise.resolve({ getBindGroupLayout: () => ({}) }),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    createBuffer: (made: { size: number }) => held({ size: made.size }),
    createTexture: (made: { size: number[] }) =>
      held({ depthOrArrayLayers: made.size[2] ?? 1, createView: () => ({}) }),
    createCommandEncoder: () => ({ beginRenderPass: () => pass, copyTextureToTexture() {}, finish: () => ({}) }),
    queue: { writeTexture() {}, writeBuffer() {}, submit() {}, copyExternalImageToTexture() {} },
  };
  const context = { getCurrentTexture: () => ({ createView: () => ({}) }) };
  return { gpu: { device, format: 'bgra8unorm', context } as unknown as Gpu, live: () => live };
}
