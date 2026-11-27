import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PICTURES, pictureOf } from './art/pictures.ts';
import { pngOf } from './art/png.ts';
import { fillKeys, makePage, siteFoot, siteTop } from './page.ts';
import { DOWNLOADS, OUTSIDE, SITE_PAGES, pageOfPath, siteHref, type SitePage } from './siteMap.ts';
import { LATEST_NAMES } from '../worker.ts';
import { BOT_ORIGIN } from './panel/panelApi.ts';
import { CONTENT_POLICY, policyOf } from './sitePlugin.ts';
import { WORDS } from './words.ts';

const SITE = new URL('../', import.meta.url);
const source = (page: SitePage): string =>
  readFileSync(new URL(`${page.folder ? `${page.folder}/` : ''}index.html`, SITE), 'utf8');
const made = SITE_PAGES.map((page) => ({ page, html: makePage(source(page), page) }));

/** The keys a page's markup names before it is filled, the bar's and the foot's with them. */
function keysNamed(html: string): string[] {
  return [...html.matchAll(/\sdata-t(?:-[a-z-]+)?="([^"]*)"/g)].map((found) => found[1] ?? '');
}

test('every word a page names exists, and every word is said by some page', () => {
  const said = new Set<string>();
  for (const page of SITE_PAGES) {
    const laid = source(page).replace('<!--site:top-->', siteTop(page)).replace('<!--site:foot-->', siteFoot(page));
    for (const key of keysNamed(laid)) {
      assert.ok(key in WORDS, `${page.id} names "${key}", which has no words`);
      said.add(key);
    }
  }
  // an outside place with no address yet keeps its link's words for the day it opens
  for (const name of Object.keys(OUTSIDE)) said.add(`shell.nav${name[0]?.toUpperCase()}${name.slice(1)}`);
  assert.deepEqual(
    Object.keys(WORDS).filter((key) => !said.has(key)),
    [],
  );
});

test("the premise's passages are the owner's words, as written", () => {
  const note = readFileSync(new URL('../../bible/01-Game/No Shores.md', import.meta.url), 'utf8');
  // Its lines joined and the quote's markers dropped, so a passage is matched by its words wherever the note wraps.
  const premise = (note.split('## The premise')[1] ?? '').replace(/\s*\n>?\s*/g, ' ');
  for (const [key, text] of Object.entries(WORDS).filter(([key]) => key.startsWith('premise.')))
    for (const passage of text.split(/(?<=\.) (?=[A-Z])/))
      assert.ok(premise.includes(passage), `${key}: "${passage}" is not in the premise`);
});

test('every line is plain: no em or en dash, no double hyphen, no ellipsis', () => {
  for (const [key, text] of Object.entries(WORDS)) assert.doesNotMatch(text, /[—–…]|--|\.\.\./, key);
});

test('every link goes to a page or a named address, never one typed into a page', () => {
  for (const { page, html } of made) {
    for (const [, href = ''] of html.matchAll(/\shref="([^"]*)"/g)) {
      const known = href === '#main' || href.startsWith('/art/') || href.startsWith('/src/');
      const place = href.split('#')[0] ?? '';
      const named =
        SITE_PAGES.some((each) => siteHref(each.id)?.href === place) ||
        Object.values(OUTSIDE).some((address) => address !== '' && address === place) ||
        Object.values(DOWNLOADS).includes(place);
      assert.ok(known || named, `${page.id} links to "${href}"`);
    }
    const typed = [...source(page).matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((found) => found[1]);
    assert.deepEqual(typed, [], `${page.id} types an address into a link`);
  }
});

test('a page path finds its page, and a name nobody has finds nothing', () => {
  assert.equal(pageOfPath('/index.html')?.id, 'home');
  assert.equal(pageOfPath('/')?.id, 'home');
  assert.equal(pageOfPath('/world/index.html')?.id, 'world');
  assert.equal(pageOfPath('/game/')?.id, 'game');
  assert.equal(pageOfPath('/panel/index.html')?.id, 'panel');
  assert.equal(pageOfPath('/staff/index.html'), null);
  assert.equal(pageOfPath('/world/deeper/index.html'), null);
  assert.equal(pageOfPath('/World/'), null);
  assert.equal(siteHref('nowhere'), null);
  assert.throws(() => fillKeys('<a data-to="nowhere"></a>'), /nowhere/);
  assert.throws(() => fillKeys('<p data-t="home.nothing"></p>'), /home\.nothing/);
  assert.throws(() => fillKeys('<p data-t="home.title">kept</p>'), /not empty/);
});

