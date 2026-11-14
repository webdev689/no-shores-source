import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const LAYOUT_FILE = fileURLToPath(new URL('./content/world/layout.json', import.meta.url));

async function bodyOf(request: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of request) parts.push(part as Buffer);
  return Buffer.concat(parts).toString('utf8');
}

/**
 * The World Editor reads content/world/layout.json at `world/layout.json`. The dev server also saves it on PUT; a
 * build copies it in, so the published editor opens the layout on `main`.
 */
function worldLayoutFile(): Plugin {
  return {
    name: 'world-layout-file',
    configureServer(server) {
      server.middlewares.use('/world/layout.json', (request: IncomingMessage, response: ServerResponse) => {
        const answer = async () => {
          if (request.method === 'GET') {
            response.setHeader('content-type', 'application/json');
            response.end(await readFile(LAYOUT_FILE));
            return;
          }
          if (request.method === 'PUT') {
            const text = await bodyOf(request);
            JSON.parse(text);
            await writeFile(LAYOUT_FILE, text);
            response.statusCode = 204;
            response.end();
            return;
          }
          response.statusCode = 405;
          response.end();
        };
        answer().catch((error: unknown) => {
          response.statusCode = 400;
          response.end(String(error));
        });
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'world/layout.json', source: await readFile(LAYOUT_FILE, 'utf8') });
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [worldLayoutFile()],
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
