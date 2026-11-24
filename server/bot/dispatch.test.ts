import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GUILD,
  LOG_CHANNEL,
  MOD_ROLE,
  TARGET,
  TEXT_CHANNEL,
  freshDatabase,
  guildCreate,
  standGateway,
} from './botForTests.ts';
import { createDispatcher } from './dispatch.ts';
import type { EventData, ServerModule } from './modules/module.ts';

const author = { id: TARGET, username: 'user12' };
const message = (id: string, content: string, extra: EventData = {}): EventData => ({
  id,
  guild_id: GUILD,
  channel_id: TEXT_CHANNEL,
  author,
  content,
  attachments: [],
  ...extra,
});
const stored = (held: ReturnType<typeof freshDatabase>) =>
  held.raw.prepare('SELECT * FROM guild_snapshot').get() as Record<string, string | number>;

test('dispatch: the snapshot follows roles, channels, members and the bot leaving', async () => {
  const database = freshDatabase();
  const dispatcher = createDispatcher({ database, now: Date.now });
  await dispatcher.dispatch('GUILD_CREATE', guildCreate());
  await dispatcher.dispatch('GUILD_ROLE_CREATE', { guild_id: GUILD, role: { id: '900000000000000040', name: 'New' } });
  await dispatcher.dispatch('CHANNEL_CREATE', { guild_id: GUILD, id: '900000000000000041', name: 'news', type: 5 });
  await dispatcher.dispatch('CHANNEL_CREATE', {
    guild_id: GUILD,
    id: '900000000000000042',
    name: 'a thread',
    type: 11,
  });
  await dispatcher.dispatch('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: '5' } });
  await dispatcher.flush();
  await dispatcher.dispatch('GUILD_DELETE', { id: GUILD, unavailable: true });
  // a fresh object, as after an eviction, reads the stored copy as its base
  const fresh = createDispatcher({ database, now: Date.now });
  await fresh.dispatch('GUILD_ROLE_DELETE', { guild_id: GUILD, role_id: MOD_ROLE });
  const row = stored(database);
  const names = (list: unknown) =>
    (JSON.parse(String(list)) as Array<{ name: string }>).map((each) => each.name).sort();
  assert.deepEqual(names(row.roles), ['@everyone', 'New']);
  assert.deepEqual(names(row.channels), ['general', 'mod-log', 'news'], 'threads are never kept');
  assert.equal(row.member_count, 4);
  assert.equal(row.present, 1, 'an outage is not the bot leaving');
  await fresh.dispatch('GUILD_DELETE', { id: GUILD });
  assert.equal(stored(database).present, 0);
});

test('dispatch: READY names every server the bot is in, so one it left while the Gateway was down reads as gone', async () => {
  const database = freshDatabase();
  const dispatcher = createDispatcher({ database, now: Date.now });
  const left = '900000000000000050';
  const leftLater = '900000000000000051';
  for (const [id, name] of [
    [GUILD, 'Harbour'],
    [left, 'Left'],
    [leftLater, 'Left later'],
  ])
    await dispatcher.dispatch('GUILD_CREATE', guildCreate({ id, name }));
  const readyIn = (ids: string[]) => ({ guilds: ids.map((id) => ({ id, unavailable: true })) });
  const presence = () =>
    Object.fromEntries(
      (
        database.raw.prepare('SELECT guild_id, present FROM guild_snapshot').all() as Array<Record<string, unknown>>
      ).map((row) => [String(row.guild_id), row.present]),
    );
  // the same object after a stop and a start, its copies still in memory
  await dispatcher.dispatch('READY', readyIn([GUILD, leftLater]));
  assert.deepEqual(presence(), { [GUILD]: 1, [left]: 0, [leftLater]: 1 });
  assert.equal((await dispatcher.snapshot(left))?.present, false, 'the copy in memory reads as gone too');
  // a fresh object, as after an eviction, knows only the stored copies
  const fresh = createDispatcher({ database, now: Date.now });
  await fresh.dispatch('READY', readyIn([GUILD]));
  assert.deepEqual(presence(), { [GUILD]: 1, [left]: 0, [leftLater]: 0 });
  await fresh.dispatch('READY', {});
  assert.deepEqual(presence(), { [GUILD]: 1, [left]: 0, [leftLater]: 0 }, 'a READY with no list changes nothing');
});

test("dispatch: a join or a leave moves the count in memory, written at most once a minute and by the alarm's flush", async () => {
  const database = freshDatabase();
  const clock = { now: Date.now() };
  const dispatcher = createDispatcher({ database, now: () => clock.now });
  await dispatcher.dispatch('GUILD_CREATE', guildCreate());
  for (let i = 0; i < 5; i++)
    await dispatcher.dispatch('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: String(100 + i) } });
  assert.equal(stored(database).member_count, 3, 'five joins within the minute wrote nothing');
  assert.equal((await dispatcher.snapshot(GUILD))?.memberCount, 8, 'the count in memory is current');
  await dispatcher.flush();
  assert.equal(stored(database).member_count, 8);
  clock.now += 61_000;
  await dispatcher.dispatch('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: { id: '100' } });
  assert.equal(stored(database).member_count, 7, 'a minute on, the next change is written at once');
});

test("dispatch: the server's own emoji come with GUILD_CREATE, follow its updates, and only usable ones are kept", async () => {
  const database = freshDatabase();
  const dispatcher = createDispatcher({ database, now: Date.now });
  const emojis = [
    { id: '900000000000000077', name: 'sail', animated: false },
    { id: '900000000000000078', name: 'gone', available: false },
    { name: '😀' },
  ];
  await dispatcher.dispatch('GUILD_CREATE', guildCreate({ emojis }));
  const emojiOf = async () => (await dispatcher.snapshot(GUILD))?.emojis;
  assert.deepEqual(await emojiOf(), [{ id: '900000000000000077', name: 'sail', animated: false }]);
  await dispatcher.dispatch('GUILD_EMOJIS_UPDATE', {
    guild_id: GUILD,
    emojis: [{ id: '900000000000000079', name: 'spin', animated: true }],
  });
  assert.deepEqual(await emojiOf(), [{ id: '900000000000000079', name: 'spin', animated: true }]);
  await dispatcher.dispatch('GUILD_UPDATE', {
    id: GUILD,
    name: 'Harbour',
    emojis: [{ id: '900000000000000080', name: 'new' }],
  });
  assert.deepEqual(
    (await emojiOf())?.map((emoji) => emoji.id),
    ['900000000000000080'],
    'a server update carries them',
  );
});

test("dispatch: a message's words are kept only where logs are on, and an edit or a deletion carries what it was", async () => {
  const off = await standGateway({});
  await off.send('MESSAGE_CREATE', message('100000000000000001', 'private'));
  assert.equal(off.cache.getMessage('100000000000000001'), null, 'chat is not stored where no one asked for it');
  const seen: EventData[] = [];
  const watcher: ServerModule = {
    id: 'logs',
    events: {
      MESSAGE_UPDATE: async (_context, data) => void seen.push(data),
      MESSAGE_DELETE: async (_context, data) => void seen.push(data),
    },
  };
  const bot = await standGateway({ logs: { messageChannel: LOG_CHANNEL } }, [watcher]);
  await bot.send(
    'MESSAGE_CREATE',
    message('100000000000000001', 'first words', { attachments: [{ url: 'https://cdn/x.png' }] }),
  );
  await bot.send('MESSAGE_UPDATE', { id: '100000000000000001', guild_id: GUILD, content: 'second words' });
  assert.equal((seen[0]?.previous as { content: string }).content, 'first words', 'the edit carries the words before');
  await bot.send('MESSAGE_DELETE', { id: '100000000000000001', guild_id: GUILD });
  assert.deepEqual(seen[1]?.previous, {
    id: '100000000000000001',
    guildId: GUILD,
    channelId: TEXT_CHANNEL,
    authorId: TARGET,
    author: 'user12',
    content: 'second words',
    files: ['https://cdn/x.png'],
    at: bot.clock.now,
  });
  assert.equal(bot.cache.getMessage('100000000000000001'), null, 'a deleted message leaves the cache');
  await bot.send('MESSAGE_DELETE', { id: '100000000000000009', guild_id: GUILD });
  assert.equal(seen[2]?.previous, null, 'a message the bot did not see carries nothing');
});

test('dispatch: a member change carries the nickname and roles before; a voice move carries the seat before', async () => {
  const seen: EventData[] = [];
  const watcher: ServerModule = {
    id: 'logs',
    events: {
      GUILD_MEMBER_UPDATE: async (_context, data) => void seen.push(data),
      GUILD_MEMBER_REMOVE: async (_context, data) => void seen.push(data),
      VOICE_STATE_UPDATE: async (_context, data) => void seen.push(data),
    },
  };
  const bot = await standGateway({ logs: {} }, [watcher]);
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author, roles: [] });
  await bot.send('GUILD_MEMBER_UPDATE', { guild_id: GUILD, user: author, roles: [MOD_ROLE], nick: 'Newname' });
  await bot.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: author });
  assert.deepEqual(seen[0]?.previous, { nick: '', roles: [] });
  assert.deepEqual(seen[1]?.previous, { nick: 'Newname', roles: [MOD_ROLE] });
  const voice = (channel: string | null) =>
    bot.send('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: TARGET, channel_id: channel });
  await voice('900000000000000060');
  bot.clock.now += 5_000;
  await voice('900000000000000061');
  await voice(null);
  const seats = seen.slice(2).map((data) => (data.previous as { channelId: string } | null)?.channelId ?? null);
  assert.deepEqual(seats, [null, '900000000000000060', '900000000000000061']);
  assert.equal(bot.cache.getVoice(GUILD, TARGET), null);
});

test('dispatch: a module hears its events only where it is on, with its settings; one that throws stops no other', async () => {
  const heard: string[] = [];
  const modules: ServerModule[] = [
    {
      id: 'welcome',
      events: {
        GUILD_MEMBER_ADD: async () => {
          throw new Error('a broken handler');
        },
      },
    },
    {
      id: 'antiraid',
      events: {
        GUILD_MEMBER_ADD: async (_context, _data, config) => void heard.push(`antiraid ${String(config.joinCount)}`),
      },
    },
    { id: 'invites', events: { GUILD_MEMBER_ADD: async () => void heard.push('invites') } },
  ];
  const bot = await standGateway({ welcome: {}, antiraid: { joinCount: 5 } }, modules);
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author, roles: [] });
  assert.deepEqual(heard, ['antiraid 5'], 'invites is off here');
  assert.ok(
    bot.lines.some((line) => line.includes('GUILD_MEMBER_ADD handler failed')),
    'the throw is logged',
  );
  await bot.send('GUILD_MEMBER_ADD', { user: author });
  assert.deepEqual(heard, ['antiraid 5'], 'an event of no server reaches no module');
});
