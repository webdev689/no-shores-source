import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GpuReport } from '../../client/src/desktop.ts';
import { askOf, infoOf } from './bridge.ts';
import { type Desk, launchFor } from './graphics.ts';

const windows: Desk = { platform: 'win32', wayland: false };
const plain = { desk: windows, failures: [], chromium: '156', argv: [], variable: undefined } as const;
const report: GpuReport = {
  adapter: true,
  device: true,
  backend: 'D3D12',
  type: 'discrete GPU',
  vendor: 'nvidia',
  architecture: 'ada-lovelace',
  description: 'NVIDIA GeForce RTX 4070',
  driver: '566.36',
  fallback: false,
  error: '',
};

test('only the asks the shell answers pass, each in its own shape', () => {
  assert.deepEqual(askOf({ ask: 'restart' }), { ask: 'restart' });
  assert.deepEqual(askOf({ ask: 'play' }), { ask: 'play' });
  assert.deepEqual(askOf({ ask: 'graphics', api: 'd3d11' }), { ask: 'graphics', api: 'd3d11' });
  assert.equal(askOf({ ask: 'graphics', api: 'opengl' }), null);
  assert.equal(askOf({ ask: 'quit' }), null);
  assert.equal(askOf('restart'), null);
  assert.equal(askOf(null), null);
  assert.deepEqual(askOf({ ask: 'drawn', extra: 'dropped' }), { ask: 'drawn' });
  assert.deepEqual(askOf({ ask: 'gpuLost', reason: 'x'.repeat(500) }), { ask: 'gpuLost', reason: 'x'.repeat(200) });
  assert.deepEqual(askOf({ ask: 'gpuLost', reason: 7 }), { ask: 'gpuLost', reason: '' });
});

test('a report is read field by field, its words cut short, anything else at its default', () => {
  const asked = askOf({ ask: 'gpu', report: { adapter: 'yes', description: 'x'.repeat(500), extra: 1 } });
  assert.equal(asked?.ask, 'gpu');
  const read = asked?.ask === 'gpu' ? asked.report : null;
  assert.equal(read?.adapter, false);
  assert.equal(read?.description.length, 200);
  assert.equal(read?.backend, '');
  assert.equal(askOf({ ask: 'gpu' }), null);
});

test('the game is told the choice, what was launched, what it draws with and on what card', () => {
  const launch = launchFor({ ...plain, chosen: 'auto' });
  const info = infoOf({
    version: '2026.1125.1230',
    desk: windows,
    chosen: 'auto',
    launch,
    next: launch,
    report,
    update: { state: 'none' },
  });
  assert.deepEqual(info.graphics, {
    chosen: 'auto',
    choices: ['auto', 'd3d12', 'd3d11'],
    launched: 'd3d12',
    running: 'D3D12',
    adapter: 'NVIDIA GeForce RTX 4070',
    held: false,
    restart: null,
  });
  assert.equal(info.platform, 'windows');
});

test('a restart names the API the next launch would bring; one held by a failure needs none and says so', () => {
  const launch = launchFor({ ...plain, chosen: 'auto' });
  const chosen = launchFor({ ...plain, chosen: 'd3d11' });
  assert.equal(
    infoOf({
      version: 'dev',
      desk: windows,
      chosen: 'd3d11',
      launch,
      next: chosen,
      report: null,
      update: { state: 'none' },
    }).graphics.restart,
    'd3d11',
  );
  const failures = [{ backend: 'd3d11', gpu: null, chromium: '156', reason: 'no adapter', at: '' }] as const;
  const held = launchFor({ ...plain, chosen: 'd3d11', failures });
  const info = infoOf({
    version: 'dev',
    desk: windows,
    chosen: 'd3d11',
    launch,
    next: held,
    report: null,
    update: { state: 'none' },
  });
  assert.deepEqual([info.graphics.restart, info.graphics.held, info.graphics.adapter], [null, true, '']);
});
