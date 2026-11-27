// Drives a WebGPU page of the game in headless Chromium and takes pictures of it: Browser QA's driver.
//
//     node tools/claude-toolkit/webgpu-shot.cjs <steps.json>
//
// Headless SwiftShader has no shared-image backing for a WebGPU canvas, so presenting to one loses the device a few
// seconds in. The page's canvas context is given a texture of its own instead, and a picture reads that texture back
// and lays it over the canvas before Playwright's screenshot, so the page's own HTML is in it too. The game draws in
// a worker of its own (`gameWorker.ts`, on the page's canvas handed over), where the page's init scripts never run:
// the driver puts the same hooks and the plan's "init" at the head of that worker's script as it is fetched, runs
// every "eval", "frames" and view step in the worker, and writes a picture straight from the worker's texture, the
// HUD being drawn in it. A page without that worker (the World Editor) is driven on the page as before. The
// forge's R2 bucket answers CORS for http://localhost:5173 alone: run `npx vite --port 5173` first, or, where another
// checkout holds 5173, Vite on any port with "anyPort": true, and the driver fetches R2 for the page.
//
// steps.json: { "url": "...", "size": [w, h], "routes": { "<url part>": "<local file>" }, "anyPort": true, "init": "js
// run before the page's own, e.g. a shifted Date.now for the world's hour", "steps": [ ... ] }, each step one of
// { "wait": seconds }, { "waitFor": "words shown" }, { "key": "Escape" }, { "click": [x, y] }, { "move": [x, y] }
// (the pointer brought there, no button: a hover), { "down": [x, y, "right"] } and { "up": "right" } (a button pressed
// there and let go after the steps between, a "move" between them a drag; "left" unless named),
// { "wheel": [x, y, deltaY, notches] }, { "hold": ["ArrowLeft", seconds] }, { "clickText": "Return to ship" },
// { "press": "<node id>" }, { "ui": "out.json" }, { "eval": "js" }, { "shot": "out.png" }. The page has no HTML to
// read, so `waitFor`, `clickText` and `press` read the game's own interface (`ui/seen.ts`: `__ui()`, in the worker or
// on the page): the words match without case, the topmost node holding them is clicked at its middle, and each waits
// until it shows (`timeout` seconds, 180 unless said); `ui` writes every node shown, its id, words and box in the
// page's CSS pixels. With "noGpu": true in the plan, nothing is given to the GPU: the game's JavaScript runs every
// frame at full speed, its interface still laid, for a check of what it does rather than how it looks; it takes no
// picture. A held key acts at the page's slow headless frames: an arrow turns the
// player about 0.03 rad a second. { "frames": n } waits until the page has drawn n more frames: read what a frame
// writes (a panel, a note) only after one has drawn; the World Editor draws only when something changes, so on its
// page that waits for a change: give it a `wait`. Every frame is paced from the first: the page's next animation
// frame waits until the GPU has done the last one's work, so SwiftShader never builds a backlog that a picture then
// waits minutes behind. The console's errors are printed, and so is every shader that fails to compile: WebGPU
// reports those only as warnings, so a broken shader would otherwise draw nothing and say nothing; so is every WebGPU
// validation error, which loses a frame without a word. The game takes one
// wheel notch a frame, so a wheel step sends its notches (1 unless said) 0.1 s apart: from the arrival's 4.5 m, about
// 20 notches in (deltaY < 0) reach first person. To arrive in a camera instead, the address asks for it as it asks
// for a spawn: `&view=first` or `&view=third,<metres>`. Many views in one load (a page takes minutes to load),
// offline behind the same `&spawn=` flag: { "views": [[east, south, bearing, "first" | "third,<m>[,<degrees down>]",
// "name"], ...] or "<list.json>", "zone": "<key of the list>", "into": "<folder>", "settle": seconds } arrives the
// body at each view in turn, inside the node the page loaded, waits `settle` seconds (the ground and the sky come in)
// and writes `<into>/<name>.png`, or `<into>/<number>.png` without a name, once `__qaWhere` says the place is drawn
// whole. A view outside the node is said to be refused and skipped. One run at a time holds the machine (a lock in
// the temporary folder), and a server on the plan's port that serves another checkout is refused.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/** Where the run that holds the machine's one picture run writes its pid. */
const LOCK = join(tmpdir(), 'webgpu-shot.lock');

