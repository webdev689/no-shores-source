import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD, MOD_ROLE, TARGET, countOf } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { BOT_ID, interactionFrom, standEngagement } from './engagementForTests.ts';
import { ticketOverwrites, ticketsModule, transcript } from './tickets.ts';

const LOGS = '900000000000000071';
const OTHER = '900000000000000013';
type Stood = Awaited<ReturnType<typeof standEngagement>>;

const lastAnswer = (bot: Stood) => String(recordOf(bot.world.state.edits.at(-1)).content);
const press = async (bot: Stood, userId: string, words: string[], roles: string[] = [], channelId?: string) => {
  const config = await bot.configOf('tickets');
  const pressed = interactionFrom(userId, { roles, customId: `bot:tickets:${words.join(':')}`, channelId });
  await ticketsModule.component?.(bot.context, pressed, words, config);
  await bot.settle();
};

test('tickets: hidden from everyone, open to the member, staff and the bot', () => {
  const over = ticketOverwrites(GUILD, TARGET, [MOD_ROLE], BOT_ID);
  assert.deepEqual(
    over.map((each) => [each.id, each.allow === '0' ? 'deny' : 'allow']),
    [
      [GUILD, 'deny'],
      [TARGET, 'allow'],
      [MOD_ROLE, 'allow'],
      [BOT_ID, 'allow'],
    ],
  );
});

test('tickets: a private channel for the member, one at a time, closed by them or staff with a transcript', async () => {
  const bot = await standEngagement({ tickets: { staffRoles: [MOD_ROLE], logChannel: LOGS, maxOpen: 1 } }, [
    ticketsModule,
  ]);
  await press(bot, TARGET, ['open']);
  const ticket = recordOf(bot.database.raw.prepare('SELECT * FROM tickets').get());
  const channelId = String(ticket.channel_id);
  assert.equal(bot.world.state.channels.get(channelId)?.name, 'ticket-1');
  assert.match(lastAnswer(bot), /Your ticket is open/);
  assert.match(String(bot.world.posts(channelId)[0]?.content), new RegExp(`Hello <@${TARGET}>`));
  await press(bot, TARGET, ['open']);
  assert.match(lastAnswer(bot), /open already/);
  await press(bot, OTHER, ['close'], [], channelId);
  assert.match(lastAnswer(bot), /Only the member who opened it/);
  await press(bot, MOD, ['close'], [MOD_ROLE], channelId);
  const posted = bot.world.state.calls.some(
    (call) => call.method === 'POST' && call.path === `/channels/${LOGS}/messages`,
  );
  assert.ok(posted, 'a transcript was posted');
  assert.ok(bot.world.state.gone.includes(channelId));
  assert.equal(recordOf(bot.database.raw.prepare('SELECT closed_by FROM tickets').get()).closed_by, MOD);
  const listed = await ticketsModule.views?.open?.(bot.context, GUILD, new URLSearchParams());
  assert.equal(recordOf(listed?.rows[0]).state, 'Closed');
});

test('tickets: a double press opens one ticket', async () => {
  const bot = await standEngagement({ tickets: { maxOpen: 1 } }, [ticketsModule]);
  await Promise.all([press(bot, TARGET, ['open']), press(bot, TARGET, ['open'])]);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM tickets'), 1);
});

test('tickets: only staff add a member, and only inside an open ticket', async () => {
  const bot = await standEngagement({ tickets: { staffRoles: [MOD_ROLE] } }, [ticketsModule]);
  await press(bot, TARGET, ['open']);
  const channelId = String(recordOf(bot.database.raw.prepare('SELECT channel_id FROM tickets').get()).channel_id);
  const config = await bot.configOf('tickets');
  const add = (userId: string, roles: string[], inside: string) =>
    ticketsModule.command?.(
      bot.context,
      interactionFrom(userId, {
        name: 'ticket',
        roles,
        channelId: inside,
        options: [{ type: 1, name: 'add', options: [{ type: 6, name: 'member', value: OTHER }] }],
      }),
      config,
    );
  assert.match(String((await add(MOD, [MOD_ROLE], '900000000000000077'))?.data?.content), /inside an open ticket/);
  assert.match(String((await add(TARGET, [], channelId))?.data?.content), /Only staff/);
  assert.match(String((await add(MOD, [MOD_ROLE], channelId))?.data?.content), /can see this ticket now/);
  const put = bot.world.state.calls.find(
    (call) => call.method === 'PUT' && call.path.endsWith(`/permissions/${OTHER}`),
  );
  assert.equal(recordOf(put?.body).type, 1);
});

