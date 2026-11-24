// The website's seam with Vite: each page is made whole as it is served or built, and every picture is drawn and
// written into the build. Nothing is drawn into the source tree.
import type { Plugin } from 'vite';
import { ART_DIR, PICTURES, pictureOf } from './art/pictures.ts';
import { makePage } from './page.ts';
import { BOT_ORIGIN } from './panel/panelApi.ts';
import { pageOfPath, type SitePage } from './siteMap.ts';

/**
 * What a built page but the panel's may load: its own styles, fonts and pictures, and no script at all. Nothing comes
 * from another site, and nothing injected into a page could run.
 */
export const CONTENT_POLICY = [
  "default-src 'none'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * The Discord bot's page runs its own script, which talks to the bot alone, and shows pictures from any https
 * address: avatars, the bot's uploads and the pictures a message links. The page tells no picture's host where it was
 * shown (its `no-referrer`). A page served while editing carries no policy, so it may reach the bot `npm run bot` runs.
 */
export const PANEL_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  `connect-src ${BOT_ORIGIN}`,
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' https:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** A page's own policy: the panel's for the one page that runs a script, the stricter one for every other. */
export const policyOf = (page: SitePage): string => (page.id === 'panel' ? PANEL_POLICY : CONTENT_POLICY);

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
        const policy = { 'http-equiv': 'Content-Security-Policy', content: policyOf(page) };
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