test('a place with no address shows no link, and one with an address shows its link', () => {
  const html = '<a data-to="discord" data-t="home.discord"></a><a data-to="play" data-t="shell.navPlay"></a>';
  const filled = fillKeys(html, { ...OUTSIDE, discord: '' });
  assert.doesNotMatch(filled, /Discord/);
  assert.match(fillKeys(html), new RegExp(`href="${OUTSIDE.discord}" rel="noopener">Join the Discord<`), 'the invite');
  assert.match(filled, /href="https:\/\/noshores\.online\/play\/" rel="noopener">Play</, 'the game under the site');
});

test('a section that needs a place with no address is left out whole, and kept once the place has one', () => {
  const closed = { ...OUTSIDE, discord: '' };
  const needs = (name: string) =>
    `<section data-needs="${name}"><h2 data-t="shell.navDiscord"></h2></section><p data-t="home.title"></p>`;
  const title = '<p>No Shores: a pirate sandbox in a shared world</p>';
  assert.equal(fillKeys(needs('discord'), closed), title);
  assert.equal(fillKeys(needs('discord')), `<section><h2>Discord</h2></section>${title}`, 'kept once it has one');
  assert.equal(fillKeys(needs('play'), closed), `<section><h2>Discord</h2></section>${title}`);
  assert.throws(() => fillKeys(needs('nowhere')), /nowhere/);
  assert.throws(() => fillKeys('<section data-needs="play"><section></section></section>'), /section of its own/);
  assert.throws(
    () => fillKeys('<div data-needs="discord"><h2 data-t="shell.navDiscord"></h2></div>'),
    /only a section/,
  );
  assert.throws(() => fillKeys("<section data-needs='discord'></section>"), /only a section/);
});

test('every scene fills its frame: only the lights laid over Home’s scene and the logo have clear cells', () => {
  const seeThrough = new Set(['overlook-lights', 'logo']);
  for (const [name, draw] of Object.entries(PICTURES)) {
    if (seeThrough.has(name)) continue;
    assert.equal(draw().cells.filter((ink) => !ink).length, 0, name);
  }
});

test('each picture is the same at every build and under 64 KB', () => {
  for (const [name, draw] of Object.entries(PICTURES)) {
    const first = pngOf(draw());
    assert.ok(first.equals(pngOf(draw())), `${name} differs between two draws`);
    assert.ok(first.length < 64 * 1024, `${name} is ${first.length} bytes`);
  }
});

test("the Discord server's icon fits Discord's limit, and the round crop Discord gives it never reaches the letter", () => {
  const icon = PICTURES['server-icon']?.();
  assert.ok(icon && icon.width === icon.height && icon.width <= 1024, 'square, at most 1024 pixels');
  const night = new Set(['#060a14', '#0a1222', '#0f1b31', '#0e182c', '#132039', '#192a48', '#b4c1d6']);
  const middle = icon.width / 2;
  let nearest = Infinity;
  icon.cells.forEach((ink, cell) => {
    if (night.has(ink)) return;
    const away = Math.hypot((cell % icon.width) + 0.5 - middle, Math.floor(cell / icon.width) + 0.5 - middle);
    nearest = Math.min(nearest, middle - away);
  });
  assert.ok(nearest >= icon.width * 0.06, `the letter comes within ${nearest} pixels of the round edge`);
});

test('every picture a page names exists and has words for its alt text, or is marked as decoration', () => {
  for (const page of SITE_PAGES)
    for (const [tag] of source(page).matchAll(/<img\b[^>]*>/g))
      assert.match(tag, /\sdata-t-alt="|\saria-hidden="true"/, `${page.id}: ${tag} has no words for its alt text`);
  for (const { page, html } of made)
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /\ssrc="\/art\/[a-z0-9-]+\.png\?v=[0-9a-f]{8}"/, `${page.id}: ${tag}`);
      assert.match(tag, /\salt="[^"]*"/, `${page.id}: ${tag}`);
    }
  assert.equal(pictureOf('nothing'), null);
});

