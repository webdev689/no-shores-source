import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameMeans, PERF_EVERY, PerfMeter, perfOn } from './perfMeter.ts';

test('the readout is asked for by perf among the address’s names, and by nothing like it', () => {
  for (const search of ['?perf', '?perf=1', '?room=a&perf', '?perf&room=a']) assert.ok(perfOn(search), search);
  for (const search of ['', '?perfect', '?superf', '?room=perf']) assert.ok(!perfOn(search), search);
});

test('the lines are laid out every PERF_EVERY frames: the frame’s mean and worst, the script’s, the GPU’s by zone', () => {
  const means = new FrameMeans();
  const drawn = { width: 2880, height: 1620, share: 0.75 };
  for (let index = 0; index < PERF_EVERY - 1; index++) {
    means.frame(index === 3 ? 40 : 16, 4, drawn);
    means.gpu(
      new Map([
        ['main', 2],
        ['water', 5],
      ]),
    );
  }
  assert.deepEqual(means.lines, [], 'nothing before the first PERF_EVERY frames');
  means.frame(16, 4, drawn);
  assert.deepEqual(means.lines, [
    'frame 16.2 ms, worst 40.0 ms',
    'cpu 4.0 ms',
    'gpu 7.0 ms',
    '  water 5.00',
    '  main 2.00',
    'scene 2880 x 1620, 75%',
  ]);
});

test('with no GPU time come back, the lines say the GPU was not timed and keep the CPU’s', () => {
  const means = new FrameMeans();
  for (let index = 0; index < PERF_EVERY; index++) means.frame(20, 5, null);
  assert.deepEqual(means.lines, ['frame 20.0 ms, worst 20.0 ms', 'cpu 5.0 ms', 'gpu not timed']);
});

test('a meter on a device without timestamps answers each frame’s interval and no GPU time', () => {
  const device = { features: new Set<string>() } as unknown as GPUDevice;
  const meter = new PerfMeter(device, false);
  meter.start(1000, true);
  assert.deepEqual(meter.end(), { intervalMs: 0, gpuMs: null });
  meter.start(1016.5, true);
  assert.deepEqual(meter.end(), { intervalMs: 16.5, gpuMs: null });
  assert.deepEqual(meter.lines, [], 'nothing shown while the readout is not asked for');
  const encoder = {} as GPUCommandEncoder;
  assert.equal(meter.timed(encoder), encoder);
});
