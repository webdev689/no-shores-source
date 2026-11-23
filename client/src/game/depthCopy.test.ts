import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../gpuForTests.ts';
import { DepthCopy } from './depthCopy.ts';

/** An encoder that says each pass begun on it into `begun`, by its own name. */
const encoderNamed = (name: string, begun: string[]) => {
  const pass = { setPipeline() {}, setBindGroup() {}, draw() {}, end() {} };
  return { beginRenderPass: () => (begun.push(name), pass) } as unknown as GPUCommandEncoder;
};

test('the depth is copied only on a frame that what may read it begins a pass', () => {
  const copy = new DepthCopy(countingGpu().gpu);
  const texture = { createView: () => ({}) } as unknown as GPUTexture;
  const depths = { from: texture, into: texture };
  const begun: string[] = [];
  const [first, later] = [encoderNamed('first', begun), encoderNamed('later', begun)];
  copy.encodeIfRead(first, later, depths, () => undefined);
  assert.deepEqual(begun, [], 'nothing read it, so nothing is copied');
  copy.encodeIfRead(first, later, depths, () => later.beginRenderPass({ colorAttachments: [] }));
  assert.deepEqual(begun, ['later', 'first'], 'read on the later encoder, copied on the first');
  later.beginRenderPass({ colorAttachments: [] });
  assert.deepEqual(begun, ['later', 'first', 'later'], 'the later encoder is its own again after');
});
