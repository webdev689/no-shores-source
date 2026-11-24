// Feeds: new YouTube videos and posts from RSS or Atom feeds, read every ten minutes. The first read of a feed only
// marks where it stands, so turning it on never floods a channel with the past; after that each new item is posted,
// oldest first, a few at most a read. Feeds are read through the fetch the module is made with, so tests fake it.

import { escapeText, fillSlots } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, postTo } from '../kit.ts';
import { type Fetch, USER_AGENT } from '../rest.ts';
import { serversWith } from './birthdays.ts';
import type { ServerModule } from './module.ts';

/** The minute of each ten when the feeds are read. */
export const FEEDS_MINUTE = 7;
/** The most new items one read posts from a feed. */
export const NEW_A_READ = 5;
export const FEED_TIMEOUT_MS = 8_000;
/** The most of a feed the bot reads, and the most items it looks at: a feed past them is read only so far. */
export const FEED_BYTES_MAX = 512 * 1024;
export const FEED_ITEMS_MAX = 50;
/** The most of one value (an id, a title, a link) the bot reads. */
const VALUE_MAX = 4000;

/** One item of a feed. */
export interface FeedItem {
  readonly id: string;
  readonly title: string;
  readonly link: string;
}

const unescapeXml = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

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
  const [span] = spans(xml.toLowerCase(), tag, 1);
  return span ? unescapeXml(xml.slice(span.inner, Math.min(span.end, span.inner + VALUE_MAX))) : '';
};

/** An Atom entry's link: the first `<link>`'s href. */
const hrefOf = (entry: string): string => {
  const start = entry.toLowerCase().indexOf('<link');
  if (start < 0) return '';
  const end = entry.indexOf('>', start);
  const piece = entry.slice(start, end < 0 ? start + VALUE_MAX : Math.min(end, start + VALUE_MAX));
  return /href="([^"]+)"/i.exec(piece)?.[1] ?? '';
};

/** A feed's items, newest first as feeds list them: Atom entries or RSS items, at most FEED_ITEMS_MAX. */
export function feedItems(xml: string): FeedItem[] {
  const lower = xml.toLowerCase();
  const atom = spans(lower, 'entry', FEED_ITEMS_MAX).map((span) => {
    const entry = xml.slice(span.start, span.whole);
    const link = hrefOf(entry);
    return { id: tagText(entry, 'id') || link, title: tagText(entry, 'title'), link: unescapeXml(link) };
  });
  if (atom.length) return atom;
  return spans(lower, 'item', FEED_ITEMS_MAX).map((span) => {
    const item = xml.slice(span.start, span.whole);
    const link = tagText(item, 'link');
    return { id: tagText(item, 'guid') || link, title: tagText(item, 'title'), link };
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

/** Where a feed is read from: a YouTube channel's own feed, or an https address; '' for neither. */
export function feedUrl(feed: Settings): string {
  const source = String(feed.source ?? '');
  if (feed.kind === 'youtube')
    return /^UC[\w-]{20,24}$/.test(source) ? `https://www.youtube.com/feeds/videos.xml?channel_id=${source}` : '';
  return /^https:\/\/\S+$/.test(source) ? source : '';
}

async function readFeed(context: BotContext, fetchFeed: Fetch, guildId: string, feed: Settings): Promise<void> {
  const url = feedUrl(feed);
  const channel = String(feed.channel ?? '');
  if (!url || !channel) return;
  let xml = '';
  try {
    const response = await fetchFeed(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!response.ok) return;
    xml = await feedText(response);
  } catch {
    return;
  }
  const items = feedItems(xml).filter((item) => item.id);
  const newest = items[0];
  if (!newest) return;
  const key = url.slice(0, 300);
  const seen = await context.database
    .prepare('SELECT last_id FROM social_seen WHERE guild_id = ? AND feed = ?')
    .bind(guildId, key)
    .first<{ last_id: string }>();
  const mark = () =>
    context.database
      .prepare('INSERT OR REPLACE INTO social_seen (guild_id, feed, last_id, checked_at) VALUES (?, ?, ?, ?)')
      .bind(guildId, key, newest.id, Math.floor(context.now() / 1000))
      .run();
  if (!seen) {
    await mark();
    return;
  }
  const seenAt = items.findIndex((item) => item.id === seen.last_id);
  const fresh = (seenAt < 0 ? items.slice(0, 1) : items.slice(0, seenAt)).slice(0, NEW_A_READ).reverse();
  const role = String(feed.role ?? '');
  for (const item of fresh) {
    // a feed's title is someone else's words: its markdown is shown as typed, never read as links or headings
    const link = item.link.replace(/\s+/g, '');
    const words = fillSlots(feed.message, { title: escapeText(item.title), link }).slice(0, 1900);
    await postTo(context.rest, channel, {
      content: role ? `<@&${role}> ${words}` : words,
      allowed_mentions: role ? { roles: [role] } : { parse: [] },
    });
  }
  if (fresh.length) await mark();
}

/** The feeds module, reading through `fetchFeed`. */
export function socialsWith(fetchFeed: Fetch): ServerModule {
  return {
    id: 'socials',
    async minute(context) {
      if (new Date(context.now()).getUTCMinutes() % 10 !== FEEDS_MINUTE) return;
      for (const guildId of await serversWith(context, 'socials')) {
        const config = (await context.config(guildId, 'socials'))?.config;
        const feeds = Array.isArray(config?.feeds) ? config.feeds.map(recordOf) : [];
        for (const feed of feeds) await readFeed(context, fetchFeed, guildId, feed);
      }
    },
  };
}

export const socialsModule = socialsWith((url, init) => fetch(url, init));
