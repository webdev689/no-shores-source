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

/** On the dev server only: the World Editor reads and saves content/world/layout.json at /__world/layout. */
function worldLayoutFile(): Plugin {
  return {
    name: 'world-layout-file',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__world/layout', (request: IncomingMessage, response: ServerResponse) => {
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
