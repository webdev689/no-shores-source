// Drives a WebGPU page of the game in headless Chromium and takes pictures of it: Browser QA's driver.
//
//     node tools/claude-toolkit/webgpu-shot.cjs <steps.json>
//
// Headless SwiftShader has no shared-image backing for a WebGPU canvas, so presenting to one loses the device a few
// seconds in. The page's canvas context is given a texture of its own instead, and a picture reads that texture back
// and lays it over the canvas before Playwright's screenshot, so the page's own HTML (the HUD) is in it too. A game
// that draws from a worker, on a canvas the page handed it, gets the same in the worker: the page marks each worker's
// address, the driver puts the patches ahead of its script, and the worker sends its frames and pictures to the page
// over a BroadcastChannel. Init scripts reach no worker, so without this the worker presents and every device in the
// page is lost: a pipeline still compiling then fails with "A valid external Instance reference no longer exists". The
// forge's R2 bucket answers CORS for http://localhost:5173 alone: run `npx vite --port 5173` first, or, where another
// checkout holds 5173, Vite on any port with "anyPort": true, and the driver fetches R2 for the page.
//
// steps.json: { "url": "...", "size": [w, h], "routes": { "<url part>": "<local file>" }, "anyPort": true, "init": "js
// run before the page's own, e.g. a shifted Date.now for the world's hour", "steps": [ ... ] }, each step one of
// { "wait": seconds }, { "waitFor": "text on the page" }, { "key": "Escape" }, { "click": [x, y] },
// { "wheel": [x, y, deltaY, notches] }, { "hold": ["ArrowLeft", seconds] }, { "clickText": "Return to ship" },
// { "eval": "js" }, { "shot": "out.png" }. A held key acts at the page's slow headless frames: an arrow turns the
// player about 0.03 rad a second. { "frames": n } waits until the page has drawn n more frames: read what a frame
// writes (a panel, a note) only after one has drawn. Every frame is paced from the first: the page's next animation
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
// and writes `<into>/<name>.png`, or `<into>/<number>.png` without a name. A view outside the node is said to be
// refused and skipped.
const { chromium } = require('playwright');
const { mkdirSync, readFileSync } = require('node:fs');

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

const OWN_TEXTURE = () => {
  if (typeof GPUCanvasContext === 'undefined') return;
  const scope = globalThis;
  const inWorker = typeof WorkerGlobalScope !== 'undefined';
  const channel = new BroadcastChannel('webgpu-shot');
  const kept = new WeakMap();
  // A frame counts once it has given the GPU work: frames before the first draw (loading) do not.
  let done = Promise.resolve();
  let submitted = false;
  scope.__shotFrames = 0;
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (buffers) {
    submit.call(this, buffers);
    submitted = true;
    done = this.onSubmittedWorkDone();
  };
  const nextFrame = scope.requestAnimationFrame?.bind(scope);
  if (nextFrame)
    scope.requestAnimationFrame = (callback) =>
      nextFrame(() =>
        done.then(() => {
          if (submitted) {
            scope.__shotFrames += 1;
            if (inWorker) channel.postMessage('frame');
          }
          submitted = false;
          callback(performance.now());
        }),
      );
  const proto = GPUCanvasContext.prototype;
  proto.configure = function (config) {
    const usage = (config.usage ?? GPUTextureUsage.RENDER_ATTACHMENT) | GPUTextureUsage.COPY_SRC;
    kept.set(this, { config: { ...config, usage }, texture: null });
    scope.__shotContext = this;
  };
  proto.unconfigure = function () {};
  proto.getCurrentTexture = function () {
    const own = kept.get(this);
    const { width, height } = this.canvas;
    if (!own.texture || own.texture.width !== width || own.texture.height !== height) {
      if (!own.texture && inWorker) channel.postMessage('drawing');
      own.texture?.destroy();
      own.texture = own.config.device.createTexture({ size: [width, height], format: own.config.format, usage: own.config.usage });
    }
    return own.texture;
  };
  // The canvas's picture as RGBA, read back from its texture, or null before it has drawn.
  const read = async () => {
    const context = scope.__shotContext;
    const own = context && kept.get(context);
    if (!own?.texture) return null;
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
    return { rgba, width: texture.width, height: texture.height };
  };
  if (inWorker) {
    channel.onmessage = async ({ data }) => {
      const picture = data === 'read' && (await read());
      if (picture) channel.postMessage(picture);
    };
    return;
  }
  // The page: each worker marked for the driver, the canvas handed to one kept, and a worker's frames counted.
  const Worker = scope.Worker;
  scope.Worker = class extends Worker {
    constructor(url, options) {
      const marked = new URL(url, location.href);
      if (marked.protocol.startsWith('http')) marked.searchParams.set('__webgpuShot', '');
      super(marked, options);
    }
  };
  let handed = null;
  const transfer = HTMLCanvasElement.prototype.transferControlToOffscreen;
  HTMLCanvasElement.prototype.transferControlToOffscreen = function () {
    handed = this;
    return transfer.call(this);
  };
  let workerDrew = false;
  let answer = null;
  channel.onmessage = ({ data }) => {
    if (data === 'frame') scope.__shotFrames += 1;
    else if (data === 'drawing') workerDrew = true;
    else if (data?.rgba) answer?.(data);
  };
  scope.__shotLay = async () => {
    let picture = await read();
    let canvas = scope.__shotContext?.canvas;
    if (!picture && workerDrew) {
      picture = await new Promise((resolve) => {
        answer = resolve;
        channel.postMessage('read');
      });
      canvas = handed;
    }
    if (!picture) return 'no WebGPU canvas has drawn';
    const { rgba, width, height } = picture;
    document.getElementById('__shot')?.remove();
    const laid = document.createElement('canvas');
    laid.id = '__shot';
    [laid.width, laid.height] = [width, height];
    laid.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
    const box = canvas.getBoundingClientRect();
    Object.assign(laid.style, {
      position: 'fixed',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      pointerEvents: 'none',
    });
    canvas.after(laid);
    return '';
  };
};

