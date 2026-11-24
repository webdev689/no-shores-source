import assert from 'node:assert/strict';
import { type TestContext, test } from 'node:test';
import { GUILD, MOD_ROLE, OWNER, guildCreate } from '../botForTests.ts';
import type { Fetch } from '../rest.ts';
import { writeConfig } from '../store.ts';
import { standEngagement } from './engagementForTests.ts';
import {
  FEEDS_AT_ONCE,
  FEEDS_RUN_MS,
  FEED_BYTES_MAX,
  FEED_ITEMS_MAX,
  FEED_TIMEOUT_MS,
  feedItems,
  feedText,
  feedUrl,
  socialsWith,
} from './socials.ts';

const ATOM = `<feed><entry><id>yt:video:3</id><title>Patch &amp; notes</title><link rel="alternate" href="https://www.youtube.com/watch?v=3"/></entry>
<entry><id>yt:video:2</id><title>Two</title><link href="https://www.youtube.com/watch?v=2"/></entry></feed>`;
const FOUR = '<entry><id>yt:video:4</id><title>Four</title><link href="https://www.youtube.com/watch?v=4"/></entry>';
const NEWS = '900000000000000073';
const MORE_NEWS = '900000000000000074';
const CHANNEL_ID = `UC${'a'.repeat(22)}`;
const YOUTUBE_FEED = { kind: 'youtube', source: CHANNEL_ID, channel: NEWS, message: '{title}', role: '' };
/** The minutes the feeds are read on, ten apart. */
const RUNS = [7, 17, 27, 37].map((minute) => Date.UTC(2026, 10, 18, 12, minute));

/** How many characters every indexOf in `work` looked through: a pass for each tag counts the input many times. */
function charactersScanned(context: TestContext, work: () => void): number {
  const searches = context.mock.method(String.prototype, 'indexOf');
  work();
  const calls = [...searches.mock.calls];
  searches.mock.restore();
  return calls.reduce((sum, call) => {
    const searched = String(call.this);
    const from = Number(call.arguments[1] ?? 0);
    const found = Number(call.result);
    return sum + (found < 0 ? searched.length - from : found - from);
  }, 0);
}

/** One server with `feeds`, read through `fetchFeed`; `clock` is the run's own. */
async function standFeeds(feeds: readonly object[], fetchFeed: Fetch, clock?: () => number) {
  const socials = socialsWith(fetchFeed, clock);
  const bot = await standEngagement({ socials: { feeds } }, [socials]);
  const runAt = async (when: number) => {
    bot.clock.now = when;
    await socials.minute?.(bot.context);
  };
  return { ...bot, socials, runAt };
}

test('feeds: a feed of a million unclosed tags is read in one pass, and no more than FEED_ITEMS_MAX items are looked at', (context) => {
  for (const unclosed of [
    `<feed>${'<entry><title>'.repeat(200_000)}</feed>`,
    `<rss>${'<item><title>'.repeat(200_000)}`,
  ]) {
    let items: unknown[] = [];
    const scanned = charactersScanned(context, () => {
      items = feedItems(unclosed);
    });
    assert.deepEqual(items, []);
    assert.ok(scanned <= 3 * unclosed.length, `linear, not a pass for each tag: ${scanned} of ${unclosed.length}`);
  }
  const items = Array.from(
    { length: 80 },
    (unused, index) => `<item><guid>g${index}</guid><title>T${index}</title></item>`,
  );
  assert.equal(feedItems(`<rss>${items.join('')}</rss>`).length, FEED_ITEMS_MAX);
  assert.deepEqual(
    feedItems(
      '<feed><entryway>x</entryway><entry id="e"><id>e1</id><link rel="alternate" href="https://x.dev/1"/></entry></feed>',
    ),
    [{ id: 'e1', title: '', link: 'https://x.dev/1' }],
    'a tag is its own name, not one that begins with it',
  );
});