test('tickets: a transcript is every message, oldest first, paged back past the first hundred', async () => {
  const bot = await standEngagement({ tickets: {} }, [ticketsModule]);
  const ROOM = '900000000000000075';
  const said = (index: number) => ({
    id: String(500 + index),
    timestamp: `t${index}`,
    author: { username: `u${index}` },
    content: `line ${index}`,
    attachments: index === 0 ? [{ url: 'https://cdn.example/a.png' }] : [],
  });
  // Discord lists newest first: 101 messages, a full page then one more
  const newestFirst = Array.from({ length: 101 }, (unused, index) => said(100 - index));
  let pages = 0;
  bot.world.state.extra = [
    [
      'GET',
      new RegExp(`^/channels/${ROOM}/messages$`),
      () => Response.json(pages++ ? newestFirst.slice(100) : newestFirst.slice(0, 100)),
    ],
  ];
  const lines = String(await transcript(bot.context, ROOM)).split('\n');
  assert.equal(pages, 2);
  assert.equal(lines.length, 101);
  assert.equal(lines[0], '[t0] u0: line 0 [https://cdn.example/a.png]');
  assert.equal(lines.at(-1), '[t100] u100: line 100');
});

test('tickets: two presses of Close at once post one transcript', async () => {
  const bot = await standEngagement({ tickets: { logChannel: LOGS } }, [ticketsModule]);
  await press(bot, TARGET, ['open']);
  const channelId = String(recordOf(bot.database.raw.prepare('SELECT channel_id FROM tickets').get()).channel_id);
  await Promise.all([press(bot, TARGET, ['close'], [], channelId), press(bot, TARGET, ['close'], [], channelId)]);
  const posted = bot.world.state.calls.filter(
    (call) => call.method === 'POST' && call.path === `/channels/${LOGS}/messages`,
  );
  assert.equal(posted.length, 1);
});

test('tickets: a ticket whose channel was deleted by hand is closed, so its member can open another', async () => {
  const bot = await standEngagement({ tickets: { maxOpen: 1 } }, [ticketsModule]);
  const openChannel = () =>
    String(recordOf(bot.database.raw.prepare('SELECT channel_id FROM tickets WHERE closed_at = 0').get()).channel_id);
  await press(bot, TARGET, ['open']);
  await bot.send('CHANNEL_DELETE', { guild_id: GUILD, id: openChannel(), type: 0 });
  await press(bot, TARGET, ['open']);
  assert.match(lastAnswer(bot), /Your ticket is open/, 'the deletion the bot heard closed the first');
  // deleted while the bot heard nothing: Discord no longer knows the channel
  bot.world.state.gone.push(openChannel());
  await press(bot, TARGET, ['open']);
  assert.match(lastAnswer(bot), /Your ticket is open/, 'a channel Discord says is gone is not counted');
  await press(bot, TARGET, ['open']);
  assert.match(lastAnswer(bot), /open already/, 'a channel still there is');
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM tickets WHERE closed_at = 0'), 1);
});

test('tickets: a transcript that cannot be read or posted keeps the ticket and its channel, and says why', async () => {
  const bot = await standEngagement({ tickets: { logChannel: LOGS } }, [ticketsModule]);
  await press(bot, TARGET, ['open']);
  const channelId = String(recordOf(bot.database.raw.prepare('SELECT channel_id FROM tickets').get()).channel_id);
  const refused = () => Response.json({ code: 50013, message: 'Missing Permissions' }, { status: 403 });
  bot.world.state.extra = [['POST', new RegExp(`^/channels/${LOGS}/messages$`), refused]];
  await press(bot, TARGET, ['close'], [], channelId);
  assert.match(lastAnswer(bot), new RegExp(`could not post the transcript in <#${LOGS}>`));
  bot.world.state.extra = [['GET', new RegExp(`^/channels/${channelId}/messages$`), refused]];
  await press(bot, TARGET, ['close'], [], channelId);
  assert.match(lastAnswer(bot), /could not read this ticket/);
  assert.equal(bot.world.state.gone.includes(channelId), false, 'the channel is kept');
  bot.world.state.extra = [];
  await press(bot, TARGET, ['close'], [], channelId);
  assert.equal(lastAnswer(bot), 'Closed.', 'it is still open, and closes once the transcript can be posted');
  assert.ok(bot.world.state.gone.includes(channelId));
});
