import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GpuReport } from '../../client/src/desktop.ts';
import type { GraphicsFailure, GraphicsSeen } from './config.ts';
import type { Box } from './crashes.ts';
import { BACKEND_ARGUMENT, type Desk, type Launch } from './graphics.ts';
import { ASK_WITHIN_MS, GPU_GONE_WITHIN_MS, REPORT_WITHIN_MS, failureIn, watchGraphics } from './graphicsWatch.ts';

const windows: Desk = { platform: 'win32', wayland: false };
const wayland: Desk = { platform: 'linux', wayland: true };
const card: GpuReport = {
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
const launchOf = (backend: Launch['backend'], next: Launch['next']): Launch => ({
  backend,
  next,
  chosen: 'auto',
  held: null,
  named: false,
  afresh: false,
});

test('the default takes whatever card and API Chromium gives it', () => {
  assert.equal(failureIn(card, 'd3d12', windows), null);
  assert.equal(failureIn({ ...card, backend: 'D3D11' }, 'd3d12', windows), null);
});

test('a backend asked for by its switches must be the one the game draws with, in any case', () => {
  assert.equal(failureIn({ ...card, backend: 'D3D11' }, 'd3d11', windows), null);
  assert.match(failureIn(card, 'd3d11', windows) ?? '', /drew with d3d12, not d3d11/);
  assert.equal(failureIn({ ...card, backend: 'vulkan' }, 'vulkan-skia', wayland), null);
});

test('no adapter, a software one, or a device that would not start, fails the launch', () => {
  assert.match(failureIn({ ...card, adapter: false }, 'd3d12', windows) ?? '', /no adapter/);
  assert.match(failureIn({ ...card, fallback: true, description: 'SwiftShader' }, 'd3d12', windows) ?? '', /software/);
  assert.match(failureIn({ ...card, type: 'CPU' }, 'vulkan', wayland) ?? '', /software/);
  assert.match(failureIn({ ...card, device: false, error: 'lost' }, 'd3d12', windows) ?? '', /did not start: lost/);
});

test('a run that tests the app on SwiftShader takes its software adapter', () => {
  assert.equal(failureIn({ ...card, fallback: true, type: 'CPU', backend: 'vulkan' }, 'swiftshader', wayland), null);
});

/** A watch over `launch` with every effect recorded, its clock and timers in the test's hands. */
function harness(launch: Launch, desk: Desk, answers: (number | null)[] = [], writes = true) {
  let clock = 1000;
  const timers: { at: number; work: () => void; live: boolean }[] = [];
  const told: Box[] = [];
  const asked: Box[] = [];
  const restarts: (readonly string[])[] = [];
  let failures: readonly GraphicsFailure[] = [];
  let seen: readonly GraphicsSeen[] = [];
  const watch = watchGraphics(launch, desk, '156.0', {
    failures: () => failures,
    keepFailures: (kept) => ((failures = kept), writes),
    seen: () => seen,
    keepSeen: (kept) => void (seen = kept),
    gpuKey: () => Promise.resolve('10de:2786@566.36'),
    tell: (box) => Promise.resolve(void told.push(box)),
    ask: (box, stop) =>
      new Promise((answer) => {
        asked.push(box);
        const given = answers.shift();
        // As Electron's box does: closed by its signal, it answers as if cancelled, with its cancel button.
        if (given === undefined) stop.addEventListener('abort', () => answer(box.cancelId));
        else answer(given);
      }),
    restart: (args) => void restarts.push(args),
    later: (work, milliseconds) => {
      const timer = { at: clock + milliseconds, work, live: true };
      timers.push(timer);
      return () => void (timer.live = false);
    },
    now: () => clock,
    log: () => undefined,
  });
  const pass = async (milliseconds: number) => {
    clock += milliseconds;
    for (const timer of timers.filter((one) => one.live && one.at <= clock)) {
      timer.live = false;
      timer.work();
    }
    await new Promise((settled) => setTimeout(settled, 0));
  };
  return { watch, told, asked, restarts, pass, failures: () => failures, seen: () => seen };
}

test('a game slow to load, or that never loads, is no failure of the graphics: the clock runs from its ask', async () => {
  const run = harness(launchOf('d3d12', ['d3d11']), windows);
  await run.pass(REPORT_WITHIN_MS * 5);
  assert.deepEqual([run.failures(), run.restarts], [[], []]);
});

test('a launch whose game draws as it should is left alone', async () => {
  const run = harness(launchOf('d3d12', ['d3d11']), windows);
  run.watch.gpuAsked();
  await run.watch.report(card);
  await run.pass(REPORT_WITHIN_MS * 2);
  await run.watch.drawn();
  assert.deepEqual([run.told, run.asked, run.restarts, run.failures()], [[], [], [], []]);
});

test('a failure is kept by card and Chromium, told, and the app starts again on the next backend', async () => {
  const run = harness(launchOf('d3d12', ['d3d11']), windows);
  await run.watch.report({ ...card, adapter: false });
  assert.deepEqual(
    run.failures().map((failure) => [failure.backend, failure.gpu, failure.chromium]),
    [['d3d12', '10de:2786@566.36', '156.0']],
  );
  assert.equal(run.told[0]?.message, 'Direct3D 12 could not start on this graphics card');
  assert.match(run.told[0]?.detail ?? '', /starts again with Direct3D 11/);
  assert.deepEqual(run.restarts, [[]]);
});

test('the same API reached another way is told as such', async () => {
  const run = harness(launchOf('vulkan', ['vulkan-unlisted', 'vulkan-skia']), wayland);
  await run.watch.report({ ...card, adapter: false });
  assert.match(run.told[0]?.detail ?? '', /reaching Vulkan another way/);
});

test('a failure that could not be kept starts the backends left in turn, by name', async () => {
  const run = harness(launchOf('vulkan', ['vulkan-unlisted', 'vulkan-skia']), wayland, [], false);
  await run.watch.report({ ...card, adapter: false });
  assert.deepEqual(run.restarts, [[`${BACKEND_ARGUMENT}vulkan-unlisted,vulkan-skia`]]);
  const named = harness({ ...launchOf('vulkan-unlisted', ['vulkan-skia']), named: true }, wayland);
  await named.watch.report({ ...card, adapter: false });
  assert.deepEqual(named.restarts, [[`${BACKEND_ARGUMENT}vulkan-skia`]], 'a named launch with backends left goes on');
  assert.deepEqual(named.failures(), [], 'and keeps nothing');
});

test('with no backend left the player is told what to do, and the app does not start again', async () => {
  const run = harness(launchOf('vulkan-skia', []), { platform: 'linux', wayland: false });
  await run.watch.report({ ...card, adapter: false });
  assert.equal(run.told[0]?.message, 'No Shores could not start your graphics card');
  assert.match(run.told[0]?.detail ?? '', /Vulkan driver/);
  assert.deepEqual(run.restarts, []);
});

test('a game that asked WebGPU for its adapter and says nothing within a minute fails the launch, once', async () => {
  const run = harness(launchOf('d3d12', ['d3d11']), windows);
  run.watch.gpuAsked();
  run.watch.gpuAsked();
  await run.pass(REPORT_WITHIN_MS + 1);
  assert.match(run.failures()[0]?.reason ?? '', /said nothing/);
  assert.equal(run.restarts.length, 1);
  await run.watch.report(card);
  assert.equal(run.restarts.length, 1, 'a late word changes nothing');
});

test("a GPU process lost in the launch's first minute fails it; one lost later does not", async () => {
  const early = harness(launchOf('d3d12', ['d3d11']), windows);
  await early.watch.gpuGone('crashed');
  assert.equal(early.restarts.length, 1);
  const late = harness(launchOf('d3d12', ['d3d11']), windows);
  await late.pass(GPU_GONE_WITHIN_MS + 1);
  await late.watch.gpuGone('crashed');
  assert.equal(late.restarts.length, 0);
});

test('on a backend that may draw blank, the player is asked once whether they see the game, and a yes is kept', async () => {
  const run = harness(launchOf('d3d11', ['d3d12']), windows, [0]);
  await run.watch.report({ ...card, backend: 'D3D11' });
  await run.watch.drawn();
  assert.equal(run.asked[0]?.message, 'Can you see the game?');
  assert.deepEqual(run.seen(), [{ backend: 'd3d11', gpu: '10de:2786@566.36', chromium: '156.0' }]);
  assert.deepEqual(run.restarts, []);
});

test('Go back fails the backend without a second notice; no answer starts the next once, keeping nothing', async () => {
  const back = harness(launchOf('d3d11', ['d3d12']), windows, [1]);
  await back.watch.report({ ...card, backend: 'D3D11' });
  await back.watch.drawn();
  assert.deepEqual([back.told, back.failures().length, back.restarts], [[], 1, [[]]]);
  const silent = harness(launchOf('d3d11', ['d3d12']), windows);
  await silent.watch.report({ ...card, backend: 'D3D11' });
  const asking = silent.watch.drawn();
  await silent.pass(0);
  await silent.pass(ASK_WITHIN_MS + 1);
  await asking;
  assert.deepEqual([silent.failures().length, silent.restarts], [0, [[`${BACKEND_ARGUMENT}d3d12`]]]);
});

test('the last backend left asks too: a blank window is told what to do, and no answer changes nothing', async () => {
  const blank = harness(launchOf('d3d11', []), windows, [1]);
  await blank.watch.report({ ...card, backend: 'D3D11' });
  await blank.watch.drawn();
  assert.match(blank.asked[0]?.detail ?? '', /says what to do/);
  assert.deepEqual(
    [blank.told.map((box) => box.message), blank.failures().length, blank.restarts],
    [['No Shores could not start your graphics card'], 1, []],
  );
  const silent = harness(launchOf('d3d11', []), windows);
  await silent.watch.report({ ...card, backend: 'D3D11' });
  const asking = silent.watch.drawn();
  await silent.pass(0);
  await silent.pass(ASK_WITHIN_MS + 1);
  await asking;
  assert.deepEqual([silent.asked.length, silent.told, silent.failures(), silent.restarts], [1, [], [], []]);
});

test("a GPU WebGPU lost early fails the launch with WebGPU's words", async () => {
  const run = harness(launchOf('vulkan', ['vulkan-unlisted']), wayland);
  await run.watch.report({ ...card, backend: 'vulkan' });
  await run.watch.gpuGone('WebGPU lost the device: the driver reset');
  assert.equal(run.failures()[0]?.reason, 'WebGPU lost the device: the driver reset');
  assert.equal(run.restarts.length, 1);
});

test('the default and a launch named for itself never ask', async () => {
  for (const launch of [launchOf('d3d12', ['d3d11']), { ...launchOf('d3d11', ['d3d12']), named: true }]) {
    const run = harness(launch, windows);
    await run.watch.report({ ...card, backend: launch.backend === 'd3d12' ? 'D3D12' : 'D3D11' });
    await run.watch.drawn();
    assert.deepEqual(run.asked, []);
  }
});

test('the player is asked once a launch, however often the page loads again', async () => {
  const run = harness(launchOf('d3d11', ['d3d12']), windows, [0, 0]);
  await run.watch.report({ ...card, backend: 'D3D11' });
  await Promise.all([run.watch.drawn(), run.watch.drawn()]);
  await run.watch.drawn();
  assert.equal(run.asked.length, 1);
});
