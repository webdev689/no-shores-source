import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, TEXT_CHANNEL } from '../botForTests.ts';
import { blankEmbed } from '../law/message.ts';
import { actorOf, standCommunity } from './communityForTests.ts';
import { type Announcement, announceModule, announcement, channelsOf, lastDue } from './announce.ts';

const NEWS = '900000000000000034';
const ROLE_A = '900000000000000041';
const words = (content: string) => ({ content, embeds: [], buttons: [] });
const NEWS_ITEM: Announcement = {
  name: 'news',
  channels: [TEXT_CHANNEL, NEWS, TEXT_CHANNEL],
  message: {
    content: 'Patch day',
    embeds: [
      blankEmbed({ title: 'v2', color: '#336699', thumbnail: '{server_icon}', footer: '{server}' }),
      blankEmbed({ title: 'Fixes', fields: [{ name: 'Bugs', value: 'Fewer', inline: true }] }),
    ],
    buttons: [],
  },
  mode: 'new',
  ping: 'role',
  role: ROLE_A,
  repeat: 'daily',
  at: '12:00',
  weekday: '1',
};
const RULES: Announcement = { ...NEWS_ITEM, name: 'rules', channels: [TEXT_CHANNEL], message: words('Rule one') };
const EDITED: Announcement = { ...RULES, ping: 'none', role: '', repeat: 'once', at: '', mode: 'edit' };
type Bot = Awaited<ReturnType<typeof standCommunity>>;
const sendOf = (bot: Bot) => {
  const send = announceModule.actions?.send;
  assert.ok(send);
  return (name: string, messages: Announcement[]) => send(bot.context, GUILD, { name }, actorOf(), { messages });
};
const titlesOf = (post: Record<string, unknown> | undefined) =>
  ((post?.embeds ?? []) as Array<{ title: string }>).map((card) => card.title);

test('announcements: when each schedule falls due, in UTC', () => {
  const now = Date.UTC(2026, 10, 18, 12, 30); // a Wednesday
  assert.equal(lastDue({ repeat: 'daily', at: '12:00' }, now), Date.UTC(2026, 10, 18, 12, 0));
  assert.equal(lastDue({ repeat: 'daily', at: '13:00' }, now), Date.UTC(2026, 10, 17, 13, 0));
  assert.equal(lastDue({ repeat: 'hourly', at: '00:45' }, now), Date.UTC(2026, 10, 18, 11, 45));
  assert.equal(lastDue({ repeat: 'weekly', at: '09:00', weekday: '1' }, now), Date.UTC(2026, 10, 16, 9, 0));
  assert.equal(lastDue({ repeat: 'once', at: '2026-11-18 12:15' }, now), Date.UTC(2026, 10, 18, 12, 15));
  assert.equal(lastDue({ repeat: 'once', at: '12:15' }, now), 0, 'once needs a date');
  assert.equal(lastDue({ repeat: 'never', at: '12:00' }, now), 0);
});

test('announcements: words and embeds, the server filled in, and only the named mention allowed', () => {
  const snapshot = { guildId: GUILD, name: 'Harbour_Town', icon: 'ic0n' };
  const message = announcement(NEWS_ITEM, snapshot, Date.UTC(2026, 10, 18));
  assert.equal(message?.content, `<@&${ROLE_A}> Patch day`);
  assert.deepEqual(message?.allowed_mentions, { roles: [ROLE_A] });
  assert.deepEqual(titlesOf(message), ['v2', 'Fixes']);
  const icon = `https://cdn.discordapp.com/icons/${GUILD}/ic0n.png?size=256`;
  assert.deepEqual(message?.embeds[0]?.thumbnail, { url: icon });
  assert.deepEqual(message?.embeds[0]?.footer, { text: 'Harbour_Town' });
  assert.deepEqual(announcement({ ...NEWS_ITEM, ping: 'none' }, snapshot, 0)?.allowed_mentions, { parse: [] });
  const everyone = announcement({ ...NEWS_ITEM, ping: 'everyone' }, snapshot, 0);
  assert.deepEqual(everyone?.allowed_mentions, { parse: ['everyone'] });
  const alone = announcement({ ...NEWS_ITEM, ping: 'everyone', message: words('') }, snapshot, 0);
  assert.equal(alone, null, 'a mention alone says nothing');
  const cards = { content: '', embeds: (NEWS_ITEM.message as { embeds: unknown[] }).embeds };
  const carded = announcement({ ...NEWS_ITEM, ping: 'none', message: cards }, snapshot, 0);
  assert.equal(carded && 'content' in carded, false, 'embeds alone carry no empty words');
  assert.deepEqual(channelsOf(NEWS_ITEM), [TEXT_CHANNEL, NEWS], 'each channel once');
});

