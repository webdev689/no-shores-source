// Drives a WebGPU page of the game in headless Chromium and takes pictures of it: Browser QA's driver.
//
//     node tools/claude-toolkit/webgpu-shot.cjs <steps.json>
//
// Headless SwiftShader has no shared-image backing for a WebGPU canvas, so presenting to one loses the device a few
// seconds in. The page's canvas context is given a texture of its own instead, and a picture reads that texture back
// and lays it over the canvas before Playwright's screenshot, so the page's own HTML (the HUD) is in it too. The
// forge's R2 bucket answers CORS for http://localhost:5173 alone: run `npx vite --port 5173` first, or, where another
// checkout holds 5173, Vite on any port with "anyPort": true, and the driver fetches R2 for the page.
//
// steps.json: { "url": "...", "size": [w, h], "routes": { "<url part>": "<local file>" }, "anyPort": true, "steps":
// [ ... ] }, each step one of { "wait": seconds }, { "waitFor": "text on the page" }, { "key": "Escape" }, { "hold": ["w", seconds] },
// { "click": [x, y] },
// { "wheel": [x, y, deltaY, notches] }, { "clickText": "Return to ship" }, { "eval": "js" }, { "shot": "out.png" }.
// The console's errors are printed. The game takes one wheel notch a frame, so a wheel step sends its notches (1
// unless said) 0.1 s apart: from the arrival's 4.5 m, about 20 notches in (deltaY < 0) reach first person. To arrive
// in a camera instead, the address asks for it as it asks for a spawn: `&view=first` or `&view=third,<metres>`.
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');

const OWN_TEXTURE = () => {
  const kept = new WeakMap();
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
  await page.addInitScript(OWN_TEXTURE);
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
    else if (step.eval) console.log('eval:', JSON.stringify(await page.evaluate(step.eval)));
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
