// Plays a built game headless and says where its thread is if it stops answering: the freeze and hang probe.
//
//     npx vite build --minify false --outDir <dist>
//     node tools/claude-toolkit/webgpu-stall.cjs <dist> [seconds=100] [beat] [--gpu]
//
// The built page is served on port 5173 (the only origin R2 answers), the game's worker given the picture driver's
// patches (webgpu-shot.cjs) and, unless --gpu, its GPU submissions dropped: SwiftShader draws a frame of the story
// every few seconds, too slow to reach a hang that comes minutes in, while with nothing submitted the worker's
// JavaScript runs every frame at full speed. A beat (`sighted`, `wreck`, ...) starts the story there, as `?prologue=`
// does in development: the unminified build's beat line is patched to read it. The probe taps to start, then every
// 10 s collects the worker's garbage and prints its heap and frames drawn; a worker that does not answer in 8 s is
// paused and its stack printed, and the probe exits 2.
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { extname, join } = require('node:path');
const { chromium } = require('playwright');
const { OWN_TEXTURE, SHADER_ERRORS } = require('./webgpu-shot.cjs');

const [dist, secondsArg, beatArg, flag] = process.argv.slice(2);
const gpu = [secondsArg, beatArg, flag].includes('--gpu');
const seconds = Number(secondsArg) || 100;
const beat = beatArg && beatArg !== '--gpu' ? beatArg : null;
const DROP_SUBMITS = () => {
  GPUQueue.prototype.submit = () => undefined;
};
// Dropped first, so the driver's count of frames wraps the dropping submit.
const prelude = [...(gpu ? [] : [DROP_SUBMITS]), OWN_TEXTURE, SHADER_ERRORS].map((patch) => `(${patch})();`).join('\n');
const BEAT_LINE = 'const from = backAtHelm(sessionStorage, prologuePlayed(localStorage)) ? "creation" : null;';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm' };

const served = createServer((asked, answer) => {
  let path = decodeURIComponent(new URL(asked.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let body;
  try {
    body = readFileSync(join(dist, path));
  } catch {
    answer.statusCode = 404;
    return answer.end();
  }
  if (/\/assets\/gameWorker-[^/]+\.js$/.test(path)) body = `${prelude}\n${body}`;
  else if (beat && path.endsWith('.js') && body.includes(BEAT_LINE))
    body = String(body).replace(BEAT_LINE, `const from = ${JSON.stringify(beat)};`);
  answer.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
  answer.end(body);
});

async function main() {
  await new Promise((done) => served.listen(5173, 'localhost', done));
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const started = Date.now();
  const clock = () => ((Date.now() - started) / 1000).toFixed(1);
  page.on('console', (said) => {
    if (said.type() === 'error') console.log(`${clock()} error: ${said.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => console.log(`${clock()} exception: ${error.message.slice(0, 300)}`));
  const cdp = await browser.newBrowserCDPSession();
  let worker = null;
  let stalled = false;
  // The worker's session, reached through the browser's own: each call given up after 8 s.
  let nextId = 0;
  const waiting = new Map();
  /** Each script's address by its id, as the debugger names them: a module's frames name none. */
  const scripts = new Map();
  cdp.on('Target.receivedMessageFromTarget', ({ message }) => {
    const said = JSON.parse(message);
    if (said.id && waiting.has(said.id)) waiting.get(said.id)(said);
    if (said.method === 'Debugger.scriptParsed') scripts.set(said.params.scriptId, said.params.url);
    if (said.method === 'Debugger.paused') {
      const stack = said.params.callFrames.slice(0, 16).map((frame) => {
        const where = (frame.url || scripts.get(frame.location.scriptId) || '').split('/').pop();
        return `  ${frame.functionName || '(anonymous)'} ${where}:${frame.location.lineNumber + 1}`;
      });
      console.log(`${clock()} the game's worker is stuck here:\n${stack.join('\n')}`);
    }
  });
  const call = (method, params = {}) => {
    const id = ++nextId;
    cdp.send('Target.sendMessageToTarget', { sessionId: worker, message: JSON.stringify({ id, method, params }) });
    return new Promise((done) => {
      waiting.set(id, done);
      setTimeout(() => waiting.delete(id) && done(null), 8000);
    });
  };
  await page.goto('http://localhost:5173/');
  while (Date.now() - started < seconds * 1000 && !stalled) {
    await page.waitForTimeout(10_000);
    if (!worker) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      const found = targetInfos.find((target) => target.type === 'worker' && /gameWorker/.test(target.url));
      if (!found) continue;
      ({ sessionId: worker } = await cdp.send('Target.attachToTarget', { targetId: found.targetId }));
      await call('Runtime.enable');
      await page.mouse.click(320, 180);
      await page.keyboard.press('Space');
    }
    await call('HeapProfiler.collectGarbage');
    const heap = await call('Runtime.getHeapUsage');
    const frames = await call('Runtime.evaluate', { expression: 'self.__shotFrames', returnByValue: true });
    if (!heap || !frames) {
      stalled = true;
      await call('Debugger.enable');
      await call('Debugger.pause');
      await page.waitForTimeout(3000);
      break;
    }
    const megabytes = (heap.result.usedSize / 1e6).toFixed(1);
    console.log(`${clock()} s: heap ${megabytes} MB after collection, ${frames.result.result.value} frames`);
  }
  console.log(stalled ? 'stalled' : `no stall in ${seconds} s`);
  await Promise.race([browser.close(), new Promise((done) => setTimeout(done, 5000))]);
  served.close();
  process.exit(stalled ? 2 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
