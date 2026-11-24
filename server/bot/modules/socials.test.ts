import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOD_ROLE } from '../botForTests.ts';
import { standEngagement } from './engagementForTests.ts';
import { FEED_BYTES_MAX, FEED_ITEMS_MAX, feedItems, feedText, feedUrl, socialsWith } from './socials.ts';

const ATOM = `<feed><entry><id>yt:video:3</id><title>Patch &amp; notes</title><link rel="alternate" href="https://www.youtube.com/watch?v=3"/></entry>
<entry><id>yt:video:2</id><title>Two</title><link href="https://www.youtube.com/watch?v=2"/></entry></feed>`;

test('feeds: a feed of a million unclosed tags is read in one pass, and no more than FEED_ITEMS_MAX items are looked at', () => {
  const started = performance.now();
  assert.deepEqual(feedItems(`<feed>${'<entry><title>'.repeat(200_000)}</feed>`), []);
  assert.deepEqual(feedItems(`<rss>${'<item><title>'.repeat(200_000)}`), []);
  assert.ok(performance.now() - started < 2000, 'linear, not a pass for each tag');
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

test('feeds: the first read marks the place; later reads post what is new, with its mention, once', async () => {
  const NEWS = '900000000000000073';
  const CHANNEL_ID = `UC${'a'.repeat(22)}`;
  let xml = ATOM;
  const asked: string[] = [];
  const socials = socialsWith(async (url) => {
    asked.push(url);
    return new Response(xml);
  });
  const feed = { kind: 'youtube', source: CHANNEL_ID, channel: NEWS, message: 'New: {title}\n{link}', role: MOD_ROLE };
  const bot = await standEngagement({ socials: { feeds: [feed] } }, [socials]);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 7);
  await socials.minute?.(bot.context);
  assert.deepEqual(asked, [`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`]);
  assert.equal(bot.world.posts(NEWS).length, 0, 'the first read only marks the place');
  const four = '<entry><id>yt:video:4</id><title>Four</title><link href="https://www.youtube.com/watch?v=4"/></entry>';
  xml = ATOM.replace('<feed>', `<feed>${four}`);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 17);
  await socials.minute?.(bot.context);
  const [post] = bot.world.posts(NEWS);
  assert.equal(post?.content, `<@&${MOD_ROLE}> New: Four\nhttps://www.youtube.com/watch?v=4`);
  assert.deepEqual(post?.allowed_mentions, { roles: [MOD_ROLE] });
  await socials.minute?.(bot.context);
  assert.equal(bot.world.posts(NEWS).length, 1, 'told once');
  const phish =
    '<entry><id>yt:video:5</id><title>[Free](https://phish.example) # now</title><link href="https://www.youtube.com/watch?v=5"/></entry>';
  xml = xml.replace('<feed>', `<feed>${phish}`);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 27);
  await socials.minute?.(bot.context);
  assert.equal(
    bot.world.posts(NEWS).at(-1)?.content,
    `<@&${MOD_ROLE}> New: \\[Free\\]\\(https://phish.example\\) \\# now\nhttps://www.youtube.com/watch?v=5`,
    "a feed's title is shown as typed, never as a link",
  );
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 28);
  await socials.minute?.(bot.context);
  assert.equal(asked.length, 4, 'read only on its minute of each ten');
});
