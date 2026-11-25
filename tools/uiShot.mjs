// Pictures of the interface drawn by the game, headless: starts Vite, opens a module of the client (no page), and
// draws a node tree through the real renderer (`client/src/ui/shot.ts`) for each shot asked, writing it as a PNG.
//
//     node tools/uiShot.mjs <shots.json>
//
// shots.json: { "size": [w, h], "scale": 2, "frames": 10, "shots": [{ "module": "/src/game/journalShots.ts", "build":
// "journalShot", "out": "target/ui/journal.png", "size": [w, h], "events": [...], "at": 3 }] }: `build` answers the
// tree for the interface it is given; `events`, `at` and `frames` are as `client/src/ui/shot.ts` hears them. Errors are
// printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

// The container's own Playwright, found as CommonJS finds it, so no second copy is installed.
const { chromium } = createRequire(import.meta.url)('playwright');

const asked = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8'));
// Port 5173 where it is free, the only origin R2 answers, so the forge's pictures come; the next free one otherwise.
const server = await createServer({ server: { port: 5173, strictPort: false }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const base = `http://localhost:${typeof address === 'object' && address ? address.port : 5173}`;
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
let failed = false;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log(`page ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    failed = true;
    console.log(`page error: ${error.message}`);
  });
  await page.goto(`${base}/src/ui/shot.ts`);
  for (const one of asked.shots) {
    const [width, height] = one.size ?? asked.size ?? [640, 360];
    const scale = one.scale ?? asked.scale ?? 1;
    const url = await page.evaluate(
      async ({ module, build, view, events, frames, at }) => {
        const { shot } = await import('/src/ui/shot.ts');
        const made = await import(module);
        return shot(made[build], view, { events, frames, at });
      },
      {
        module: one.module,
        build: one.build,
        view: { width, height, scale },
        events: one.events ?? [],
        frames: one.frames ?? asked.frames ?? 4,
        at: one.at ?? 1,
      },
    );
    mkdirSync(dirname(one.out), { recursive: true });
    writeFileSync(one.out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    console.log(`wrote ${one.out} (${width * scale} by ${height * scale})`);
  }
} catch (error) {
  failed = true;
  console.log(String(error));
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
