// What the search reads from Freesound's public pages: a search page's results, and a sound's title, licence and
// preview from its own page. Kept apart from the search so it can be tested without the network.

/** HTML's few named characters in a title, read back as text. */
const unescape = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The sounds a search page lists, in its order: each author's name and the sound's number. */
export function resultsOf(html) {
  const seen = new Set();
  const found = [];
  for (const [, author, id] of html.matchAll(/\/people\/([A-Za-z0-9_.@+-]{1,80})\/sounds\/(\d{1,9})\//g))
    // A name of dots alone would step out of the author's pages.
    if (!seen.has(id) && !/^\.+$/.test(author)) {
      seen.add(id);
      found.push({ author, id });
    }
  return found;
}

/** The licence a sound's page links to, as the sheet names it, or null for one not allowed: only CC0 and
 *  Attribution, never non-commercial or Sampling+. */
export function licenceOf(html) {
  const found = html.match(/creativecommons\.org\/(publicdomain\/zero|licenses\/[a-z+-]+)\//);
  if (!found) return null;
  return found[1] === 'publicdomain/zero' ? 'CC0' : found[1] === 'licenses/by' ? 'CC-BY' : null;
}

/** A sound's high-quality preview on Freesound's own CDN, or null. */
export function previewOf(html, id) {
  return html.match(new RegExp(`https://cdn\\.freesound\\.org/previews/\\d+/${id}_\\d+-hq\\.mp3`))?.[0] ?? null;
}

/** A sound's title, from its page's card for sharing, else its page's title. */
export function titleOf(html, id) {
  const raw =
    html.match(/<meta property="og:title" content="([^"]{1,200})"/)?.[1] ??
    html.match(/<title>([^<]{1,200})<\/title>/)?.[1] ??
    `Sound ${id}`;
  return unescape(raw)
    .replace(/ - Freesound$/, '')
    .replace(/ by \S+$/, '')
    .trim();
}