test('no page loads anything from another site, and its font is bundled', () => {
  const css = readFileSync(new URL('src/site.css', SITE), 'utf8');
  assert.match(css, /@import '@fontsource-variable\/pixelify-sans/);
  assert.doesNotMatch(css, /(?:url\(|@import)\s*['"]?(?:https?:)?\/\//);
  for (const { page, html } of made) {
    const loads = [...html.matchAll(/<(?:img|script|link|iframe|source)\b[^>]*\s(?:src|href)="([^"]*)"/g)].map(
      (found) => found[1],
    );
    for (const address of loads)
      assert.ok(address?.startsWith('/') && !address.startsWith('//'), `${page.id} loads ${address}`);
  }
  assert.match(CONTENT_POLICY, /default-src 'none'/);
  assert.doesNotMatch(CONTENT_POLICY, /https?:|script-src|connect-src/);
});

test("each page's own policy: none runs a script but the panel, which runs its own and talks to the bot alone", () => {
  for (const { page, html } of made) {
    const policy = policyOf(page);
    assert.match(policy, /^default-src 'none'; /, page.id);
    assert.doesNotMatch(policy, /'unsafe|localhost|http:/, page.id);
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((found) => found[0]);
    if (page.id !== 'panel') {
      assert.equal(policy, CONTENT_POLICY, page.id);
      assert.deepEqual(scripts, [], `${page.id} runs a script`);
      continue;
    }
    assert.match(policy, /script-src 'self'/);
    assert.match(policy, new RegExp(`connect-src ${BOT_ORIGIN.replace(/\./g, '\\.')}(;|$)`));
    assert.deepEqual(scripts, ['<script type="module" src="/src/panel/panelPage.ts">']);
  }
});

test('each page is under 96 KB with its stylesheet', () => {
  const css = readFileSync(new URL('src/site.css', SITE)).length;
  for (const { page, html } of made) assert.ok(Buffer.byteLength(html) + css < 96 * 1024, page.id);
});

test('no page has a timer, a clock, a countdown, a staff link, an account area or a languages menu', () => {
  // "account" alone is a word of the premise ("which account is true"), so only an account page or link is banned
  const banned =
    /\btimers?\b|\bclocks?\b|countdown|\bstaff\b|\badmin|sign[ -]?in|log[ -]?in|\blanguages?\b|<select|<script|href="[^"]*account/i;
  // the Discord bot's panel is the one page that signs in, with Discord, and runs its own script to do it
  const signsIn = /sign[ -]?in|<script/gi;
  for (const { page, html } of made)
    assert.doesNotMatch(page.id === 'panel' ? html.replace(signsIn, '') : html, banned, page.id);
  for (const [key, text] of Object.entries(WORDS))
    assert.doesNotMatch(key.startsWith('panel.') ? text.replace(signsIn, '') : text, banned, key);
});

test('the page for an address with no page is built, kept out of the foot and out of search', () => {
  const lost = made.find(({ page }) => page.id === 'lost');
  assert.ok(lost, 'built');
  assert.match(lost.html, /<meta name="robots" content="noindex"/);
  for (const { html } of made) assert.doesNotMatch(html, /href="\/lost\/"/, 'no page links to it');
});

test('the foot holds the copyright of Vestige Studios on every page', () => {
  for (const { page, html } of made) assert.match(html, /© Vestige Studios/, page.id);
});

test("the site's downloads are the Worker's names that never move, each sent to the newest installer", () => {
  assert.deepEqual(Object.keys(DOWNLOADS), [...LATEST_NAMES]);
  for (const name of LATEST_NAMES) assert.equal(siteHref(name)?.href, `/download/${name}`);
  const app = made.find((each) => each.page.id === 'app')?.html ?? '';
  for (const name of LATEST_NAMES)
    assert.ok(app.includes(`href="/download/${name}"`), `the Download page offers ${name}`);
});