test('announcements: each falls due once in every channel it names, a stale one is skipped, a refusal is told', async () => {
  const bot = await standCommunity({ announce: { messages: [NEWS_ITEM] } }, [announceModule]);
  let reads = 0;
  const counting = { ...bot.context, snapshot: (guildId: string) => (reads++, bot.context.snapshot(guildId)) };
  bot.clock.now = Date.UTC(2026, 10, 18, 11, 0);
  await announceModule.minute?.(counting);
  assert.equal(reads, 0, 'nothing is built while nothing is due');
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 5);
  await announceModule.minute?.(counting);
  await announceModule.minute?.(counting);
  assert.deepEqual([bot.posts(TEXT_CHANNEL).length, bot.posts(NEWS).length], [1, 1], 'sent once for the day, in each');
  assert.equal(reads, 1, 'built when due, and not again once sent');
  assert.deepEqual(titlesOf(bot.posts(NEWS)[0]), ['v2', 'Fixes']);
  bot.clock.now = Date.UTC(2026, 10, 19, 13, 0);
  await announceModule.minute?.(bot.context);
  assert.equal(bot.posts(TEXT_CHANNEL).length, 1, 'an hour late is skipped');
  const send = sendOf(bot);
  assert.deepEqual(await send('news', [NEWS_ITEM]), { ok: true, message: 'Sent in 2 channels.' });
  assert.equal((await send('none', [NEWS_ITEM])).ok, false);
  bot.world.closed.add(NEWS);
  const half = 'Sent in 1 of 2 channels. The bot could not post in the rest.';
  assert.deepEqual(await send('news', [NEWS_ITEM]), { ok: false, message: half });
  bot.world.closed.add(TEXT_CHANNEL);
  const none = { ok: false, message: 'The bot could not post in those channels.' };
  assert.deepEqual(await send('news', [NEWS_ITEM]), none);
  const quiet = { ok: false, message: 'It has nothing to say yet.' };
  assert.deepEqual(await send('news', [{ ...NEWS_ITEM, message: words('') }]), quiet);
  const nowhere = { ok: false, message: 'Choose its channels first.' };
  assert.deepEqual(await send('news', [{ ...NEWS_ITEM, channels: [] }]), nowhere);
});

test('announcements: set to edit, the second send changes the first post; a post deleted is posted afresh', async () => {
  const bot = await standCommunity({ announce: { messages: [EDITED] } }, [announceModule]);
  const send = sendOf(bot);
  assert.deepEqual(await send('rules', [EDITED]), { ok: true, message: 'Sent.' });
  const [first] = bot.posts(TEXT_CHANNEL);
  const changed = { ...EDITED, message: words('Rule one, and two') };
  assert.deepEqual(await send('rules', [changed]), { ok: true, message: 'Updated.' });
  assert.equal(bot.posts(TEXT_CHANNEL).length, 1, 'no second post');
  const edit = bot.world.edits.at(-1);
  const cleared = [edit?.id, edit?.content, edit?.components];
  assert.deepEqual(cleared, [first?.id, 'Rule one, and two', []], 'an edit clears what the message no longer has');
  bot.world.deleted.add(String(first?.id));
  assert.deepEqual(await send('rules', [EDITED]), { ok: true, message: 'Sent.' });
  assert.equal(bot.posts(TEXT_CHANNEL).length, 2);
  const kept = bot.database.raw.prepare('SELECT message_id FROM announce_posts').get() as { message_id: string };
  assert.equal(kept.message_id, bot.posts(TEXT_CHANNEL)[1]?.id, 'the new post is the one edited next');
  assert.deepEqual(await send('rules', [{ ...EDITED, mode: 'new' }]), { ok: true, message: 'Sent.' });
  assert.equal(bot.posts(TEXT_CHANNEL).length, 3, 'set to post, it posts');
});

test('announcements: an edit refused by an outage posts no second copy; only a post that is gone is posted anew', async () => {
  const bot = await standCommunity({ announce: { messages: [EDITED] } }, [announceModule]);
  const send = sendOf(bot);
  await send('rules', [EDITED]);
  bot.world.editsDown = true;
  const none = { ok: false, message: 'The bot could not post in those channels.' };
  assert.deepEqual(await send('rules', [EDITED]), none);
  assert.equal(bot.posts(TEXT_CHANNEL).length, 1, 'no second copy while Discord is down');
  bot.world.editsDown = false;
  assert.deepEqual(await send('rules', [EDITED]), { ok: true, message: 'Updated.' });
});

test('announcements: a save forgets the posts of announcements renamed, no longer edited, or moved', async () => {
  const bot = await standCommunity({ announce: { messages: [EDITED] } }, [announceModule]);
  await sendOf(bot)('rules', [EDITED]);
  const rows = () =>
    (bot.database.raw.prepare('SELECT name FROM announce_posts').all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
  assert.deepEqual(rows(), ['rules']);
  await announceModule.saved?.(bot.context, GUILD, { messages: [EDITED] }, true);
  assert.deepEqual(rows(), ['rules'], 'kept while it still edits there');
  await announceModule.saved?.(bot.context, GUILD, { messages: [{ ...EDITED, name: 'server-rules' }] }, true);
  assert.deepEqual(rows(), [], "a rename forgets the old name's post");
});

test("announcements: one saved for another server's channel is never sent; the bot reads back only its own", async () => {
  const theirs = '800000000000000031';
  const item = { ...RULES, ping: 'everyone' as const, repeat: 'hourly' as const, at: '12:05' };
  const bot = await standCommunity({ announce: { messages: [item] } }, [announceModule]);
  // written straight into the store, as a save could have before the panel refused another server's channel
  bot.database.raw
    .prepare(
      "UPDATE guild_config SET config = json_set(config, '$.messages[0].channels[0]', ?) WHERE module = 'announce'",
    )
    .run(theirs);
  bot.dispatcher.forget(GUILD, 'announce');
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 6);
  await announceModule.minute?.(bot.context);
  assert.equal(bot.posts(theirs).length, 0);
  const read = (await bot.settingsOf('announce')).messages as Announcement[];
  assert.deepEqual(read[0]?.channels, []);
});
