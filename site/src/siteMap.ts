// The website's pages and the addresses it sends people to, each named once. The build, the shell and the tests all
// read this list, so adding a page is one entry here, its folder's `index.html` and its words.

/** The site's own address, where it is served once the owner says so. */
export const SITE_ORIGIN = 'https://noshores.online';

export interface SitePage {
  /** The page's name in code and in its words' keys (`world.title`). */
  readonly id: string;
  /** Its folder under `site/`, `''` for the home page; the page is `<folder>/index.html` and is served at `/<folder>/`. */
  readonly folder: string;
  /** Whether the top bar names it. */
  readonly inBar: boolean;
  /** Whether the foot names it: every page but the one shown for an address with no page. */
  readonly inFoot: boolean;
}

export const SITE_PAGES: readonly SitePage[] = [
  { id: 'home', folder: '', inBar: false, inFoot: true },
  { id: 'world', folder: 'world', inBar: true, inFoot: true },
  { id: 'game', folder: 'game', inBar: true, inFoot: true },
  { id: 'app', folder: 'app', inBar: true, inFoot: true },
  { id: 'panel', folder: 'panel', inBar: false, inFoot: true },
  // served for any address with no page of its own, as `404.html` beside the pages (site.yml)
  { id: 'lost', folder: 'lost', inBar: false, inFoot: false },
];

/**
 * The places the site links to that are not its own pages. An empty address is a place not open yet: its links are
 * left out of the page until it is filled.
 */
export const OUTSIDE: Readonly<Record<string, string>> = {
  play: `${SITE_ORIGIN}/play/`,
  discord: 'https://discord.gg/RdDURveYus',
};

/** The desktop app's newest installers, by the names that never move, which the site's Worker answers (`worker.ts`). */
export const DOWNLOADS: Readonly<Record<string, string>> = {
  'windows': '/download/windows',
  'mac-arm64': '/download/mac-arm64',
  'mac-x64': '/download/mac-x64',
  'linux-appimage': '/download/linux-appimage',
  'linux-deb': '/download/linux-deb',
};

/** A page's own address, from the site's root. */
export const pagePath = (page: SitePage): string => (page.folder ? `/${page.folder}/` : '/');

/** The page a request or build path names (`/world/index.html`, `/world/`, `/`), or null. */
export function pageOfPath(path: string): SitePage | null {
  const found = /^\/?(?:([a-z][a-z0-9-]*)\/)?(?:index\.html)?$/.exec(path.split('?')[0] ?? '');
  if (!found) return null;
  return SITE_PAGES.find((page) => page.folder === (found[1] ?? '')) ?? null;
}

/**
 * Where a link named `to` leads: a page by its id or an outside place by its name, with an optional `#section`.
 * `href` is `''` for an outside place not open yet; null means nothing has that name.
 */
export function siteHref(
  to: string,
  outside: Readonly<Record<string, string>> = OUTSIDE,
): { href: string; outside: boolean } | null {
  const [name = '', section] = to.split('#');
  const page = SITE_PAGES.find((candidate) => candidate.id === name);
  const tail = section ? `#${section}` : '';
  if (page) return { href: pagePath(page) + tail, outside: false };
  const download = DOWNLOADS[name];
  if (download) return { href: download, outside: false };
  const address = outside[name];
  if (address === undefined) return null;
  return { href: address && address + tail, outside: true };
}
