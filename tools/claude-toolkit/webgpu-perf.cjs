// Measures a built game headless: each frame's script time in the game's worker, the GPU calls and objects each frame
// makes, the worker's heap, and where its time and its garbage go (a CPU profile and an allocation profile of each
// window measured, through the browser's own debugging protocol). The performance probe.
//
//     npx vite build --minify false --outDir <dist>        (NODE_ENV=development for the QA hooks, `&spawn=`)
//     node tools/claude-toolkit/webgpu-perf.cjs <dist> <plan.json> <out folder>
//
// The plan: { "url": "/?at=overlook-social&spawn=", "size": [1280, 720], "gpu": false, "steps": [ ... ] }. Without
// "gpu", nothing is submitted to the GPU (the picture driver's DROP_SUBMITS), so the worker's JavaScript runs every
// frame at full speed; with it SwiftShader draws, seconds a frame, for a `shot`. Steps: { "wait": s },
// { "until": "js, true once ready", "timeout": s }, { "waitFor": "words shown" }, { "key" | "down" | "up": "w" },
// { "hold": ["w", s] }, { "clickText": "words" }, { "eval": "js" }, { "frames": n }, { "shot": "file.png" } and
// { "measure": s, "name": "hub", "alloc": true, "profile": true }. A measure writes <name>.json (frame times, their
// mean, p50, p95, p99 and worst, the GPU calls a frame, the heap, the heaviest functions by self and total time and,
// with "alloc", by bytes allocated), <name>.cpuprofile and <name>.heapprofile to open in Chrome's DevTools, and
// <name>.frames.json. "replace": [[from, to], ...] patches the built scripts as they are served (to lend a value to
// `self`, say). A 20 s window varies by some 15% from run to run in its frame times and draw counts: compare builds by
// the allocation profile, which is exact per site, or by several runs. The CPU profile is stopped before the
// allocation sampler, whose stop stalls the worker. For V8's own count of collections, run with TRACE_GC=1 and
// DEBUG=pw:browser: each scavenge is printed with its pause.
const { createServer } = require('node:http');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { extname, resolve, sep } = require('node:path');
const { chromium } = require('playwright');
const { DROP_SUBMITS, OWN_TEXTURE, SHADER_ERRORS } = require('./webgpu-shot.cjs');

// Counts every GPU call and object made, a frame at a time: the counts are zeroed as each frame begins.
const COUNTS = () => {
  if (typeof GPUDevice === 'undefined') return;
  const counts = {};
  self.__gpuCounts = counts;
  const wrap = (proto, name, bytesOf) => {
    const original = proto?.[name];
    if (!original) return;
    proto[name] = function (...args) {
      counts[name] = (counts[name] ?? 0) + 1;
      if (bytesOf) counts[`${name}Bytes`] = (counts[`${name}Bytes`] ?? 0) + bytesOf(args);
      return original.apply(this, args);
    };
  };
  const passCalls = ['draw', 'drawIndexed', 'drawIndirect', 'setPipeline', 'setBindGroup', 'setVertexBuffer'];
  for (const name of [...passCalls, 'setIndexBuffer']) wrap(GPURenderPassEncoder.prototype, name);
  for (const name of ['dispatchWorkgroups']) wrap(GPUComputePassEncoder.prototype, name);
  for (const name of ['beginRenderPass', 'beginComputePass', 'copyTextureToTexture', 'finish'])
    wrap(GPUCommandEncoder.prototype, name);
  wrap(GPUQueue.prototype, 'writeBuffer', ([, , data, dataOffset, size]) => {
    const element = data.BYTES_PER_ELEMENT ?? 1;
    return size !== undefined ? size * element : (data.byteLength ?? 0) - (dataOffset ?? 0) * element;
  });
  wrap(GPUQueue.prototype, 'writeTexture', ([, data]) => data.byteLength ?? 0);
  wrap(GPUQueue.prototype, 'submit');
  const made = ['createBuffer', 'createTexture', 'createBindGroup', 'createSampler', 'createCommandEncoder'];
  for (const name of [...made, 'createRenderPipeline', 'createShaderModule'])
    wrap(GPUDevice.prototype, name, name === 'createBuffer' ? ([descriptor]) => descriptor.size : undefined);
  wrap(GPUTexture.prototype, 'createView');
};