// One picture run at a time on the machine: two at once outrun its memory and slow each other's frames. A lock whose
// run has died is taken over.
function takeLock(lock = LOCK) {
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx' });
  } catch {
    const holder = Number(readFileSync(lock, 'utf8'));
    let alive = holder > 0 && holder !== process.pid;
    try {
      if (alive) process.kill(holder, 0);
    } catch (error) {
      alive = error.code === 'EPERM';
    }
    if (alive) throw new Error(`another picture run (pid ${holder}) holds ${lock}; wait for it`);
    writeFileSync(lock, String(process.pid));
  }
  process.on('exit', () => {
    if (existsSync(lock) && Number(readFileSync(lock, 'utf8')) === process.pid) unlinkSync(lock);
  });
}

// A server on the plan's port that serves another checkout would picture that checkout's code. A dev server serves
// its own checkout's files under /@fs/ and refuses another's; a built page names hashed scripts this checkout's
// dist/ holds. A server not up yet is left to the page's own load to report.
async function servesThisCheckout(url, top) {
  const page = await fetch(url).then((response) => response.text(), () => null);
  if (page === null) return true;
  if (page.includes('/@vite/client')) return (await fetch(new URL(`/@fs${top}/package.json`, url))).ok;
  const script = /\bsrc="[^"]*?(assets\/[^"]+\.js)"/.exec(page)?.[1];
  return script !== undefined && existsSync(join(top, 'dist', script));
}

// Nothing reaches the GPU: put before OWN_TEXTURE, so its count of frames wraps the dropping submit.
const DROP_SUBMITS = () => {
  GPUQueue.prototype.submit = () => undefined;
};

const SHADER_ERRORS = () => {
  if (typeof GPUAdapter === 'undefined') return;
  // A validation error (a destroyed buffer drawn, a bad binding) loses the frame without a word: say each one.
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (descriptor) {
    const device = await requestDevice.call(this, descriptor);
    device.addEventListener('uncapturederror', (event) => console.error(`WebGPU: ${event.error.message}`));
    return device;
  };
  const create = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (descriptor) {
    const made = create.call(this, descriptor);
    made.getCompilationInfo().then((info) => {
      for (const note of info.messages)
        if (note.type === 'error')
          console.error(`WGSL ${note.lineNum}: ${note.message} | ${(descriptor.code.split('\n')[note.lineNum - 1] ?? '').trim()}`);
    });
    return made;
  };
};

// Runs on the page or, put at the head of the game's worker script, in the worker: `self` is either's global.
const OWN_TEXTURE = () => {
  const window = self;
  const kept = new WeakMap();
  // A frame counts once it has given the GPU work: frames before the first draw (loading) do not.
  let done = Promise.resolve();
  let submitted = false;
  window.__shotFrames = 0;
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (buffers) {
    submit.call(this, buffers);
    submitted = true;
    done = this.onSubmittedWorkDone();
  };
  const nextFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    nextFrame(() =>
      done.then(() => {
        if (submitted) window.__shotFrames += 1;
        submitted = false;
        callback(performance.now());
      }),
    );
  const proto = GPUCanvasContext.prototype;
  proto.configure = function (config) {
    const usage = (config.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC;
    kept.set(this, { config: { ...config, usage }, texture: null });
    window.__shotContext = this;
  };
  proto.unconfigure = function () {};
  proto.getCurrentTexture = function () {
    const own = kept.get(this);
    const { width, height } = this.canvas;
    if (!own.texture || own.texture.width !== width || own.texture.height !== height) {
      own.texture?.destroy();
      own.texture = own.config.device.createTexture({ size: [width, height], format: own.config.format, usage: own.config.usage });
    }
    return own.texture;
  };
  window.__shotLay = async () => {
    const context = window.__shotContext;
    const own = context && kept.get(context);
    if (!own?.texture) return 'no WebGPU canvas has drawn';
    const { device, format } = own.config;
    const { texture } = own;
    const row = Math.ceil((texture.width * 4) / 256) * 256;
    const buffer = device.createBuffer({ size: row * texture.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [texture.width, texture.height]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(buffer.getMappedRange());
    const rgba = new Uint8ClampedArray(texture.width * texture.height * 4);
    const [red, blue] = format.startsWith('bgra') ? [2, 0] : [0, 2];
    for (let y = 0; y < texture.height; y++)
      for (let x = 0; x < texture.width; x++) {
        const [from, to] = [y * row + x * 4, (y * texture.width + x) * 4];
        rgba.set([bytes[from + red], bytes[from + 1], bytes[from + blue], 255], to);
      }
    buffer.unmap();
    buffer.destroy();
    // The worker has a stand-in `document` of the game's own (`thread/pageAway.ts`), so ask for the worker's scope.
    if (typeof WorkerGlobalScope !== 'undefined') {
      // In the worker: the picture itself, as a PNG's bytes in base64, for the driver to write.
      const laid = new OffscreenCanvas(texture.width, texture.height);
      laid.getContext('2d').putImageData(new ImageData(rgba, texture.width, texture.height), 0, 0);
      const png = new Uint8Array(await (await laid.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let text = '';
      for (let start = 0; start < png.length; start += 0x8000)
        text += String.fromCharCode(...png.subarray(start, start + 0x8000));
      return { png: btoa(text) };
    }
    document.getElementById('__shot')?.remove();
    const laid = document.createElement('canvas');
    laid.id = '__shot';
    [laid.width, laid.height] = [texture.width, texture.height];
    laid.getContext('2d').putImageData(new ImageData(rgba, texture.width, texture.height), 0, 0);
    const box = context.canvas.getBoundingClientRect();
    Object.assign(laid.style, {
      position: 'fixed',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      pointerEvents: 'none',
    });
    context.canvas.after(laid);
    return '';
  };
};

async function main() {
  const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (plan.noGpu && plan.steps.some((step) => step.shot || step.views)) throw new Error('noGpu draws nothing to picture');
  takeLock();
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (!(await servesThisCheckout(plan.url, top)))
    throw new Error(`the server at ${new URL(plan.url).origin} serves another checkout than ${top}: stop it or use another port`);
  // Behind a proxy (a cloud session's HTTPS_PROXY), the browser and its routes' own fetches go through it, all but
  // the page's own server here.
  const proxy = process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
    : {};
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    ...proxy,
  });
  const [width, height] = plan.size ?? [1280, 800];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    // A failed load's own text names no resource: its location does.
    const from = message.location().url;
    if (message.type() === 'error') console.log('console:', message.text().slice(0, 300), from ? `(${from})` : '');
  });
  page.on('pageerror', (error) => console.log('page error:', error.message.slice(0, 300)));
  // R2 answers CORS for port 5173 alone; with "anyPort" the page's cross-origin reads are fetched by the driver and
  // handed back open to any origin, so a worktree's Vite can serve on another port while 5173 is taken. Either way
  // the driver fetches R2's own reads, asking again on a 429 or a 5xx: a burst of them through the proxy is
  // throttled or answered 500 now and then, and the game stops at the first table it cannot read.
  const own = new URL(plan.url).origin;
  // At most this many at once, asked again after a growing pause.
  const MOST_FETCHING = 8;
  const waiting = [];
  let fetching = 0;
  await page.route(
    (url) => url.origin !== own && url.protocol.startsWith('http') && (plan.anyPort || url.hostname.endsWith('.r2.dev')),
    async (route) => {
      const headers = plan.anyPort ? { ...route.request().headers(), origin: 'http://localhost:5173' } : undefined;
      while (fetching >= MOST_FETCHING) await new Promise((wake) => waiting.push(wake));
      fetching += 1;
      // A read that throws (a timeout) is asked again as a 429 or a 5xx is; one never answered is aborted.
      const asked = () => route.fetch({ headers }).catch(() => null);
      const again = (response) => !response || response.status() === 429 || response.status() >= 500;
      let response;
      try {
        response = await asked();
        for (let time = 0; time < 8 && again(response); time++) {
          await new Promise((wake) => setTimeout(wake, Math.min(8000, 500 * 2 ** time)));
          response = await asked();
        }
      } finally {
        fetching -= 1;
        waiting.shift()?.();
      }
      if (!response) return route.abort();
      const open = plan.anyPort ? { 'access-control-allow-origin': '*' } : {};
      await route.fulfill({ response, headers: { ...response.headers(), ...open } });
    },
  );
  // The plan's own routes are added after the R2 route, since Playwright tries the last added first: a local file
  // stands in for one not yet on R2. Each never served is said at the end.
  const unserved = new Set(Object.keys(plan.routes ?? {}));
  for (const [part, file] of Object.entries(plan.routes ?? {}))
    await page.route(`**/*${part}*`, (route) => {
      unserved.delete(part);
      return route.fulfill({ body: readFileSync(file), headers: { 'access-control-allow-origin': '*' } });
    });
  const patches = [...(plan.noGpu ? [DROP_SUBMITS] : []), OWN_TEXTURE, SHADER_ERRORS];
  for (const patch of patches) await page.addInitScript(patch);
  if (plan.init) await page.addInitScript({ content: plan.init });
  const head = `${patches.map((patch) => `(${patch})();`).join('\n')}\n${plan.init ?? ''}\n`;
  await page.route(/\/gameWorker[^/]*\.[jt]s(\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: head + (await response.text()) });
  });
  // The game's worker once it is up: every step that reads or drives the game runs there.
  let game = null;
  page.on('worker', (worker) => {
    if (!worker.url().includes('gameWorker')) return;
    game = worker;
    // The page ends the worker when the game stops, and says why in its body.
    worker.on('close', () =>
      page.evaluate(() => document.body.innerText).then((why) => console.log('game stopped:', why), () => undefined),
    );
  });
  const driven = () => game ?? page;
  // The words the game's interface shows, for a wait that timed out: what the page stood on instead.
  const uiSaid = async () => {
    const all = await driven()
      .evaluate(() => self.__ui?.() ?? null)
      .catch(() => null);
    const words = all?.flatMap((node) => (node.words ? [node.words] : []));
    return words ? `the interface shows: ${words.join(' | ').slice(0, 600) || 'no words'}` : 'no __ui';
  };
  const framesOn = async (count) => {
    const from = await driven().evaluate(() => self.__shotFrames);
    const until = Date.now() + 600_000;
    while ((await driven().evaluate(() => self.__shotFrames)) < from + count) {
      if (Date.now() > until) throw new Error(`${count} frames were not drawn in 10 minutes; ${await uiSaid()}`);
      await page.waitForTimeout(100);
    }
  };
  // Writes the picture to `path`: from the worker's own texture, or the page laid over and screenshot.
  const shoot = async (path) => {
    const laid = await driven().evaluate(() => self.__shotLay());
    if (laid?.png) return writeFileSync(path, Buffer.from(laid.png, 'base64'));
    if (laid) console.log('shot:', laid);
    await page.screenshot({ path });
    await page.evaluate(() => document.getElementById('__shot')?.remove());
  };
  // The topmost node shown that `wanted` picks, once one shows. While the arrival's veil stands (`hud:veil`), nothing
  // under it can be acted on and its own words (the place's name) are not the place: none is picked.
  const shown = async (wanted, what, seconds = 180) => {
    const until = Date.now() + seconds * 1000;
    for (;;) {
      // Until the game's interface is up (its face read), there is no `__ui` yet.
      const all = await driven().evaluate(() => self.__ui?.() ?? null);
      const found = all?.some((node) => node.id === 'hud:veil') ? undefined : all?.findLast(wanted);
      if (found) return found;
      if (Date.now() > until) throw new Error(`${what} did not show in ${seconds} s; ${await uiSaid()}`);
      await page.waitForTimeout(250);
    }
  };
  const holding = (words) => (node) => node.words?.toLowerCase().includes(words.toLowerCase());
  // Clicks a node's middle, the canvas's corner being where the page put it.
  const clickOn = async (node) => {
    const [left, top] = await page.evaluate(() => {
      const box = document.querySelector('canvas')?.getBoundingClientRect();
      return [box?.left ?? 0, box?.top ?? 0];
    });
    await page.mouse.click(left + node.x + node.width / 2, top + node.y + node.height / 2);
  };
  await page.goto(plan.url);
  // The game's page starts its worker at once; a page with none (the World Editor) is driven itself.
  if (!game) await page.waitForEvent('worker', { predicate: (worker) => worker.url().includes('gameWorker'), timeout: 30_000 }).catch(() => null);
  for (const step of plan.steps) {
    const started = Date.now();
    if (step.wait) await page.waitForTimeout(step.wait * 1000);
    else if (step.waitFor) await shown(holding(step.waitFor), `"${step.waitFor}"`, step.timeout);
    else if (step.key) await page.keyboard.press(step.key);
    else if (step.hold) {
      await page.keyboard.down(step.hold[0]);
      await page.waitForTimeout(step.hold[1] * 1000);
      await page.keyboard.up(step.hold[0]);
    }
    else if (step.click) await page.mouse.click(step.click[0], step.click[1]);
    else if (step.move) await page.mouse.move(step.move[0], step.move[1], { steps: 4 });
    else if (step.down) {
      await page.mouse.move(step.down[0], step.down[1]);
      await page.mouse.down({ button: step.down[2] ?? 'left' });
    } else if (step.up) await page.mouse.up({ button: step.up });
    else if (step.wheel) {
      await page.mouse.move(step.wheel[0], step.wheel[1]);
      for (let notch = 0; notch < (step.wheel[3] ?? 1); notch++) {
        await page.mouse.wheel(0, step.wheel[2]);
        await page.waitForTimeout(100);
      }
    }
    else if (step.clickText) await clickOn(await shown(holding(step.clickText), `"${step.clickText}"`, step.timeout));
    else if (step.press) await clickOn(await shown((node) => node.id === step.press, `#${step.press}`, step.timeout));
    else if (step.ui) writeFileSync(step.ui, JSON.stringify(await driven().evaluate(() => self.__ui?.() ?? null), null, 1));
    else if (step.frames) await framesOn(step.frames);
    else if (step.eval) console.log('eval:', JSON.stringify(await driven().evaluate(step.eval)));
    else if (step.views) {
      const listed = typeof step.views === 'string' ? JSON.parse(readFileSync(step.views, 'utf8'))[step.zone] : step.views;
      mkdirSync(step.into ?? '.', { recursive: true });
      for (const [number, view] of listed.entries()) {
        // A foe may kill the body (the "dead" canvas) or the room may move it: the view is arrived at again, up to
        // three times, until the body stands within 2 m of its point and is not fallen.
        let where = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const stood = await driven().evaluate((one) => self.__qaView?.(one.slice(0, 4)), view);
          if (!stood) break;
          await page.waitForTimeout((step.settle ?? 10) * 1000);
          where = await driven().evaluate(() => self.__qaWhere());
          if (!where.dead && Math.hypot(where.x - view[0], where.y - view[1]) <= 2) break;
          console.log(`view ${number} attempt ${attempt}: ${JSON.stringify(where)}`);
        }
        if (!where) {
          console.log(`view ${number} refused: ${JSON.stringify(view)}`);
          continue;
        }
        console.log(`view ${number}: body at ${where.x.toFixed(1)}, ${where.y.toFixed(1)}${where.dead ? ' (fallen)' : ''}`);
        // The place drawn whole first: a layout's city is built some minutes after the arrival, headless.
        for (const until = Date.now() + 600_000; !(await driven().evaluate(() => self.__qaWhere().whole)); ) {
          if (Date.now() > until) {
            console.log(`view ${number}: still not drawn whole after 10 minutes; ${await uiSaid()}`);
            break;
          }
          await page.waitForTimeout(1000);
        }
        await framesOn(2);
        await shoot(`${step.into ?? '.'}/${view[4] ?? number}.png`);
      }
    }
    else if (step.shot) await shoot(step.shot);
    console.log(`${JSON.stringify(step)} ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  for (const part of unserved) console.log(`route never served: ${part}`);
  await browser.close();
}

// The stall probe (webgpu-stall.cjs) puts the same patches in the game's worker.
module.exports = { DROP_SUBMITS, OWN_TEXTURE, SHADER_ERRORS, servesThisCheckout, takeLock };
if (require.main === module)
  // Exits once done: R2's reads still asked again, with their pauses, would keep it running minutes after the close.
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