test('feeds: a feed that runs on is read to FEED_BYTES_MAX and no further, its stream let go', async () => {
  let pulled = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 100) return controller.close();
      controller.enqueue(new TextEncoder().encode('x'.repeat(64 * 1024)));
    },
    cancel() {
      cancelled = true;
    },
  });
  assert.equal((await feedText(new Response(body))).length, FEED_BYTES_MAX);
  assert.ok(pulled < 20 && cancelled, 'it stopped asking once it had enough');
  assert.equal(await feedText(new Response('<rss/>')), '<rss/>');
});

test('feeds: Atom and RSS read, and only a YouTube channel id or an https address is ever fetched', () => {
  assert.deepEqual(feedItems(ATOM)[0], {
    id: 'yt:video:3',
    title: 'Patch & notes',
    link: 'https://www.youtube.com/watch?v=3',
  });
  assert.deepEqual(
    feedItems('<rss><channel><item><title>A</title><link>https://x.dev/a</link><guid>a1</guid></item></channel></rss>'),
    [{ id: 'a1', title: 'A', link: 'https://x.dev/a' }],
  );
  assert.equal(feedUrl({ kind: 'youtube', source: 'not-a-channel' }), '');
  assert.equal(feedUrl({ kind: 'rss', source: 'http://insecure.example/feed' }), '');
});

test("feeds: an item's link is kept only as an http or https address, and never as markdown", () => {
  const linkOf = (link: string) => feedItems(`<rss><item><guid>g</guid><link>${link}</link></item></rss>`)[0]?.link;
  assert.equal(linkOf('[Free Nitro](https://phish.example)'), '', 'a masked link is no address');
  assert.equal(linkOf('javascript:alert(1)'), '');
  assert.equal(linkOf('/relative/post'), '');
  assert.equal(linkOf('https://www.youtube.com@phish.example/'), '', 'an address that hides its host behind a name');
  assert.equal(linkOf('http://x.dev/a'), 'http://x.dev/a');
  assert.equal(
    linkOf('https://x.dev/a)[Free](https://phish.example'),
    'https://x.dev/a%29%5BFree%5D%28https://phish.example',
    'its brackets cannot close a masked link or start one',
  );
});

test('feeds: numeric character references are read as the characters they stand for', () => {
  const [item] = feedItems(
    '<rss><item><guid>g</guid><title>Don&#8217;t stop &#x1F600; &amp;#8217; &#0;</title></item></rss>',
  );
  assert.equal(item?.title, 'Don’t stop \u{1F600} &#8217; &#0;');
});

test("feeds: an Atom link in single quotes is read, and an entry's own page is its link", () => {
  const blogger = `<feed><entry><id>tag:blogger.com,1999:post-1</id><title type='text'>Post</title>
<link rel='replies' type='application/atom+xml' href='https://b.blogspot.com/feeds/1/comments/default'/>
<link rel='alternate' type='text/html' href='https://b.blogspot.com/2026/11/post.html' title='Post'/></entry></feed>`;
  assert.equal(feedItems(blogger)[0]?.link, 'https://b.blogspot.com/2026/11/post.html');
  assert.equal(
    feedItems("<feed><entry><id>e</id><link href='https://x.dev/1'/></entry></feed>")[0]?.link,
    'https://x.dev/1',
  );
});

test('feeds: letters that grow when lower-cased do not move where an entry is read', () => {
  const dotted = 'İ'.repeat(30);
  assert.deepEqual(
    feedItems(
      `<feed><title>${dotted}</title><entry><title>${dotted}</title><id>e1</id><link href="https://x.dev/1"/></entry></feed>`,
    ),
    [{ id: 'e1', title: dotted, link: 'https://x.dev/1' }],
  );
});

