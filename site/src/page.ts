// A page made whole at serve and at build: the bar and the foot laid in, and every word, link and picture the page
// names filled in. A page's markup never spells a sentence, an address or a picture's file; it names them by key.
import { pictureAddress, pictureOf } from './art/pictures.ts';
import { OUTSIDE, SITE_PAGES, siteHref, type SitePage } from './siteMap.ts';
import { WORDS } from './words.ts';

/** The attributes a page may fill with words (`data-t-alt="world.depthsAlt"`). */
const WORD_ATTRIBUTES = ['alt', 'aria-label', 'content'];

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wordOf(key: string): string {
  const text = WORDS[key];
  if (text === undefined) throw new Error(`site: no words named "${key}"`);
  return escapeHtml(text);
}

/** Set `name="value"` on a tag, replacing it where the tag has it already. */
function setAttribute(tag: string, name: string, value: string): string {
  const has = new RegExp(`\\s${name}="[^"]*"`);
  // the value goes in through a function: as a pattern, a `$` in a word would be read as part of one
  if (has.test(tag)) return tag.replace(has, () => ` ${name}="${value}"`);
  return tag.replace(/\s*(\/?)>$/, (_all, slash: string) => ` ${name}="${value}"${slash ? ' /' : ''}>`);
}

/** One link by name, its words by key, marked when it is the page being read. */
function link(to: string, wordKey: string, current = false, className = ''): string {
  const here = current ? ' aria-current="page"' : '';
  const kind = className ? ` class="${className}"` : '';
  return `<a${kind} data-to="${to}" data-t="shell.${wordKey}"${here}></a>`;
}

const wordKeyOf = (id: string): string => `nav${id[0]?.toUpperCase() ?? ''}${id.slice(1)}`;

/** The top of every page: the skip link and the bar with the logo, the pages it names and Play. */
export function siteTop(page: SitePage): string {
  const links = SITE_PAGES.filter((each) => each.inBar).map((each) => link(each.id, wordKeyOf(each.id), each === page));
  return `<a class="skip" href="#main" data-t="shell.skip"></a>
  <header class="bar">
    <a class="bar-brand" data-to="home" data-t-aria-label="shell.brand"><img data-art="logo" alt="" /></a>
    <nav class="bar-nav" data-t-aria-label="shell.navLabel">
      ${links.join('\n      ')}
      ${link('play', 'navPlay', false, 'button button-gold')}
    </nav>
  </header>`;
}

/** The foot of every page: its links by name, the Discord's once it has an address, and the copyright. */
export function siteFoot(page: SitePage): string {
  const names = [...SITE_PAGES.map((each) => each.id), ...Object.keys(OUTSIDE)];
  const items = names
    .filter((name) => siteHref(name)?.href)
    .map((name) => `<li>${link(name, wordKeyOf(name), name === page.id)}</li>`);
  return `<footer class="foot">
    <nav data-t-aria-label="shell.footLabel"><ul>
      ${items.join('\n      ')}
    </ul></nav>
    <p data-t="shell.copyright"></p>
  </footer>`;
}

/** Fill one tag's named attributes, link and picture. */
function fillTag(tag: string): string {
  let next = tag;
  for (const [, attribute = '', key = ''] of tag.matchAll(/\sdata-t-([a-z-]+)="([^"]*)"/g)) {
    if (!WORD_ATTRIBUTES.includes(attribute)) throw new Error(`site: words cannot go into "${attribute}"`);
    next = setAttribute(next, attribute, wordOf(key));
  }
  const to = /\sdata-to="([^"]*)"/.exec(tag)?.[1];
  if (to !== undefined) {
    const place = siteHref(to);
    if (!place) throw new Error(`site: nowhere is named "${to}"`);
    next = setAttribute(next, 'href', place.href);
    if (place.outside) next = setAttribute(next, 'rel', 'noopener');
  }
  const name = /\sdata-art="([^"]*)"/.exec(tag)?.[1];
  if (name !== undefined) {
    const picture = pictureOf(name);
    if (!picture) throw new Error(`site: no picture is named "${name}"`);
    next = setAttribute(next, 'src', pictureAddress(name, picture));
    next = setAttribute(setAttribute(next, 'width', String(picture.width)), 'height', String(picture.height));
    if (!/\salt="/.test(next)) next = setAttribute(next, 'alt', '');
  }
  return next;
}

/**
 * Fill a page's keys. A link to a place with no address yet is taken out whole, so an empty Discord invite shows no
 * button. Words go only into an element that holds nothing, or the build stops.
 */
export function fillKeys(html: string): string {
  let out = html.replace(/<a\b[^>]*\sdata-to="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*/g, (whole, to: string) =>
    siteHref(to)?.href === '' ? '' : whole,
  );
  out = out.replace(/<[a-zA-Z][^>]*\sdata-(?:to|art|t-[a-z-]+)="[^"]*"[^>]*>/g, fillTag);
  const named = [...out.matchAll(/\sdata-t="([^"]*)"/g)].length;
  let filled = 0;
  out = out.replace(
    /(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\sdata-t="([^"]*)"[^>]*>)(<\/\2>)/g,
    (_all, open: string, _tag, key: string, close: string) => {
      filled++;
      return `${open}${wordOf(key)}${close}`;
    },
  );
  if (filled !== named) throw new Error('site: words are named on an element that is not empty');
  // the keys have done their work; the page ships without them
  return out.replace(/\sdata-(?:t|to|art|t-[a-z-]+)="[^"]*"/g, '');
}

/** What every page's head holds beside its own: the tab's icon and the night the browser's own frame takes. */
const HEAD = `<link rel="icon" type="image/png" data-art-icon />
  <meta name="theme-color" content="#070c18" />
</head>`;

/** A page made whole: its head, bar and foot laid in, its keys filled. */
export function makePage(html: string, page: SitePage): string {
  for (const mark of ['<!--site:top-->', '<!--site:foot-->', '</head>'])
    if (!html.includes(mark)) throw new Error(`site page "${page.id}" has no ${mark}`);
  const icon = pictureOf('icon');
  const head = HEAD.replace('data-art-icon', icon ? `href="${pictureAddress('icon', icon)}"` : '');
  const laid = html
    .replace('</head>', head)
    .replace('<!--site:top-->', siteTop(page))
    .replace('<!--site:foot-->', siteFoot(page));
  return fillKeys(laid);
}
