import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { SITE_PAGES } from './src/siteMap.ts';
import { sitePlugin } from './src/sitePlugin.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

// The website, apart from the game's client: its own root, one input a page, built into target/ beside Rust's output
// so nothing it writes enters git. Port 5174, strict, so it never takes the client's 5173.
export default defineConfig({
  root: ROOT,
  publicDir: false,
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('../target/site', import.meta.url)),
    emptyOutDir: true,
    // fonts and pictures stay files, so the pages' policy never needs to allow data addresses
    assetsInlineLimit: 0,
    rollupOptions: {
      input: Object.fromEntries(
        SITE_PAGES.map((page) => [page.id, `${ROOT}${page.dir ? `${page.dir}/` : ''}index.html`]),
      ),
    },
  },
  plugins: [sitePlugin()],
});