test('feeds: the first read marks the place; later reads post what is new, with its mention, once', async () => {
  let xml = ATOM;
  const asked: string[] = [];
  const feed = { ...YOUTUBE_FEED, message: 'New: {title}\n{link}', role: MOD_ROLE };
  const bot = await standFeeds([feed], async (url) => {
    asked.push(url);
    return new Response(xml);
  });
  await bot.runAt(Date.UTC(2026, 10, 18, 12, 7));
  assert.deepEqual(asked, [`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`]);
  assert.equal(bot.world.posts(NEWS).length, 0, 'the first read only marks the place');
  xml = ATOM.replace('<feed>', `<feed>${FOUR}`);
  await bot.runAt(Date.UTC(2026, 10, 18, 12, 17));
  const [post] = bot.world.posts(NEWS);
  assert.equal(post?.content, `<@&${MOD_ROLE}> New: Four\nhttps://www.youtube.com/watch?v=4`);
  assert.deepEqual(post?.allowed_mentions, { roles: [MOD_ROLE] });
  await bot.runAt(Date.UTC(2026, 10, 18, 12, 17));
  assert.equal(bot.world.posts(NEWS).length, 1, 'told once');
  const phish =
    '<entry><id>yt:video:5</id><title>[Free](https://phish.example) # now</title><link href="https://www.youtube.com/watch?v=5"/></entry>';
  xml = xml.replace('<feed>', `<feed>${phish}`);
  await bot.runAt(Date.UTC(2026, 10, 18, 12, 27));
  assert.equal(
    bot.world.posts(NEWS).at(-1)?.content,
    `<@&${MOD_ROLE}> New: \\[Free\\]\\(https://phish.example\\) \\# now\nhttps://www.youtube.com/watch?v=5`,
    "a feed's title is shown as typed, never as a link",
  );
  await bot.runAt(Date.UTC(2026, 10, 18, 12, 28));
  assert.equal(asked.length, 4, 'read only on its minute of each ten');
});

test('feeds: when the newest item is deleted, the one below it is not posted again', async () => {
  let xml = ATOM;
  const bot = await standFeeds([YOUTUBE_FEED], async () => new Response(xml));
  await bot.runAt(RUNS[0] ?? 0);
  xml = ATOM.replace(/<entry><id>yt:video:3<\/id>[\s\S]*?<\/entry>/, '');
  await bot.runAt(RUNS[1] ?? 0);
  assert.deepEqual(bot.world.posts(NEWS), [], 'nothing is new');
  xml = xml.replace('<feed>', `<feed>${FOUR}`);
  await bot.runAt(RUNS[2] ?? 0);
  assert.deepEqual(
    bot.world.posts(NEWS).map((post) => post.content),
    ['Four'],
  );
});

test('feeds: two feeds of one address each post in their own channel, and a place saved by address alone is kept', async () => {
  let xml = ATOM;
  const twice = await standFeeds(
    [YOUTUBE_FEED, { ...YOUTUBE_FEED, channel: MORE_NEWS }],
    async () => new Response(xml),
  );
  await twice.runAt(RUNS[0] ?? 0);
  xml = ATOM.replace('<feed>', `<feed>${FOUR}`);
  await twice.runAt(RUNS[1] ?? 0);
  assert.equal(twice.world.posts(NEWS).length, 1);
  assert.equal(twice.world.posts(MORE_NEWS).length, 1);

  const saved = await standFeeds([YOUTUBE_FEED], async () => new Response(xml));
  const address = feedUrl(YOUTUBE_FEED);
  saved.database.raw
    .prepare('INSERT INTO social_seen (guild_id, feed, last_id, checked_at) VALUES (?, ?, ?, ?)')
    .run(GUILD, address, 'yt:video:3', 1);
  await saved.runAt(RUNS[0] ?? 0);
  assert.deepEqual(
    saved.world.posts(NEWS).map((post) => post.content),
    ['Four'],
    'the place it saved before is where it reads on from',
  );
});

test('feeds: two runs at once post a new item once', async () => {
  let xml = ATOM;
  const bot = await standFeeds([YOUTUBE_FEED], async () => new Response(xml));
  await bot.runAt(RUNS[0] ?? 0);
  xml = ATOM.replace('<feed>', `<feed>${FOUR}`);
  bot.clock.now = RUNS[1] ?? 0;
  await Promise.all([bot.socials.minute?.(bot.context), bot.socials.minute?.(bot.context)]);
  assert.equal(bot.world.posts(NEWS).length, 1);
});

