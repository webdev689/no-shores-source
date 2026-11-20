// Where the kits' packs are published: content/islands/modules.json, committed from the island-modules run's log.
// Without the file a glob of it finds nothing, so the page builds and draws the islands bare.
import type { IsleManifest } from './isleModules.ts';

const found = import.meta.glob<IsleManifest>('../../../content/islands/modules.json', {
  eager: true,
  import: 'default',
});

/** The published manifest, or null while none is. */
export const ISLE_MANIFEST: IsleManifest | null = Object.values(found)[0] ?? null;

/** A page's `?islePacks=<url prefix>`, which reads `<prefix><kit>.modules` in place of the manifest's: pictures of
 *  the build's packs before they are published, on the dev page or a built one. A pack read is checked whole before
 *  it is drawn. */
export function islePacksPrefix(search: string): string | null {
  return new URLSearchParams(search).get('islePacks');
}
