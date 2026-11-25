import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKENDS } from './graphics.ts';
import { switchesFor } from './switches.ts';

const names = (backend: (typeof BACKENDS)[number]) => switchesFor(backend).map(([name]) => name);

test('every launch asks for the gaming card and has the adapter say its backend', () => {
  for (const backend of BACKENDS) {
    assert.ok(names(backend).includes('force_high_performance_gpu'));
    assert.ok(names(backend).includes('enable-webgpu-developer-features'));
  }
});

test('no switch is given twice, as Chromium would read only the last', () => {
  for (const backend of BACKENDS) assert.equal(new Set(names(backend)).size, names(backend).length);
});

test("no launch a player can get lifts WebGPU's own safety list wholesale; only SwiftShader's test run does", () => {
  for (const backend of BACKENDS.filter((one) => one !== 'swiftshader'))
    assert.ok(!names(backend).includes('enable-unsafe-webgpu'), backend);
  assert.ok(names('swiftshader').includes('enable-unsafe-webgpu'));
});

test('the defaults change nothing of how Chromium reaches WebGPU', () => {
  for (const backend of ['d3d12', 'metal', 'vulkan'] as const) assert.deepEqual(names(backend), names('d3d12'));
});

test("Vulkan's other ways each take theirs: past entry 186, or Chromium's own drawing on Vulkan", () => {
  assert.deepEqual(switchesFor('vulkan-unlisted').at(-1), ['ignore-gpu-blocklist', '186']);
  assert.deepEqual(switchesFor('vulkan-skia').at(-1), ['enable-features', 'Vulkan']);
  assert.deepEqual(switchesFor('d3d11').slice(-2), [
    ['use-webgpu-adapter', 'd3d11'],
    ['disable-dawn-features', 'adapter_blocklist'],
  ]);
});
