import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../gpuForTests.ts';
import { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import type { Shot } from './camera.ts';
import { EntranceView } from './entranceView.ts';

/** A pass that keeps the group last set at each index, and what was set when each draw was asked for. */
function recordingPass() {
  const groups = new Map<number, unknown>();
  const draws: Map<number, unknown>[] = [];
  const pass = {
    setPipeline() {},
    setBindGroup: (index: number, group: unknown) => void groups.set(index, group),
    setVertexBuffer() {},
    setIndexBuffer() {},
    drawIndexed: () => void draws.push(new Map(groups)),
  };
  return { pass: pass as unknown as GPURenderPassEncoder, groups, draws };
}

const SHOT = { eye: [0, 0, 40] } as unknown as Shot;

test('the entrances bind every group their pipeline reads, the sky among them, whatever was drawn before', () => {
  const { gpu } = countingGpu();
  const view = new EntranceView(gpu);
  view.set([{ x: 100, y: 200, ground: 0, yaw: 0, model: 0 }], {}, { climate: 'temperate', season: 'summer' });
  const shadow = ShadowMap.none(gpu);
  // The terrain draws just before them with groups of its own pipeline's ('auto') layout at 2 and 3, which the
  // models' pipeline, laid out by hand, cannot read.
  const { pass, groups, draws } = recordingPass();
  groups.set(2, 'the terrain’s gap');
  groups.set(3, 'the terrain’s sky');
  view.drawInto(pass, new Float32Array(16), SHOT, 0, shadow);
  const sky = recordingPass();
  skyUniformFor(gpu.device).bindShared(sky.pass, [2]);
  assert.equal(draws.length, 1);
  const drawn = draws[0] ?? new Map();
  for (const index of [0, 1]) assert.ok(drawn.get(index), `group ${index}`);
  assert.equal(drawn.get(2), sky.groups.get(2), 'the empty group of the sky’s layout');
  assert.equal(drawn.get(3), sky.groups.get(3), 'the sky’s own group');
});
