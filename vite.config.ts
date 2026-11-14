import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const WORLD_DIR = fileURLToPath(new URL('./content/world/', import.meta.url));
/** The authored world files the editors read and save: the layout, and one edits file a landmass. */
const WORLD_FILE = /^\/(layout|land\/[a-z0-9-]+)\.json$/;

async function bodyOf(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(part as Buffer);
  return Buffer.concat(parts).toString('utf8');
}

/**
 * The World Editor reads content/world/ under `world/`: the layout and each landmass's edits file. The dev server
 * also saves them on PUT; a build copies them in, so the published editor opens what is on `main`.
 */
function worldFiles(): Plugin {
  return {
    name: 'world-files',
    configureServer(server) {
      server.middlewares.use('/world', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const name = WORLD_FILE.exec(request.url ?? '')?.[1];
        if (!name) {
          next();
          return;
        }
        const file = `${WORLD_DIR}${name}.json`;
        const answer = async () => {
          if (request.method === 'GET') {
            response.setHeader('content-type', 'application/json');
            response.end(await readFile(file));
            return;
          }
          if (request.method === 'PUT') {
            const text = await bodyOf(request);
            JSON.parse(text);
            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, text);
            response.statusCode = 204;
            response.end();
            return;
          }
          response.statusCode = 405;
          response.end();
        };
        answer().catch((error: unknown) => {
          response.statusCode = (error as { code?: string }).code === 'ENOENT' ? 404 : 400;
          response.end(String(error));
        });
      });
    },
    async generateBundle() {
      const land = await readdir(`${WORLD_DIR}land`).catch(() => []);
      for (const name of [
        'layout.json',
        ...land.filter((file) => file.endsWith('.json')).map((file) => `land/${file}`),
      ])
        this.emitFile({
          type: 'asset',
          fileName: `world/${name}`,
          source: await readFile(`${WORLD_DIR}${name}`, 'utf8'),
        });
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [worldFiles()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2023',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./client/index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./client/editor/index.html', import.meta.url)),
      },
    },
  },
});
