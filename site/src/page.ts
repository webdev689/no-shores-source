// A page made whole at serve and at build: the bar and the foot laid in, and every word, link and picture the page
// names filled in. A page's markup never spells a sentence, an address or a picture's file; it names them by key.
import { pictureAddress, pictureOf } from './art/pictures.ts';
import { OUTSIDE, SITE_ORIGIN, SITE_PAGES, pagePath, siteHref, type SitePage } from './siteMap.ts';
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

/** The top of every page: the skip link and the bar with the logo, the pages it names, the Discord and Play. */
export function siteTop(page: SitePage): string {
  const links = SITE_PAGES.filter((each) => each.inBar).map((each) => link(each.id, wordKeyOf(each.id), each === page));
  links.push(link('discord', 'navDiscord'));
  return `<a class="skip" href="#main" data-t="shell.skip"></a>
  <header class="bar">
    <a class="bar-brand" data-to="home" data-t-aria-label="shell.brand"><img data-art="logo" alt="" /></a>
    <nav class="bar-nav" data-t-aria-label="shell.navLabel">
      ${links.join('\n      ')}
      ${link('play', 'navPlay', false, 'button button-gold')}
    </nav>
  </header>`;
}

/** The foot of every page, in columns: the logo and the copyright, the pages by name, then Play and the Discord once
 *  it has an address. */
export function siteFoot(page: SitePage): string {
  const items = SITE_PAGES.filter((each) => each.inFoot).map(
    (each) => `<li>${link(each.id, wordKeyOf(each.id), each === page)}</li>`,
  );
  const places = Object.keys(OUTSIDE)
    .filter((name) => siteHref(name)?.href)
    .map((name) => link(name, wordKeyOf(name), false, name === 'play' ? 'button button-gold' : 'button'));
  return `<footer class="foot">
    <div class="foot-brand">
      <a data-to="home" data-t-aria-label="shell.brand"><img data-art="logo" alt="" /></a>
      <p data-t="shell.tagline"></p>
      <p class="copyright" data-t="shell.copyright"></p>
    </div>
    <nav aria-labelledby="foot-pages">
      <h2 id="foot-pages" data-t="shell.footLabel"></h2>
      <ul>
        ${items.join('\n        ')}
      </ul>
    </nav>
    <p class="buttons">
      ${places.join('\n      ')}
    </p>
  </footer>`;
}

/** Fill one tag's named attributes, link and picture. */
function fillTag(tag: string, outside: Readonly<Record<string, string>>): string {
  let next = tag;
  for (const [, attribute = '', key = ''] of tag.matchAll(/\sdata-t-([a-z-]+)="([^"]*)"/g)) {
    if (!WORD_ATTRIBUTES.includes(attribute)) throw new Error(`site: words cannot go into "${attribute}"`);
    next = setAttribute(next, attribute, wordOf(key));
  }
  const to = /\sdata-to="([^"]*)"/.exec(tag)?.[1];
  if (to !== undefined) {
    const place = siteHref(to, outside);
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

/** Whether a place a page needs (`data-needs="discord"`) has no address yet; a name nobody has stops the build. */
function closed(name: string, outside: Readonly<Record<string, string>>): boolean {
  const place = siteHref(name, outside);
  if (!place) throw new Error(`site: nowhere is named "${name}"`);
  return place.href === '';
}

/**
 * Fill a page's keys. A link to a place with no address yet is taken out whole, so an empty Discord invite shows no
 * button, and so is a section that needs that place (`data-needs`), which may hold no section of its own. Words go
 * only into an element that holds nothing, or the build stops.
 */
export function fillKeys(html: string, outside: Readonly<Record<string, string>> = OUTSIDE): string {
  const needs = [...html.matchAll(/\sdata-needs=/g)].length;
  const onSections = [...html.matchAll(/<section\b[^>]*\sdata-needs="[^"]*"/g)].length;
  if (needs !== onSections) throw new Error('site: data-needs goes on only a section, its place in double quotes');
  let out = html.replace(
    /<section\b[^>]*\sdata-needs="([^"]*)"[^>]*>([\s\S]*?)<\/section>\s*/g,
    (whole, name: string, inner: string) => {
      if (/<section\b/.test(inner)) throw new Error('site: a section that needs a place holds a section of its own');
      return closed(name, outside) ? '' : whole;
    },
  );
  out = out.replace(/<a\b[^>]*\sdata-to="([^"]*)"[^>]*>[\s\S]*?<\/a>\s*/g, (whole, to: string) =>
    siteHref(to, outside)?.href === '' ? '' : whole,
  );
  out = out.replace(/<[a-zA-Z][^>]*\sdata-(?:to|art|t-[a-z-]+)="[^"]*"[^>]*>/g, (tag) => fillTag(tag, outside));
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
  return out.replace(/\sdata-(?:t|to|art|needs|t-[a-z-]+)="[^"]*"/g, '');
}

/** What every page's head holds beside its own: the tab's icon and the night the browser's own frame takes. */
const HEAD = `<link rel="icon" type="image/png" data-art-icon />
  <meta name="theme-color" content="#070c18" />
</head>`;

/** The tags a link to a page unfolds into on Discord and elsewhere: its title and description, already filled, the
 *  share picture, and the page's own address. */
function shareTags(html: string, page: SitePage): string {
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const share = pictureOf('share');
  const address = `${SITE_ORIGIN}${pagePath(page)}`;
  const tags = [
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="No Shores" />',
    `<meta property="og:url" content="${address}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
  ];
  if (share) {
    tags.push(`<meta property="og:image" content="${SITE_ORIGIN}${pictureAddress('share', share)}" />`);
    tags.push(`<meta property="og:image:width" content="${share.width}" />`);
    tags.push(`<meta property="og:image:height" content="${share.height}" />`);
  }
  return html.replace('</head>', `  ${tags.join('\n    ')}\n  </head>`);
}

/** A page made whole: its head, bar and foot laid in, its keys filled, its tab named after the site beside its own
 *  name, and the tags a shared link shows. */
export function makePage(html: string, page: SitePage): string {
  for (const mark of ['<!--site:top-->', '<!--site:foot-->', '</head>'])
    if (!html.includes(mark)) throw new Error(`site page "${page.id}" has no ${mark}`);
  const icon = pictureOf('icon');
  const head = HEAD.replace('data-art-icon', icon ? `href="${pictureAddress('icon', icon)}"` : '');
  const laid = html
    .replace('</head>', head)
    .replace('<!--site:top-->', siteTop(page))
    .replace('<!--site:foot-->', siteFoot(page));
  const filled = fillKeys(laid);
  const named =
    page.id === 'home' ? filled : filled.replace(/<title>([^<]*)<\/title>/, '<title>$1 | No Shores</title>');
  return shareTags(named, page);
}
