// The website's seam with Vite: each page is made whole as it is served or built, and every picture is drawn and
// written into the build. Nothing is drawn into the source tree.
import type { Plugin } from 'vite';
import { ART_DIR, PICTURES, pictureOf } from './art/pictures.ts';
import { makePage } from './page.ts';
import { pageOfPath } from './siteMap.ts';

/**
 * What a built page may load: its own styles, fonts and pictures, and no script at all. Nothing comes from another
 * site, and nothing injected into a page could run.
 */
export const CONTENT_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function sitePlugin(): Plugin {
  return {
    name: 'no-shores-site',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const page = pageOfPath(context.path);
        if (!page) throw new Error(`site: ${context.path} is not a page of the site map`);
        const made = makePage(html, page);
        // a served page keeps Vite's own script, which brings its styles while editing; only a build is locked down
        if (context.server) return made;
        const policy = { 'http-equiv': 'Content-Security-Policy', content: CONTENT_POLICY };
        return { html: made, tags: [{ tag: 'meta', attrs: policy, injectTo: 'head-prepend' }] };
      },
    },
    generateBundle() {
      for (const name of Object.keys(PICTURES)) {
        const picture = pictureOf(name);
        if (picture) this.emitFile({ type: 'asset', fileName: `${ART_DIR}/${name}.png`, source: picture.png });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = new RegExp(`^/${ART_DIR}/([a-z0-9-]+)\\.png(?:\\?.*)?$`).exec(request.url ?? '')?.[1];
        const picture = name ? pictureOf(name) : null;
        if (!picture) return next();
        response.setHeader('content-type', 'image/png');
        response.end(picture.png);
      });
    },
  };
}
