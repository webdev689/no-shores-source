// Feeds: new YouTube videos and posts from RSS or Atom feeds, read every ten minutes. The first read of a feed only
// marks where it stands, so turning it on never floods a channel with the past; after that each new item is posted,
// oldest first, a few at most a read. Feeds are read through the fetch the module is made with, so tests fake it.

import { escapeText, fillSlots } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, errorWords, postTo } from '../kit.ts';
import { type Fetch, USER_AGENT } from '../rest.ts';
import { serversWith } from './stats.ts';
import type { ServerModule } from './module.ts';

/** The minute of each ten when the feeds are read. */
export const FEEDS_MINUTE = 7;
/** The most new items one read posts from a feed. */
export const NEW_A_READ = 5;
export const FEED_TIMEOUT_MS = 8_000;
/** How many feeds are read at once: a Worker holds six connections open at a time, and its posts need some. */
export const FEEDS_AT_ONCE = 4;
/**
 * How long a run goes on starting reads. It ends well inside the ten minutes before the next, and what it did not
 * reach is read first next time, so a server with many dead feeds holds up no other for long.
 */
export const FEEDS_RUN_MS = 3 * 60_000;
/** The most redirects a feed's address is followed through. */
export const FEED_REDIRECTS_MAX = 3;
/** How many of a feed's newest items a read remembers, so one deleted brings back none below it. */
export const RECENT_KEPT = 10;
/** The most of a feed the bot reads, and the most items it looks at: a feed past them is read only so far. */
export const FEED_BYTES_MAX = 512 * 1024;
export const FEED_ITEMS_MAX = 50;
/** The most of one value (an id, a title, a link) the bot reads, and the most links of one entry it looks at. */
const VALUE_MAX = 4000;
const LINKS_MAX = 20;

/** One item of a feed. */
export interface FeedItem {
  readonly id: string;
  readonly title: string;
  /** An http or https address, or '' when the feed gave none fit to post. */
  readonly link: string;
}

const NAMED: Readonly<Record<string, string>> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

/** A character by its number, or `reference` as written when no character has that number. */
const characterOf = (code: number, reference: string): string =>
  code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : reference;

/** XML's text read back in one pass, so the `&` an `&amp;` gives never starts a second reference. */
const unescapeXml = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(
      /&(?:#[xX]([\da-fA-F]{1,6})|#(\d{1,7})|(lt|gt|quot|apos|amp));/g,
      (reference, hex?: string, decimal?: string, name?: string) =>
        name ? (NAMED[name] ?? reference) : characterOf(hex ? parseInt(hex, 16) : Number(decimal), reference),
    )
    .trim();

/** Only A to Z lower-cased: the length stays, so an index into one is an index into the other. */
const asciiLower = (text: string): string => text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());

interface Span {
  readonly start: number;
  readonly inner: number;
  readonly end: number;
  readonly whole: number;
}

/**
 * Where each `<tag ...>...</tag>` in `xml` starts and ends, the inside's bounds with it, at most `max`. Read by index,
 * forward only, so a feed of unclosed tags costs one pass and never a pass for each. `lower` is `xml` lower-cased.
 */
function spans(lower: string, tag: string, max: number): Span[] {
  const out: Span[] = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let from = 0;
  while (out.length < max) {
    const start = lower.indexOf(open, from);
    if (start < 0) break;
    const after = lower[start + open.length] ?? '';
    if (after !== '>' && !/\s/.test(after)) {
      from = start + open.length;
      continue;
    }
    const inner = lower.indexOf('>', start);
    const end = inner < 0 ? -1 : lower.indexOf(close, inner);
    if (end < 0) break;
    out.push({ start, inner: inner + 1, end, whole: end + close.length });
    from = end + close.length;
  }
  return out;
}

/** The first value of a tag inside a piece of XML. */
const tagText = (xml: string, tag: string): string => {
  const [span] = spans(asciiLower(xml), tag, 1);
  return span ? unescapeXml(xml.slice(span.inner, Math.min(span.end, span.inner + VALUE_MAX))) : '';
};

/**
 * A tag's quoted attributes by lower-cased name, read left to right once. A quote that never closes ends the reading,
 * as no later quote of its kind closes either, so a tag of unclosed quotes costs one pass.
 */
