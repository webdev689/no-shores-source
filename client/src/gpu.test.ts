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

/** A WebGPU that hands out an adapter whose device and surface behave as `how` says, and the asks the shell heard. */
function webgpuWith(how: { readonly device?: 'refused' | 'lost'; readonly configure?: 'throws' } = {}) {
  const asked: string[] = [];
  let loseDevice: (info: { reason: string; message: string }) => void = () => undefined;
  const lost = new Promise<{ reason: string; message: string }>((resolve) => (loseDevice = resolve));
  if (how.device === 'lost') loseDevice({ reason: 'unknown', message: 'the device could not be made' });
  class Context {
    configure() {
      if (how.configure === 'throws') throw new TypeError('the format is not supported');
      asked.push('configured');
    }
  }
  const device = { lost, addEventListener: () => undefined };
  const adapter = {
    info: { vendor: 'nvidia', description: 'NVIDIA GeForce RTX 4070', backend: 'D3D12' },
    features: new Set<string>(),
    requestDevice: async () => {
      if (how.device === 'refused') throw new DOMException('the adapter is consumed', 'OperationError');
      return device;
    },
  };
  Object.defineProperty(globalThis, 'GPUCanvasContext', { value: Context, configurable: true });
  Object.defineProperty(navigator, 'gpu', {
    value: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' },
    configurable: true,
  });
  const canvas = { getContext: () => new Context() } as unknown as HTMLCanvasElement;
  useDesktop({ version: 'dev' } as DesktopInfo, (ask) =>
    asked.push(
      ask.ask === 'gpu'
        ? `gpu ${ask.report.device} ${ask.report.error}`.trim()
        : ask.ask === 'gpuLost'
          ? `gpuLost ${ask.reason}`
          : ask.ask,
    ),
  );
  const done = () => {
    Reflect.deleteProperty(navigator, 'gpu');
    Reflect.deleteProperty(globalThis, 'GPUCanvasContext');
    useDesktop(null, () => undefined);
  };
  return { asked, canvas, loseDevice, done };
}

test('the shell is told the device started only once its surface is drawn to, and why where it was not', async () => {
  const drawn = webgpuWith();
  try {
    await startGpu(drawn.canvas);
    assert.deepEqual(drawn.asked, ['gpuAsked', 'configured', 'gpu true']);
  } finally {
    drawn.done();
  }
  for (const [how, said] of [
    [{ configure: 'throws' }, 'gpu false TypeError: the format is not supported'],
    [{ device: 'refused' }, 'gpu false OperationError: the adapter is consumed'],
  ] as const) {
    const failed = webgpuWith(how);
    try {
      await assert.rejects(startGpu(failed.canvas));
      assert.deepEqual(failed.asked, ['gpuAsked', said]);
    } finally {
      failed.done();
    }
  }
});

test('a device WebGPU loses, even one it handed out already lost, is told to the shell; one destroyed is not', async () => {
  const born = webgpuWith({ device: 'lost' });
  try {
    await startGpu(born.canvas);
    await Promise.resolve();
    assert.ok(born.asked.includes('gpuLost the device could not be made'), born.asked.join(', '));
  } finally {
    born.done();
  }
  const later = webgpuWith();
  try {
    await startGpu(later.canvas);
    later.loseDevice({ reason: 'destroyed', message: 'the game closed it' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(!later.asked.some((ask) => ask.startsWith('gpuLost')), later.asked.join(', '));
  } finally {
    later.done();
  }
});

test('in a browser, with no shell, starting the GPU asks nothing of one', async () => {
  const browser = webgpuWith();
  useDesktop(null, (ask) => browser.asked.push(ask.ask));
  try {
    await startGpu(browser.canvas);
    assert.deepEqual(browser.asked, ['configured']);
  } finally {
    browser.done();
  }
});
