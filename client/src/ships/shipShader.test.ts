import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import { shipKit } from './shipShader.ts';

/** A device that counts what it is asked to make. */
function countingGpu() {
  const made = { pipelines: 0, textures: 0, samplers: 0, shaders: [] as string[] };
  const device = {
    createShaderModule: ({ code }: { code: string }) => (made.shaders.push(code), {}),
    createRenderPipelineAsync: async () => (made.pipelines++, {}),
    createTexture: () => (made.textures++, { createView: () => ({}) }),
    createSampler: () => (made.samplers++, {}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    // The sky's uniform, which the hull's light reads.
    createBuffer: () => ({}),
    queue: { writeTexture: () => undefined, writeBuffer: () => undefined },
  };
  return { gpu: { device, format: 'bgra8unorm' } as unknown as Gpu, made };
}

test("every hull on a device shares one pipeline, its shadow's, one set of pictures and one sampler", async () => {
  const { gpu, made } = countingGpu();
  const [one, other] = await Promise.all([shipKit(gpu), shipKit(gpu)]);
  await shipKit(gpu);
  assert.equal(one, other);
  assert.deepEqual([made.pipelines, made.textures, made.samplers], [2, 1, 1]);
  // It is lit through the sun's shadow maps, and casts into them from a shader of its shadow's own.
  assert.match(made.shaders[0] ?? '', /sunlit\(drawn\.from_eye, normal\)/);
  assert.match(made.shaders[1] ?? '', /fn cast_vertex/);
  // Its parts are numbered as the pictures are: the hull first, the canvas fourth.
  assert.match(made.shaders[0] ?? '', /const HULL_PART = 0u;/);
  assert.match(made.shaders[0] ?? '', /const SAIL_PART = 3u;/);
  const second = countingGpu();
  await shipKit(second.gpu);
  assert.equal(second.made.pipelines, 2, 'another device makes its own');
});

test('a kit whose pipeline failed is made afresh next time', async () => {
  const { gpu, made } = countingGpu();
  let failing = true;
  const device = gpu.device as unknown as { createRenderPipelineAsync: () => Promise<object> };
  device.createRenderPipelineAsync = async () => {
    made.pipelines++;
    if (failing) throw new Error('the pipeline was not made');
    return {};
  };
  await assert.rejects(shipKit(gpu));
  failing = false;
  await shipKit(gpu);
  assert.equal(made.pipelines, 4, 'both pipelines are made again');
});
