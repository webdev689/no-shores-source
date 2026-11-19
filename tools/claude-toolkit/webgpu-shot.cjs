// Drives a WebGPU page of the game in headless Chromium and takes pictures of it: Browser QA's driver.
//
//     node tools/claude-toolkit/webgpu-shot.cjs <steps.json>
//
// Headless SwiftShader has no shared-image backing for a WebGPU canvas, so presenting to one loses the device a few
// seconds in. The page's canvas context is given a texture of its own instead, and a picture reads that texture back
// and lays it over the canvas before Playwright's screenshot, so the page's own HTML (the HUD) is in it too. The
// forge's R2 bucket answers CORS for http://localhost:5173 alone: run `npx vite --port 5173` first.
//
// steps.json: { "url": "...", "size": [w, h], "routes": { "<url part>": "<local file>" }, "init": "js run before the
// page's own, e.g. a shifted Date.now for the world's hour", "steps": [ ... ] }, each
// step one of { "wait": seconds }, { "waitFor": "text on the page" }, { "key": "Escape" }, { "click": [x, y] },
// { "wheel": [x, y, deltaY] }, { "hold": ["ArrowLeft", seconds] }, { "clickText": "Return to ship" },
// { "eval": "js" }, { "shot": "out.png" }. A held key acts at the page's slow headless frames: an arrow turns the
// player about 0.03 rad a second. { "frames": n } waits until the page has drawn n more frames: read what a frame
// writes (a panel, a note) only after one has drawn. Every frame is paced from the first: the page's next animation
// frame waits until the GPU has done the last one's work, so SwiftShader never builds a backlog that a picture then
// waits minutes behind. The console's errors are printed.
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');

const OWN_TEXTURE = () => {
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
  await page.addInitScript(OWN_TEXTURE);
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
      await page.mouse.wheel(0, step.wheel[2]);
    }
    else if (step.clickText) await page.getByText(step.clickText).first().click();
    else if (step.frames) {
      const from = await page.evaluate(() => window.__shotFrames);
      await page.waitForFunction((until) => window.__shotFrames >= until, from + step.frames, { timeout: 600_000 });
    } else if (step.eval) console.log('eval:', JSON.stringify(await page.evaluate(step.eval)));
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