// Each frame's script time and the calls it made, kept while a measure runs.
const FRAME_TIME = () => {
  const frames = [];
  self.__perfFrames = frames;
  self.__perfOn = false;
  const next = self.requestAnimationFrame.bind(self);
  self.requestAnimationFrame = (callback) =>
    next((now) => {
      const counts = self.__gpuCounts;
      if (counts) for (const key of Object.keys(counts)) counts[key] = 0;
      const began = performance.now();
      try {
        callback(now);
      } finally {
        if (self.__perfOn) frames.push({ took: performance.now() - began, at: began, counts: { ...counts } });
      }
    });
};

const TYPES = {
  ...{ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' },
  ...{ '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' },
  ...{ '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' },
};

const [distArgument, planArgument, outArgument] = process.argv.slice(2);
const dist = resolve(distArgument);
const plan = JSON.parse(readFileSync(planArgument, 'utf8'));
const out = resolve(outArgument);
const patches = [...(plan.gpu ? [] : [DROP_SUBMITS]), OWN_TEXTURE, SHADER_ERRORS, COUNTS, FRAME_TIME];
const prelude = patches.map((patch) => `(${patch})();`).join('\n');

const served = createServer((asked, answer) => {
  let path = decodeURIComponent(new URL(asked.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(dist, `.${path}`);
  let body;
  try {
    if (!file.startsWith(dist + sep)) throw new Error('outside the build');
    body = readFileSync(file);
  } catch {
    answer.statusCode = 404;
    return answer.end();
  }
  if (/\/assets\/gameWorker-[^/]+\.js$/.test(path)) body = `${prelude}\n${body}`;
  if (path.endsWith('.js'))
    for (const [from, to] of plan.replace ?? []) if (String(body).includes(from)) body = String(body).replace(from, to);
  answer.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
  answer.end(body);
});

const where = (callFrame) =>
  `${callFrame.functionName || '(anonymous)'} ${callFrame.url.split('/').pop()}:${callFrame.lineNumber + 1}`;
const shares = (counted, total) =>
  [...counted].sort((one, other) => other[1] - one[1]).map(([key, count]) => [key, +((count / total) * 100).toFixed(1)]);

/** A CPU profile's time by function, as shares of its samples: each function's own, and with all it called. */
function timesOf(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  const [own, within] = [new Map(), new Map()];
  for (const id of profile.samples) {
    own.set(where(byId.get(id).callFrame), (own.get(where(byId.get(id).callFrame)) ?? 0) + 1);
    const seen = new Set();
    for (let node = id; node !== undefined; node = parentOf.get(node)) seen.add(where(byId.get(node).callFrame));
    for (const key of seen) within.set(key, (within.get(key) ?? 0) + 1);
  }
  return { self: shares(own, profile.samples.length), total: shares(within, profile.samples.length) };
}

/** An allocation profile's kilobytes by the function that allocated them, heaviest first. */
function allocationsOf(profile) {
  const bytes = new Map();
  const walk = (node) => {
    bytes.set(where(node.callFrame), (bytes.get(where(node.callFrame)) ?? 0) + node.selfSize);
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  const sorted = [...bytes].sort((one, other) => other[1] - one[1]);
  const total = sorted.reduce((sum, [, size]) => sum + size, 0);
  return { megabytes: +(total / 1e6).toFixed(1), sites: sorted.map(([key, size]) => [key, Math.round(size / 1e3)]) };
}

const quantile = (sorted, share) => +(sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0);

async function main() {
  mkdirSync(out, { recursive: true });
  await new Promise((done) => served.listen(5173, 'localhost', done));
  const traced = process.env.TRACE_GC ? ['--js-flags=--trace-gc'] : [];
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', ...traced],
  });
  const [width, height] = plan.size ?? [1280, 720];
  const page = await browser.newPage({ viewport: { width, height } });
  const started = Date.now();
  const clock = () => ((Date.now() - started) / 1000).toFixed(1);
  page.on('console', (said) => {
    if (said.type() === 'error') console.log(`${clock()} error: ${said.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => console.log(`${clock()} exception: ${error.message.slice(0, 300)}`));
  let game = null;
  page.on('worker', (worker) => {
    if (worker.url().includes('gameWorker')) game = worker;
  });
  // The workers' own sessions, reached through the browser's, each call given up after a minute or two.
  const cdp = await browser.newBrowserCDPSession();
  let nextId = 0;
  const waiting = new Map();
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
    const said = JSON.parse(message);
    if (said.id && waiting.has(said.id)) waiting.get(said.id)(said.result ?? null);
  });
  const call = (session, method, params = {}, seconds = 120) =>
    new Promise((done) => {
      const id = ++nextId;
      waiting.set(id, done);
      const message = JSON.stringify({ id, method, params });
      cdp.send('Target.sendMessageToTarget', { sessionId: session, message }).catch(() => done(null));
      setTimeout(() => waiting.delete(id) && done(null), seconds * 1000);
    });
  const sessions = new Map();
  const attach = async (named) => {
    if (sessions.has(named)) return sessions.get(named);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const found = targetInfos.find((target) => target.type === 'worker' && target.url.includes(named));
    if (!found) return null;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: found.targetId });
    sessions.set(named, sessionId);
    return sessionId;
  };
  await page.goto(`http://localhost:5173${plan.url}`);
  await page.waitForEvent('worker', { predicate: (worker) => worker.url().includes('gameWorker'), timeout: 30_000 });
  const driven = () => game ?? page;
  const shown = async (words, seconds = 300) => {
    const until = Date.now() + seconds * 1000;
    for (;;) {
      const all = await driven().evaluate(() => self.__ui?.() ?? null).catch(() => null);
      const found = all?.findLast((node) => node.words?.toLowerCase().includes(words.toLowerCase()));
      if (found) return found;
      if (Date.now() > until) throw new Error(`"${words}" did not show in ${seconds} s`);
      await page.waitForTimeout(500);
    }
  };
  for (const step of plan.steps) {
    const began = Date.now();
    if (step.wait) await page.waitForTimeout(step.wait * 1000);
    else if (step.until) {
      const until = Date.now() + (step.timeout ?? 300) * 1000;
      while (!(await driven().evaluate(step.until).catch(() => false))) {
        if (Date.now() > until) throw new Error(`${step.until} was not met`);
        await page.waitForTimeout(500);
      }
    } else if (step.waitFor) await shown(step.waitFor, step.timeout);
    else if (step.key) await page.keyboard.press(step.key);
    else if (step.down) await page.keyboard.down(step.down);
    else if (step.up) await page.keyboard.up(step.up);
    else if (step.hold) {
      await page.keyboard.down(step.hold[0]);
      await page.waitForTimeout(step.hold[1] * 1000);
      await page.keyboard.up(step.hold[0]);
    } else if (step.clickText) {
      const node = await shown(step.clickText, step.timeout);
      await page.mouse.click(node.x + node.width / 2, node.y + node.height / 2);
    } else if (step.eval) console.log(`${clock()} eval:`, String(JSON.stringify(await driven().evaluate(step.eval))));
    else if (step.frames) {
      const from = await game.evaluate(() => self.__shotFrames);
      while ((await game.evaluate(() => self.__shotFrames)) < from + step.frames) await page.waitForTimeout(200);
    } else if (step.shot) {
      const laid = await game.evaluate(() => self.__shotLay());
      if (laid?.png) writeFileSync(`${out}/${step.shot}`, Buffer.from(laid.png, 'base64'));
      else console.log('shot:', laid);
    } else if (step.measure) await measure(step, { game, call, attach, page, clock });
    console.log(`${clock()} ${JSON.stringify(step).slice(0, 100)} ${((Date.now() - began) / 1000).toFixed(1)} s`);
  }
  await Promise.race([browser.close(), new Promise((done) => setTimeout(done, 5000))]);
  served.close();
}

/** Measures `step.measure` seconds of frames, and profiles them, writing what it found under the step's name. */
async function measure(step, { game, call, attach, page, clock }) {
  const name = step.name ?? 'measure';
  const worker = await attach('gameWorker');
  await call(worker, 'Profiler.enable');
  await call(worker, 'Profiler.setSamplingInterval', { interval: 250 });
  await call(worker, 'HeapProfiler.collectGarbage');
  const before = await call(worker, 'Runtime.getHeapUsage');
  const profiling = step.profile !== false;
  if (profiling) await call(worker, 'Profiler.start');
  // Every allocation sampled, those already collected too, not only what still lives when the sampler stops.
  const sampling = { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true };
  if (step.alloc) await call(worker, 'HeapProfiler.startSampling', { ...sampling, includeObjectsCollectedByMinorGC: true });
  await game.evaluate(() => {
    self.__perfFrames.length = 0;
    self.__perfOn = true;
  });
  const heaps = [];
  for (const until = Date.now() + step.measure * 1000; Date.now() < until; ) {
    await page.waitForTimeout(1000);
    heaps.push((await call(worker, 'Runtime.getHeapUsage'))?.usedSize ?? 0);
  }
  const frames = await game.evaluate(() => {
    self.__perfOn = false;
    return self.__perfFrames.splice(0);
  });
  const profile = profiling ? (await call(worker, 'Profiler.stop'))?.profile : null;
  const allocated = step.alloc ? (await call(worker, 'HeapProfiler.stopSampling'))?.profile : null;
  await call(worker, 'HeapProfiler.collectGarbage');
  const after = await call(worker, 'Runtime.getHeapUsage');
  const took = frames.map((frame) => frame.took).sort((one, other) => one - other);
  const perFrame = {};
  for (const key of new Set(frames.flatMap((frame) => Object.keys(frame.counts))))
    perFrame[key] = +(frames.reduce((sum, frame) => sum + (frame.counts[key] ?? 0), 0) / frames.length).toFixed(1);
  const megabytes = (bytes) => +((bytes ?? 0) / 1e6).toFixed(1);
  const found = {
    name,
    frames: frames.length,
    ms: {
      mean: +(took.reduce((sum, each) => sum + each, 0) / Math.max(1, took.length)).toFixed(2),
      ...Object.fromEntries([50, 95, 99].map((percent) => [`p${percent}`, +quantile(took, percent / 100).toFixed(2)])),
      worst: +(took.at(-1) ?? 0).toFixed(2),
    },
    over16ms: took.filter((each) => each > 1000 / 60).length,
    heapMB: { before: megabytes(before?.usedSize), after: megabytes(after?.usedSize), most: megabytes(Math.max(...heaps)) },
    perFrame,
    ...(profile ? timesOf(profile) : {}),
    ...(allocated ? { allocated: allocationsOf(allocated) } : {}),
  };
  if (profile) writeFileSync(`${out}/${name}.cpuprofile`, JSON.stringify(profile));
  if (allocated) writeFileSync(`${out}/${name}.heapprofile`, JSON.stringify(allocated));
  writeFileSync(`${out}/${name}.frames.json`, JSON.stringify(took.map((each) => +each.toFixed(2))));
  const listed = { ...found, self: found.self?.slice(0, 60), total: found.total?.slice(0, 60) };
  writeFileSync(`${out}/${name}.json`, JSON.stringify(listed, null, 1));
  console.log(`${clock()} ${name}: ${frames.length} frames, ms ${JSON.stringify(found.ms)}, heap ${JSON.stringify(found.heapMB)}`);
  if (found.allocated) console.log(`  allocated ${found.allocated.megabytes} MB, most by ${found.allocated.sites[0]?.[0]}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
