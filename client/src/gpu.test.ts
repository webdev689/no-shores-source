import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type DesktopAsk, type DesktopInfo, useDesktop } from './desktop.ts';
import { GpuUnavailable, gpuReportOf, startGpu, stopWhenLost, viewOf } from './gpu.ts';

const lostAs = (reason: 'destroyed' | 'unknown', message: string) => ({
  lost: Promise.resolve({ reason, message } as GPUDeviceLostInfo),
});

test('a device lost tells the player to reload; one destroyed on purpose says nothing', async () => {
  const said: string[] = [];
  stopWhenLost(lostAs('unknown', 'the driver was reset'), (message) => said.push(message));
  stopWhenLost(lostAs('destroyed', 'closed'), (message) => said.push(message));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(said, ['The graphics device was lost (the driver was reset). Reload the page.']);
});

test("a texture's whole view is made once and handed out again; another texture has its own", () => {
  let made = 0;
  const texture = () => ({ createView: () => ({ made: ++made }) }) as unknown as GPUTexture;
  const [one, other] = [texture(), texture()];
  assert.equal(viewOf(one), viewOf(one));
  assert.equal(made, 1);
  assert.notEqual(viewOf(other), viewOf(one));
  assert.equal(made, 2);
});

test("the desktop app is told the adapter's own words, the backend and type where Chromium says them", () => {
  const adapter = {
    info: {
      vendor: 'nvidia',
      architecture: 'ada-lovelace',
      description: 'NVIDIA GeForce RTX 4070',
      backend: 'vulkan',
      type: 'discrete GPU',
      driver: 'NVIDIA 566.36',
      isFallbackAdapter: false,
    },
  } as unknown as GPUAdapter;
  assert.deepEqual(gpuReportOf(adapter, ''), {
    adapter: true,
    device: true,
    backend: 'vulkan',
    type: 'discrete GPU',
    vendor: 'nvidia',
    architecture: 'ada-lovelace',
    description: 'NVIDIA GeForce RTX 4070',
    driver: 'NVIDIA 566.36',
    fallback: false,
    error: '',
  });
});

test('an adapter that draws on the CPU says so, in the field the browser has', () => {
  const now = { info: { vendor: 'google', architecture: 'swiftshader', isFallbackAdapter: true } };
  const older = { info: { vendor: 'google' }, isFallbackAdapter: true };
  assert.equal(gpuReportOf(now as unknown as GPUAdapter, '').fallback, true);
  assert.equal(gpuReportOf(older as unknown as GPUAdapter, '').fallback, true);
});

test('no adapter, or a device that would not start, is told with why', () => {
  assert.deepEqual(
    [gpuReportOf(null, '').adapter, gpuReportOf(null, '').device, gpuReportOf(null, '').backend],
    [false, false, ''],
  );
  const failed = gpuReportOf({ info: { vendor: 'amd' } } as unknown as GPUAdapter, 'OperationError: lost');
  assert.deepEqual([failed.adapter, failed.device, failed.error], [true, false, 'OperationError: lost']);
});

test('in the app the shell hears the game ask WebGPU, then what it got, however the ask ends', async () => {
  const asked: DesktopAsk[] = [];
  useDesktop({ version: 'dev' } as DesktopInfo, (ask) => asked.push(ask));
  const canvas = {} as HTMLCanvasElement;
  try {
    await assert.rejects(startGpu(canvas), GpuUnavailable);
    assert.deepEqual(
      asked.map((ask) => [ask.ask, ask.ask === 'gpu' ? ask.report.adapter : null]),
      [['gpu', false]],
      'a browser with no WebGPU says so at once',
    );
    asked.length = 0;
    for (const requestAdapter of [async () => null, async () => Promise.reject(new Error('the driver hung up'))]) {
      Object.defineProperty(navigator, 'gpu', { value: { requestAdapter }, configurable: true });
      await assert.rejects(startGpu(canvas));
    }
    assert.deepEqual(
      asked.map((ask) => (ask.ask === 'gpu' ? `gpu ${ask.report.adapter} ${ask.report.error}` : ask.ask)),
      ['gpuAsked', 'gpu false ', 'gpuAsked', 'gpu false Error: the driver hung up'],
    );
  } finally {
    Reflect.deleteProperty(navigator, 'gpu');
    useDesktop(null, () => undefined);
  }
});