test('feeds: a run reads a few feeds at once, starts none past its time, and the next run begins where it stopped', async () => {
  const servers = [GUILD, '900000000000000301', '900000000000000302'];
  const deadFeeds = (server: number) =>
    Array.from({ length: 20 }, (unused, index) => ({
      ...YOUTUBE_FEED,
      kind: 'rss',
      source: `https://dead${server}-${index}.example/feed`,
    }));
  let clock = 0;
  let open = 0;
  let mostOpen = 0;
  const reads: Array<{ url: string; at: number }> = [];
  // every feed is dead: each read costs its whole timeout on the run's clock
  const bot = await standFeeds(
    deadFeeds(0),
    async (url) => {
      reads.push({ url, at: clock });
      clock += FEED_TIMEOUT_MS;
      open += 1;
      mostOpen = Math.max(mostOpen, open);
      await new Promise((resolve) => setImmediate(resolve));
      open -= 1;
      return new Response('', { status: 503 });
    },
    () => clock,
  );
  for (const [server, guildId] of servers.entries())
    if (server > 0) {
      const config = { feeds: deadFeeds(server) };
      await writeConfig(bot.database, {
        guildId,
        moduleId: 'socials',
        config,
        enabled: true,
        rev: 0,
        by: OWNER,
        nowS: 1,
      });
      await bot.send('GUILD_CREATE', guildCreate({ id: guildId, channels: [{ id: NEWS, name: 'news', type: 0 }] }));
    }
  const runs: string[][] = [];
  for (const when of RUNS.slice(0, 3)) {
    const started = clock;
    const before = reads.length;
    await bot.runAt(when);
    const read = reads.slice(before);
    assert.ok(
      read.every((each) => each.at - started < FEEDS_RUN_MS),
      'no read starts past the run time',
    );
    runs.push(read.map((each) => each.url));
  }
  assert.equal(mostOpen, FEEDS_AT_ONCE);
  const [first = [], second = []] = runs;
  assert.ok(first.length > FEEDS_AT_ONCE && first.length < 60, 'the first run stopped at its time');
  assert.ok(
    second.slice(0, first.length).every((url) => !first.includes(url)),
    'the second run reads first what the first did not reach',
  );
  assert.equal(new Set(runs.flat()).size, 60, 'in a few runs every feed is read');
});

test('feeds: no address on this machine or a private network is read, nor redirected to, nor plain http', async () => {
  const local = [
    'https://localhost/feed',
    'https://feeds.localhost/feed',
    'https://127.0.0.1/feed',
    'https://2130706433/feed',
    'https://10.1.2.3/feed',
    'https://172.16.0.1/feed',
    'https://192.168.0.10/feed',
    'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/feed',
    'https://0.0.0.0/feed',
    'https://[::1]/feed',
    'https://[::ffff:127.0.0.1]/feed',
    'https://[fd00::1]/feed',
    'https://[fe80::1]/feed',
  ];
  for (const source of local) assert.equal(feedUrl({ kind: 'rss', source }), '', source);
  assert.equal(feedUrl({ kind: 'rss', source: 'https://172.32.0.1/feed' }), 'https://172.32.0.1/feed');
  let xml = ATOM;
  const moves: Record<string, string> = {
    'https://plain.example/feed': 'http://plain.example/feed',
    'https://inward.example/feed': 'https://127.0.0.1/feed',
    'https://onward.example/feed': '/moved',
  };
  const asked: string[] = [];
  const followed: unknown[] = [];
  const feeds = Object.keys(moves).map((source, index) => ({
    ...YOUTUBE_FEED,
    kind: 'rss',
    source,
    channel: `90000000000000008${index}`,
  }));
  const bot = await standFeeds(feeds, async (url, init) => {
    asked.push(url);
    followed.push(init?.redirect);
    const location = moves[url];
    return location ? new Response(null, { status: 301, headers: { location } }) : new Response(xml);
  });
  await bot.runAt(RUNS[0] ?? 0);
  xml = ATOM.replace('<feed>', `<feed>${FOUR}`);
  await bot.runAt(RUNS[1] ?? 0);
  assert.deepEqual(new Set(asked), new Set([...Object.keys(moves), 'https://onward.example/moved']));
  assert.ok(
    followed.every((redirect) => redirect === 'manual'),
    'the fetch never follows a redirect by itself',
  );
  assert.deepEqual(
    feeds.map((feed) => bot.world.posts(feed.channel).length),
    [0, 0, 1],
  );
});
