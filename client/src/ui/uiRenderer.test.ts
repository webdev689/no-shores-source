import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import { UiRenderer } from './uiRenderer.ts';
import { FAKE_FACE } from './uiForTests.ts';

/** A GPU that makes what it is asked for and draws nothing, noting the size of each picture laid in the atlas. */
function stubGpu(): { gpu: Gpu; laid: string[] } {
  const laid: string[] = [];
  const texture = (size: number[]) => ({ depthOrArrayLayers: size[2] ?? 1, createView: () => ({}), destroy() {} });
  const device = {
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBuffer: (made: { size: number }) => ({ size: made.size, destroy() {} }),
    createTexture: (made: { size: number[] }) => texture(made.size),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      copyTextureToTexture() {},
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} }),
      finish: () => ({}),
    }),
    queue: {
      writeTexture() {},
      writeBuffer() {},
      submit() {},
      copyExternalImageToTexture: (_from: unknown, _where: unknown, size: number[]) => laid.push(size.join('x')),
    },
  };
  const context = { getCurrentTexture: () => ({ createView: () => ({}) }) };
  return { gpu: { device, format: 'bgra8unorm', context } as unknown as Gpu, laid };
}

test('a picture wider than a layer of the atlas is drawn over its whole box from pixels scaled down to fit', () => {
  // A 2D canvas that draws nothing, where Node has none.
  Object.assign(globalThis, {
    OffscreenCanvas: class {
      getContext = () => ({});
    },
  });
  const { gpu, laid } = stubGpu();
  const renderer = new UiRenderer(gpu, FAKE_FACE);
  const drawing = { draw: () => undefined };
  const box = { x: 0, y: 0, width: 4096, height: 1024 };
  // Drawn the frame it is asked for, as a 2D drawing is done at once.
  renderer.picture({ key: 'wide', source: drawing }, box);
  assert.deepEqual(laid, ['2047x511'], 'laid at the most a layer holds, its shape kept');
  assert.equal(renderer.quads.count, 1, 'drawn');
  assert.deepEqual([...renderer.quads.data.subarray(0, 4)], [0, 0, 4096, 1024], 'over the whole box');
});
