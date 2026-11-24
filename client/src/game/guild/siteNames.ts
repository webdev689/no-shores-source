import resources from '../../../../content/gear/resources.json' with { type: 'json' };
import { type SiteOf, siteNamed } from './outpostsView.ts';

/**
 * Outpost sites as the page's world names them: a site's name from its node, and its island's own resource from the
 * island's continent (`content/gear/resources.json`), so the Guild tab reads "Brineglass", not "island goods". The
 * page keeps the one its world gives once loaded; before then, or for a site the world lacks, the site's id is read.
 */

/** The sites' names and their islands' resources, from the world's nodes. */
export function siteOfWorld(
  nodes: readonly { readonly id: string; readonly name: string; readonly continent: string }[],
): SiteOf {
  return (site) => {
    const node = nodes.find((each) => each.id === site);
    const resource = resources.resources.find((each) => each.continent === node?.continent);
    return { name: node?.name ?? siteNamed(site), island: resource?.name ?? 'island goods' };
  };
}

let kept: SiteOf = siteOfWorld([]);

/** Keeps the world's sites, for each Guild tab opened after. */
export function keepSites(siteOf: SiteOf): void {
  kept = siteOf;
}

/** The sites as last kept. */
export const sitesKept: SiteOf = (site) => kept(site);