async function main() {
  const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const [width, height] = plan.size ?? [1280, 800];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('console:', message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => console.log('page error:', error.message.slice(0, 300)));
  for (const [part, file] of Object.entries(plan.routes ?? {}))
    await page.route(`**/*${part}*`, (route) =>
      route.fulfill({ body: readFileSync(file), headers: { 'access-control-allow-origin': '*' } }),
    );
  // R2 answers CORS for port 5173 alone; with "anyPort" the page's cross-origin reads are fetched by the driver and
  // handed back open to any origin, so a worktree's Vite can serve on another port while 5173 is taken.
  if (plan.anyPort) {
    const own = new URL(plan.url).origin;
    await page.route(
      (url) => url.origin !== own && url.protocol.startsWith('http'),
      async (route) => {
        const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'http://localhost:5173' } });
        await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
      },
    );
  }
  // A worker the page marked gets the patches ahead of its script, as the page gets them from its init scripts.
  await page.route(
    (url) => url.searchParams.has('__webgpuShot'),
    async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.delete('__webgpuShot');
      const response = await route.fetch({ url: url.href });
      const body = `(${OWN_TEXTURE})();\n(${SHADER_ERRORS})();\n${await response.text()}`;
      await route.fulfill({ response, body });
    },
  );
  await page.addInitScript(OWN_TEXTURE);
  await page.addInitScript(SHADER_ERRORS);
  if (plan.init) await page.addInitScript({ content: plan.init });
  await page.goto(plan.url);
  for (const step of plan.steps) {
    const started = Date.now();
    if (step.wait) await page.waitForTimeout(step.wait * 1000);
    else if (step.waitFor) await page.getByText(step.waitFor).first().waitFor({ timeout: (step.timeout ?? 180) * 1000 });
    else if (step.key) await page.keyboard.press(step.key);
    else if (step.hold) {
      await page.keyboard.down(step.hold[0]);
      await page.waitForTimeout(step.hold[1] * 1000);
      await page.keyboard.up(step.hold[0]);
    }
    else if (step.click) await page.mouse.click(step.click[0], step.click[1]);
    else if (step.wheel) {
      await page.mouse.move(step.wheel[0], step.wheel[1]);
      for (let notch = 0; notch < (step.wheel[3] ?? 1); notch++) {
        await page.mouse.wheel(0, step.wheel[2]);
        await page.waitForTimeout(100);
      }
    }
    else if (step.clickText) await page.getByText(step.clickText).first().click();
    else if (step.frames) {
      const from = await page.evaluate(() => window.__shotFrames);
      await page.waitForFunction((until) => window.__shotFrames >= until, from + step.frames, { timeout: 600_000 });
    } else if (step.eval) console.log('eval:', JSON.stringify(await page.evaluate(step.eval)));
    else if (step.views) {
      const listed = typeof step.views === 'string' ? JSON.parse(readFileSync(step.views, 'utf8'))[step.zone] : step.views;
      mkdirSync(step.into ?? '.', { recursive: true });
      for (const [number, view] of listed.entries()) {
        // A foe may kill the body (the "dead" canvas) or the room may move it: the view is arrived at again, up to
        // three times, until the body stands within 2 m of its point and is not fallen.
        let where = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const stood = await page.evaluate((one) => window.__qaView?.(one.slice(0, 4)), view);
          if (!stood) break;
          await page.waitForTimeout((step.settle ?? 10) * 1000);
          where = await page.evaluate(() => window.__qaWhere());
          if (!where.dead && Math.hypot(where.x - view[0], where.y - view[1]) <= 2) break;
          console.log(`view ${number} attempt ${attempt}: ${JSON.stringify(where)}`);
        }
        if (!where) {
          console.log(`view ${number} refused: ${JSON.stringify(view)}`);
          continue;
        }
        console.log(`view ${number}: body at ${where.x.toFixed(1)}, ${where.y.toFixed(1)}${where.dead ? ' (fallen)' : ''}`);
        const from = await page.evaluate(() => window.__shotFrames);
        await page.waitForFunction((until) => window.__shotFrames >= until, from + 2, { timeout: 600_000 });
        const why = await page.evaluate(() => window.__shotLay());
        if (why) console.log('shot:', why);
        await page.screenshot({ path: `${step.into ?? '.'}/${view[4] ?? number}.png` });
        await page.evaluate(() => document.getElementById('__shot')?.remove());
      }
    }
    else if (step.shot) {
      const why = await page.evaluate(() => window.__shotLay());
      if (why) console.log('shot:', why);
      await page.screenshot({ path: step.shot });
      await page.evaluate(() => document.getElementById('__shot')?.remove());
    }
    console.log(`${JSON.stringify(step)} ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
