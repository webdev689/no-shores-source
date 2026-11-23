import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import { SAMPLES } from '../water/waterView.ts';
import { dungeonPipelineDescriptors } from './dungeonPipelines.ts';
import { DUNGEON_SHADER } from './dungeonShaders.ts';

const module = { label: 'dungeon' } as GPUShaderModule;
const layout = { label: 'dungeon layout' } as GPUPipelineLayout;
const { depth, lit } = dungeonPipelineDescriptors(module, layout, 'bgra8unorm');

test('the depth draw and the lit draw lay each face alike: one vertex stage, the same faces kept and the same samples', () => {
  assert.equal(depth.vertex, lit.vertex);
  assert.equal(depth.vertex.entryPoint, 'dungeon_vertex');
  assert.deepEqual(depth.primitive, lit.primitive);
  assert.equal(depth.primitive?.cullMode, 'back');
  assert.deepEqual(depth.multisample, { count: SAMPLES });
  assert.deepEqual(lit.multisample, { count: SAMPLES });
  assert.equal(depth.layout, lit.layout);
  // The position is invariant, so both pipelines' vertex stages reach the same depth for a face.
  assert.match(DUNGEON_SHADER, /@builtin\(position\) @invariant clip: vec4f/);
});

test('the depth draw lays depth and no colour, the lit draw only tests it: nearer or equal passes, nothing written', () => {
  assert.deepEqual(depth.depthStencil, {
    format: REVERSED_DEPTH.format,
    depthWriteEnabled: true,
    depthCompare: REVERSED_DEPTH.compare,
  });
  const [laid] = depth.fragment?.targets ?? [];
  assert.equal(laid?.writeMask, 0, 'no colour');
  assert.equal(laid?.format, 'bgra8unorm', 'the pass’s own target, so both draws share its pass');
  // The depth draw's fragment returns nothing, so the test runs before it and it writes nothing.
  assert.match(DUNGEON_SHADER, new RegExp(`fn ${depth.fragment?.entryPoint}\\(\\) \\{\\}`));
  // Reversed depth keeps the greater: the lit draw passes at the depth laid and anything nearer.
  assert.equal(REVERSED_DEPTH.compare, 'greater');
  assert.deepEqual(lit.depthStencil, {
    format: REVERSED_DEPTH.format,
    depthWriteEnabled: false,
    depthCompare: 'greater-equal',
  });
  assert.equal(lit.fragment?.entryPoint, 'dungeon_fragment');
  assert.equal(lit.fragment?.targets[0]?.writeMask, undefined, 'every channel');
});
