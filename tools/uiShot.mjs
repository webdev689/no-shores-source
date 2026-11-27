// Pictures of the interface drawn by the game, headless: starts Vite, opens a module of the client (no page), and
// draws each shot through the real renderer to a PNG. `node tools/uiShot.mjs <shots.json> [--port 5173]`, with
// { "size": [w, h], "scale": 2, "frames": 10, "motion": true, "shots": [{ "module": "/src/game/journalShots.ts",
// "build": "journalShot", "out": "target/ui/journal.png", "events": [...], "at": 3 }] }: `build` answers the tree for
// the interface given it on every frame (1/60 s), so it keeps its state across them, as menuShot keeps its layer in a
// WeakMap; `events` are heard on frame `at`, or an event's own `at`, each at its place or, with `on`, at the middle
// of the node of that id. With "call": true, it awaits `build(...args)` for a PNG's data URL. "before" names an export
// awaited first, given "beforeArgs". The page asks for reduced motion unless `motion` is true.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

// The container's own Playwright, found as CommonJS finds it, so no second copy is installed.
const { chromium } = createRequire(import.meta.url)('playwright');

const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' } } });
const asked = JSON.parse(readFileSync(positionals[0] ?? '', 'utf8'));
// Port 5173 where it is free, the only origin R2 answers, so the forge's pictures come; the next free one otherwise.
const port = Number(values.port ?? 5173);
const server = await createServer({ server: { port, strictPort: false }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const base = `http://localhost:${typeof address === 'object' && address ? address.port : port}`;
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
});
let failed = false;
try {
  const page = await browser.newPage({ reducedMotion: asked.motion ? 'no-preference' : 'reduce' });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log(`page ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    failed = true;
    console.log(`page error: ${error.message}`);
  });
  // A zone drawn whole on the software GPU takes minutes.
  page.setDefaultTimeout(600_000);
  await page.route(
    (url) => url.hostname.endsWith('.r2.dev'),
    async (route) => {
      for (let tries = 0; ; tries++) {
        try {
          const response = await route.fetch({
            headers: { ...route.request().headers(), origin: 'http://localhost:5173' },
          });
          if (response.status() >= 500 && tries < 4) throw new Error(String(response.status()));
          await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
          return;
        } catch (error) {
          if (tries >= 4) return route.abort();
          await new Promise((wake) => setTimeout(wake, 500 * (tries + 1)));
        }
      }
    },
  );
  await page.goto(`${base}/src/ui/shot.ts`);
  for (const one of asked.shots) {
    const [width, height] = one.size ?? asked.size ?? [640, 360];
    const scale = one.scale ?? asked.scale ?? 1;
    // One shot failing is printed and the rest are still drawn.
    try {
      const url = await page.evaluate(
        async ({ module, build, call, before, beforeArgs, args, view, events, frames, at }) => {
          const made = await import(module);
          if (before) await made[before](...beforeArgs);
          if (call) return made[build](...args);
          const { shot } = await import('/src/ui/shot.ts');
          return shot(made[build], view, { events, frames, at });
        },
        {
          module: one.module,
          build: one.build,
          call: one.call ?? false,
          before: one.before ?? null,
          beforeArgs: one.beforeArgs ?? [],
          args: one.args ?? [],
          view: { width, height, scale },
          events: one.events ?? [],
          frames: one.frames ?? asked.frames ?? 4,
          at: one.at ?? 1,
        },
      );
      mkdirSync(dirname(one.out), { recursive: true });
      writeFileSync(one.out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      console.log(`wrote ${one.out} (${width * scale} by ${height * scale})`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${one.out}: ${String(error)}`);
    }
  }
} catch (error) {
  failed = true;
  console.log(String(error));
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