function attributesOf(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /\s([\w:-]+)\s*=\s*(["'])/g;
  for (let match = pattern.exec(tag); match; match = pattern.exec(tag)) {
    const [, name = '', quote = '"'] = match;
    const close = tag.indexOf(quote, pattern.lastIndex);
    if (close < 0) break;
    const key = asciiLower(name);
    if (!found.has(key)) found.set(key, tag.slice(pattern.lastIndex, close));
    pattern.lastIndex = close + 1;
  }
  return found;
}

/** An Atom entry's link: the href of its first `<link>` to its own page (rel alternate, or none), else of its first. */
function hrefOf(entry: string): string {
  const lower = asciiLower(entry);
  const links: Array<Map<string, string>> = [];
  let from = 0;
  while (links.length < LINKS_MAX) {
    const start = lower.indexOf('<link', from);
    if (start < 0) break;
    const end = lower.indexOf('>', start);
    links.push(attributesOf(entry.slice(start, end < 0 ? start + VALUE_MAX : Math.min(end, start + VALUE_MAX))));
    if (end < 0) break;
    from = end;
  }
  const own = links.find((link) => ['', 'alternate'].includes(asciiLower(link.get('rel') ?? '')));
  return unescapeXml((own ?? links[0])?.get('href') ?? '');
}

/**
 * A link as a post may carry it: an absolute http or https address with no name or password before its host, or
 * ''. Its brackets and parentheses are percent-encoded, so it can neither close a masked link nor start one.
 */
function postableLink(text: string): string {
  let url: URL;
  try {
    url = new URL(text.replace(/\s+/g, ''));
  } catch {
    return '';
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return '';
  return url.href.replace(/[()[\]\\`]/g, (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** A feed's items, newest first as feeds list them: Atom entries or RSS items, at most FEED_ITEMS_MAX. */
export function feedItems(xml: string): FeedItem[] {
  const lower = asciiLower(xml);
  const atom = spans(lower, 'entry', FEED_ITEMS_MAX).map((span) => {
    const entry = xml.slice(span.start, span.whole);
    const link = hrefOf(entry);
    return { id: tagText(entry, 'id') || link, title: tagText(entry, 'title'), link: postableLink(link) };
  });
  if (atom.length) return atom;
  return spans(lower, 'item', FEED_ITEMS_MAX).map((span) => {
    const item = xml.slice(span.start, span.whole);
    const link = tagText(item, 'link');
    return { id: tagText(item, 'guid') || link, title: tagText(item, 'title'), link: postableLink(link) };
  });
}

/** A response's text, at most FEED_BYTES_MAX of it: a feed that runs on is read so far and no further. */
export async function feedText(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, FEED_BYTES_MAX);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < FEED_BYTES_MAX) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, FEED_BYTES_MAX));
  let filled = 0;
  for (const part of parts) {
    const take = part.subarray(0, bytes.length - filled);
    bytes.set(take, filled);
    filled += take.length;
    if (filled >= bytes.length) break;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Whether a host is this machine or on a private network, by its name or as an address in a private range. The
 * address parser has already written every IPv4 form as four decimal numbers, and IPv6 in its short form.
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.startsWith('[')) return /^\[(::|f[cd][\da-f]{2}:|fe[89ab][\da-f]:)/.test(host);
  const octets = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!octets) return false;
  const first = Number(octets[1]);
  const second = Number(octets[2]);
  return (
    [0, 10, 127].includes(first) ||
    (first === 100 && second >= 64 && second < 128) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second < 32) ||
    (first === 192 && second === 168)
  );
}

/** Whether the bot may read an address: https, to a host that is neither this machine nor a private network's. */
function readable(address: string): boolean {
  if (!/^https:\/\/\S+$/.test(address)) return false;
  try {
    return !isLocalHost(new URL(address).hostname);
  } catch {
    return false;
  }
}

/** Where a feed is read from: a YouTube channel's own feed, or an https address; '' for neither. */
export function feedUrl(feed: Settings): string {
  const source = String(feed.source ?? '');
  if (feed.kind === 'youtube')
    return /^UC[\w-]{20,24}$/.test(source) ? `https://www.youtube.com/feeds/videos.xml?channel_id=${source}` : '';
  return readable(source) ? source : '';
}

/**
 * A feed's text, or '' when it cannot be read. The fetch is told not to follow redirects, so each one is checked here
 * first: a feed may move to another address the bot may read, never to plain http or a private host.
 */
async function fetchedText(fetchFeed: Fetch, url: string): Promise<string> {
  const signal = AbortSignal.timeout(FEED_TIMEOUT_MS);
  let address = url;
  try {
    for (let hop = 0; hop <= FEED_REDIRECTS_MAX; hop += 1) {
      const response = await fetchFeed(address, { headers: { 'user-agent': USER_AGENT }, redirect: 'manual', signal });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status > 399 || !location)
        return response.ok ? await feedText(response) : '';
      await response.body?.cancel().catch(() => {});
      address = new URL(location, address).href;
      if (!readable(address)) return '';
    }
  } catch {
    return '';
  }
  return '';
}

/** One feed of one server, ready to read. */
interface FeedRead {
  readonly guildId: string;
  readonly feed: Settings;
  readonly url: string;
  readonly channel: string;
  /** Where social_seen keeps the feed's place: its channel and address, so two channels of one address keep two. */
  readonly key: string;
  /** Orders every feed of every server, and names the one a run stopped before. */
  readonly turn: string;
}

interface Seen {
  readonly feed: string;
  readonly last_id: string;
  readonly recent: string;
}

const recentOf = (saved: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

async function readFeed(context: BotContext, fetchFeed: Fetch, read: FeedRead): Promise<void> {
  const items = feedItems(await fetchedText(fetchFeed, read.url)).filter((item) => item.id);
  const newest = items[0];
  if (!newest) return;
  // a feed with no place of its own reads on from one saved under its address alone
  const addressKey = read.url.slice(0, 300);
  const { results } = await context.database
    .prepare('SELECT feed, last_id, recent FROM social_seen WHERE guild_id = ? AND feed IN (?, ?)')
    .bind(read.guildId, read.key, addressKey)
    .all<Seen>();
  const own = results.find((row) => row.feed === read.key);
  const saved = own ?? results.find((row) => row.feed === addressKey);
  const known = new Set(saved ? [saved.last_id, ...recentOf(saved.recent)] : []);
  const seenAt = items.findIndex((item) => known.has(item.id));
  // a feed that moved on past all it lists gives only its newest
  const fresh = !saved ? [] : (seenAt < 0 ? items.slice(0, 1) : items.slice(0, seenAt)).slice(0, NEW_A_READ);
  if (own && !fresh.length) return;
  const recent = JSON.stringify(items.slice(0, RECENT_KEPT).map((item) => item.id));
  const nowS = Math.floor(context.now() / 1000);
  const claim = own
    ? context.database
        .prepare(
          'UPDATE social_seen SET last_id = ?, recent = ?, checked_at = ? WHERE guild_id = ? AND feed = ? AND last_id = ?',
        )
        .bind(newest.id, recent, nowS, read.guildId, read.key, own.last_id)
    : context.database
        .prepare(
          'INSERT OR IGNORE INTO social_seen (guild_id, feed, last_id, recent, checked_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(read.guildId, read.key, newest.id, recent, nowS);
  // the write claims the items: a run that overlaps this one finds the place moved on, and posts none of them again
  if ((await claim.run()).meta.changes !== 1) return;
  // once a feed has read on from a place saved under its address alone, that place goes: a feed of the same address
  // added later must mark where it stands, never read on from a place frozen at an old item
  if (!own && saved)
    await context.database
      .prepare('DELETE FROM social_seen WHERE guild_id = ? AND feed = ?')
      .bind(read.guildId, addressKey)
      .run();
  const role = String(read.feed.role ?? '');
  for (const item of fresh.reverse()) {
    // a feed's title is someone else's words: its markdown is shown as typed, never read as links or headings
    const words = fillSlots(read.feed.message, { title: escapeText(item.title), link: item.link }).slice(0, 1900);
    await postTo(context.rest, read.channel, {
      content: role ? `<@&${role}> ${words}` : words,
      allowed_mentions: role ? { roles: [role] } : { parse: [] },
    });
  }
}

/** Every feed of every server where the module is on, in the order of their turns. */
async function feedReads(context: BotContext): Promise<FeedRead[]> {
  const reads: FeedRead[] = [];
  for (const guildId of await serversWith(context, 'socials')) {
    const config = (await context.config(guildId, 'socials'))?.config;
    const feeds = Array.isArray(config?.feeds) ? config.feeds.map(recordOf) : [];
    for (const feed of feeds) {
      const url = feedUrl(feed);
      const channel = String(feed.channel ?? '');
      const key = `${channel} ${url}`;
      if (url && channel) reads.push({ guildId, feed, url, channel, key, turn: `${guildId} ${key}` });
    }
  }
  return reads.sort((one, other) => (one.turn < other.turn ? -1 : one.turn > other.turn ? 1 : 0));
}

/**
 * One run: FEEDS_AT_ONCE feeds read at a time, from the one the last run stopped before, until every feed is read or
 * FEEDS_RUN_MS has gone by on `clock`. A feed that fails is logged and stops no other.
 */
async function readAll(context: BotContext, fetchFeed: Fetch, clock: () => number): Promise<void> {
  const started = clock();
  const reads = await feedReads(context);
  const stopped = await context.database
    .prepare('SELECT next_turn FROM social_cursor WHERE id = 1')
    .first<{ next_turn: string }>();
  const from = stopped?.next_turn ?? '';
  const startAt = Math.max(
    0,
    reads.findIndex((read) => read.turn >= from),
  );
  const queue = [...reads.slice(startAt), ...reads.slice(0, startAt)];
  let taken = 0;
  const reader = async () => {
    while (taken < queue.length && clock() - started < FEEDS_RUN_MS) {
      const read = queue[taken];
      taken += 1;
      if (!read) break;
      try {
        await readFeed(context, fetchFeed, read);
      } catch (error) {
        context.log(`[socials] a feed of ${read.guildId} failed: ${errorWords(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: FEEDS_AT_ONCE }, reader));
  const next = queue[taken]?.turn ?? '';
  if (next !== from)
    await context.database
      .prepare('INSERT OR REPLACE INTO social_cursor (id, next_turn) VALUES (1, ?)')
      .bind(next)
      .run();
}

/**
 * The feeds module, reading through `fetchFeed`. `clock` times a run: the context's clock is the minute the run is
 * for, and it does not move while the run goes on.
 */
export function socialsWith(fetchFeed: Fetch, clock: () => number = () => Date.now()): ServerModule {
  return {
    id: 'socials',
    async minute(context) {
      if (new Date(context.now()).getUTCMinutes() % 10 !== FEEDS_MINUTE) return;
      await readAll(context, fetchFeed, clock);
    },
  };
}

export const socialsModule = socialsWith((url, init) => fetch(url, init));
