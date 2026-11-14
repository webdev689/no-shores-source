// The forge viewer built for a published page (a claude.ai artifact), which serves no studio and asks no dev server:
// the viewer in pack mode (VITE_FORGE_PACK, viewer.js), its scripts and styles alone, and the page's own markup.
// The art goes beside it as packs (pack.py): the first packs as the page's own files, the rest in its asset store.
//
//   python3 -I tools/forgeViewer/pack.py --out <dir>
//   node tools/forgeViewer/publish.mjs --out <dir>
//
// Writes <dir>/page.html (the page, without a document's wrapper: the publisher wraps it) and <dir>/site/ (its files:
// assets/*.js and *.css, index.json and packs/f-*.webp). The asset packs (packs/a-*.webp) are uploaded to the page's
// store, and their urls written into index.json, before the page is published.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = process.argv.indexOf('--out');
if (at < 0) throw new Error('--out <dir>, where pack.py wrote the packs');
const out = process.argv[at + 1];
const site = join(out, 'site');

process.env.VITE_FORGE_PACK = '1';
const base = (await import(join(ROOT, 'vite.config.js'))).default;
const config = typeof base === 'function' ? await base({ command: 'build', mode: 'production' }) : base;
await build({
  ...config, configFile: false, root: ROOT, base: './', publicDir: false, logLevel: 'warn',
  plugins: (config.plugins ?? []).filter((p) => !['studio-art-index', 'art-index', 'licence-files', 'landing-html'].includes(p?.name)),
  build: { ...config.build, outDir: site, emptyOutDir: true, rollupOptions: { ...config.build.rollupOptions, input: { forgeViewer: join(ROOT, 'forge-viewer.html') } } },
});

// the game's modules carry their pictures and sounds as files the viewer never shows: only its code and styles go
for (const file of readdirSync(join(site, 'assets'))) if (!/\.(m?js|css)$/.test(file)) rmSync(join(site, 'assets', file));

// the page: its title, styles, markup and module, without the document's wrapper
const html = readFileSync(join(site, 'forge-viewer.html'), 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>')).replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '').trim();
const page = [pick(/<title>[^<]*<\/title>/g), '<meta name="claude:viewport-fit-sides" content="cover">',
  pick(/<link rel="stylesheet"[^>]*>/g), pick(/<link rel="modulepreload"[^>]*>/g), body, pick(/<script type="module"[^>]*><\/script>/g)].filter(Boolean).join('\n');
writeFileSync(join(out, 'page.html'), `${page}\n`);
rmSync(join(site, 'forge-viewer.html'));

mkdirSync(join(site, 'packs'), { recursive: true });
for (const file of readdirSync(join(out, 'packs'))) if (file.startsWith('f-')) copyFileSync(join(out, 'packs', file), join(site, 'packs', file));
if (existsSync(join(out, 'index.json'))) copyFileSync(join(out, 'index.json'), join(site, 'index.json'));
const files = readdirSync(join(site, 'assets')).length;
console.log(`page.html written; site/: ${files} scripts and styles, the page's own packs and index.json`);
