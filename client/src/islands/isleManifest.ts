// Where the kits' packs are published: content/islands/modules.json, which CI writes when it publishes them. Until
// then the file is not there, and a glob of it finds nothing, so the page builds and draws the islands bare.
import type { IsleManifest } from './isleModules.ts';

const found = import.meta.glob<IsleManifest>('../../../content/islands/modules.json', {
  eager: true,
  import: 'default',
});

/** The published manifest, or null while none is. */
export const ISLE_MANIFEST: IsleManifest | null = Object.values(found)[0] ?? null;

/** The dev page's `?islePacks=<url prefix>`, which reads `<prefix><kit>.modules` in place of the manifest's. */
export function islePacksPrefix(search: string): string | null {
  return import.meta.env.DEV ? new URLSearchParams(search).get('islePacks') : null;
}
