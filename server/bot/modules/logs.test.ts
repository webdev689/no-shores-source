import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILD, LOG_CHANNEL, MOD_ROLE, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import type { Settings } from '../law/settings.ts';
import { ALERTS, standSafetyGateway } from './safetyForTests.ts';

const author = (id: string) => ({ id, username: `user${id.slice(-2)}` });
const message = (id: string, content: string, extra: Settings = {}) => ({
  id,
  guild_id: GUILD,
  channel_id: TEXT_CHANNEL,
  author: author(TARGET),
  member: { roles: [] },
  content,
  attachments: [],
  ...extra,
});
type Card = { title: string; description: string; fields?: { name: string; value: string }[] };
const cardsIn = (bot: Awaited<ReturnType<typeof standSafetyGateway>>, channel: string) =>
  bot.discord.postsTo(channel).map((post) => (post.embeds as Card[])[0]);

test('logs: an edit shows the words before and after; a deletion shows the words and files the message had', async () => {
  const bot = await standSafetyGateway({ logs: { messageChannel: LOG_CHANNEL } });
  const first = message('100000000000000001', 'first words', { attachments: [{ url: 'https://cdn.example/x.png' }] });
  await bot.send('MESSAGE_CREATE', first);
  const edit = { id: '100000000000000001', guild_id: GUILD, channel_id: TEXT_CHANNEL, author: author(TARGET) };
  await bot.send('MESSAGE_UPDATE', { ...edit, content: 'second words' });
  const [edited] = cardsIn(bot, LOG_CHANNEL);
  assert.equal(edited?.title, 'Message edited');
  assert.deepEqual(
    edited?.fields?.map((field) => field.value),
    ['first words', 'second words'],
  );
  await bot.send('MESSAGE_DELETE', { id: '100000000000000001', guild_id: GUILD, channel_id: TEXT_CHANNEL });
  const gone = cardsIn(bot, LOG_CHANNEL)[1];
  assert.equal(gone?.title, 'Message deleted');
  assert.deepEqual(
    gone?.fields?.map((field) => field.value),
    ['second words', 'https://cdn.example/x.png'],
  );
  assert.equal(bot.cache.getMessage('100000000000000001'), null, 'a deleted message leaves the cache');
  await bot.send('MESSAGE_DELETE', { id: '100000000000000009', guild_id: GUILD, channel_id: TEXT_CHANNEL });
  assert.match(cardsIn(bot, LOG_CHANNEL)[2]?.description ?? '', /did not see this message/);
});

test('logs: words are kept only where logs are on, and an ignored channel is never logged', async () => {
  const off = await standSafetyGateway({});
  await off.send('MESSAGE_CREATE', message('100000000000000001', 'private'));
  assert.equal(off.cache.getMessage('100000000000000001'), null);
  const bot = await standSafetyGateway({ logs: { messageChannel: LOG_CHANNEL, ignoreChannels: [TEXT_CHANNEL] } });
  await bot.send('MESSAGE_CREATE', message('100000000000000001', 'a'));
  const where = { id: '100000000000000001', guild_id: GUILD, channel_id: TEXT_CHANNEL };
  await bot.send('MESSAGE_UPDATE', { ...where, content: 'b', author: author(TARGET) });
  await bot.send('MESSAGE_DELETE', where);
  await bot.send('MESSAGE_DELETE_BULK', { ids: [where.id], guild_id: GUILD, channel_id: TEXT_CHANNEL });
  assert.deepEqual(bot.discord.postsTo(LOG_CHANNEL), []);
});

test('logs: a bulk deletion lists the words the bot saw', async () => {
  const bot = await standSafetyGateway({ logs: { messageChannel: LOG_CHANNEL } });
  await bot.send('MESSAGE_CREATE', message('100000000000000001', 'one'));
  await bot.send('MESSAGE_CREATE', message('100000000000000002', 'two'));
  const ids = ['100000000000000001', '100000000000000002', '100000000000000003'];
  await bot.send('MESSAGE_DELETE_BULK', { ids, guild_id: GUILD, channel_id: TEXT_CHANNEL });
  const [card] = cardsIn(bot, LOG_CHANNEL);
  assert.equal(card?.title, '3 messages deleted at once');
  assert.match(card?.description ?? '', /\*\*user12\*\*: one\n\*\*user12\*\*: two/);
});

test('logs: joins with account age, role and nickname changes, leaves with roles, and voice moves', async () => {
  const bot = await standSafetyGateway({ logs: { memberChannel: LOG_CHANNEL, voiceChannel: ALERTS } });
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(TARGET), roles: [] });
  assert.equal(cardsIn(bot, LOG_CHANNEL)[0]?.title, 'Member joined');
  assert.equal(cardsIn(bot, LOG_CHANNEL)[0]?.fields?.[0]?.name, 'Account age');
  await bot.send('GUILD_MEMBER_UPDATE', { guild_id: GUILD, user: author(TARGET), roles: [MOD_ROLE], nick: 'Newname' });
  assert.deepEqual(
    cardsIn(bot, LOG_CHANNEL)[1]?.fields?.map((field) => field.name),
    ['Nickname', 'Roles given'],
  );
  await bot.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: author(TARGET) });
  assert.equal(cardsIn(bot, LOG_CHANNEL)[2]?.fields?.[0]?.value, `<@&${MOD_ROLE}>`);
  const voice = (channel: string | null) =>
    bot.send('VOICE_STATE_UPDATE', {
      guild_id: GUILD,
      user_id: TARGET,
      channel_id: channel,
      member: { user: author(TARGET) },
    });
  await voice('900000000000000060');
  await voice('900000000000000061');
  await voice(null);
  assert.deepEqual(
    cardsIn(bot, ALERTS).map((card) => card?.description.replace(/user12 \(\d+\) /, '')),
    [
      'joined <#900000000000000060>.',
      'moved from <#900000000000000060> to <#900000000000000061>.',
      'left <#900000000000000061>.',
    ],
  );
});

test('logs: bans, channels and roles made or deleted go to the server channel', async () => {
  const bot = await standSafetyGateway({ logs: { serverChannel: LOG_CHANNEL } });
  await bot.send('GUILD_BAN_ADD', { guild_id: GUILD, user: author(TARGET) });
  await bot.send('GUILD_BAN_REMOVE', { guild_id: GUILD, user: author(TARGET) });
  await bot.send('CHANNEL_CREATE', { guild_id: GUILD, id: '900000000000000070', name: 'new-room', type: 0 });
  await bot.send('CHANNEL_DELETE', { guild_id: GUILD, id: '900000000000000070', name: 'new-room', type: 0 });
  const role = { id: '900000000000000071', name: 'Crew', color: 0, position: 1, permissions: '0' };
  await bot.send('GUILD_ROLE_CREATE', { guild_id: GUILD, role });
  await bot.send('GUILD_ROLE_DELETE', { guild_id: GUILD, role_id: role.id });
  assert.deepEqual(
    cardsIn(bot, LOG_CHANNEL).map((card) => card?.title),
    ['Member banned', 'Member unbanned', 'Channel made', 'Channel deleted', 'Role made', 'Role deleted'],
  );
});
