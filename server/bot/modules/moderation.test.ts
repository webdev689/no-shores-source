import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_ROLE,
  BOT_ROLE,
  GUILD,
  LOG_CHANNEL,
  MEMBER,
  MOD,
  OWNER,
  TARGET,
  TEXT_CHANNEL,
  bodyOf,
  panelRequest,
} from '../botForTests.ts';
import { REGISTRY } from '../registry.ts';
import { MODERATION_COMMANDS } from './moderation.ts';
import { slash, standSafetyWorker } from './safetyForTests.ts';

const ALL = String((1n << 53n) - 1n);
const member = (userId: string) => ({ type: 6, name: 'member', value: userId });
const text = (name: string, value: string) => ({ type: 3, name, value });
const withLog = { logChannel: LOG_CHANNEL };

test('moderation: the commands are declared once, each behind its Discord permission, and deployed with the rest', () => {
  const names = MODERATION_COMMANDS.map((command) => command.name);
  for (const name of [
    'warn',
    'timeout',
    'untimeout',
    'kick',
    'ban',
    'unban',
    'note',
    'cases',
    'unwarn',
    'purge',
    'slowmode',
    'lock',
    'unlock',
  ])
    assert.ok(names.includes(name), name);
  for (const command of MODERATION_COMMANDS) assert.match(command.default_member_permissions, /^\d+$/);
  assert.equal(REGISTRY.commandOwner('ban')?.id, 'moderation');
});

test('moderation: a warning is answered after a deferral, numbered, told to the member and posted in the log', async () => {
  const bot = await standSafetyWorker(withLog);
  const { body, said } = await bot.ask(slash(MOD, 'warn', [member(TARGET), text('reason', 'spam')]));
  assert.deepEqual([body.type, (body.data as { flags: number }).flags], [5, 64]);
  assert.match(said, /target was warned\. Case 1\./);
  const [row] = bot.cases();
  assert.deepEqual(
    [row?.case_no, row?.action, row?.user_id, row?.mod_id, row?.reason, row?.active],
    [1, 'warn', TARGET, MOD, 'spam', 1],
  );
  assert.equal(bot.discord.state.dms[0]?.to, TARGET);
  const [log] = bot.discord.postsTo(LOG_CHANNEL);
  assert.equal((log?.embeds as { title: string }[])[0]?.title, 'Case 1 | Warning');
  assert.deepEqual(log?.allowed_mentions, { parse: [] });
});

test("moderation: Discord's own permission is checked, not only the command's look", async () => {
  const bot = await standSafetyWorker();
  const { said } = await bot.ask(slash(MEMBER, 'warn', [member(TARGET)], { permissions: '0', roles: [] }));
  assert.match(said, /lack the Discord permission/);
  assert.equal(bot.cases().length, 0);
});

test("moderation: no one acts on the owner, themselves, or a member at or above their highest role or the bot's", async () => {
  const bot = await standSafetyWorker();
  assert.match((await bot.ask(slash(MOD, 'warn', [member(OWNER)]))).said, /server owner/);
  assert.match((await bot.ask(slash(MOD, 'warn', [member(MOD)]))).said, /yourself/);
  bot.discord.state.members.set(TARGET, [ADMIN_ROLE]);
  assert.match((await bot.ask(slash(MOD, 'warn', [member(TARGET)]))).said, /not below yours/);
  const asOwner = slash(OWNER, 'kick', [member(TARGET)], { permissions: ALL, roles: [] });
  assert.match((await bot.ask(asOwner)).said, /not below the bot's/);
  assert.equal(bot.cases().length, 0);
});

test('moderation: the automatic step runs at its count of warnings, as the bot', async () => {
  const bot = await standSafetyWorker({ steps: [{ warnings: 2, action: 'timeout', minutes: 60 }] });
  await bot.ask(slash(MOD, 'warn', [member(TARGET)]));
  assert.equal(bot.discord.state.timeouts.has(TARGET), false);
  await bot.ask(slash(MOD, 'warn', [member(TARGET)]));
  const until = Date.parse(String(bot.discord.state.timeouts.get(TARGET)));
  assert.ok(Math.abs(until - Date.now() - 3_600_000) < 60_000, 'an hour from now');
  assert.deepEqual(
    bot.cases().map((row) => [row.action, row.mod_name]),
    [
      ['warn', 'user10'],
      ['warn', 'user10'],
      ['timeout', 'The bot'],
    ],
  );
});

test("moderation: a removed warning stops counting toward the steps; cases are a moderator's to read", async () => {
  const bot = await standSafetyWorker({ steps: [{ warnings: 2, action: 'kick', minutes: 0 }] });
  await bot.ask(slash(MOD, 'warn', [member(TARGET)]));
  assert.match((await bot.ask(slash(MOD, 'unwarn', [{ type: 4, name: 'case', value: 1 }]))).said, /Warning 1 removed/);
  await bot.ask(slash(MOD, 'warn', [member(TARGET)]));
  assert.ok(bot.discord.state.members.has(TARGET), 'one counting warning is not two');
  const { said } = await bot.ask(slash(MOD, 'cases', [member(TARGET)]));
  assert.match(said, /#2 Warning/);
  assert.match(said, /#1 Warning \(cleared\)/);
  // a server that opened the command to everyone in its own settings still shows a record to moderators alone
  const open = await bot.ask(slash(MOD, 'cases', [member(TARGET)], { permissions: '0', roles: [] }));
  assert.match(open.said, /lack the Discord permission/);
  assert.doesNotMatch(open.said, /Warning/);
});

const ban = (...options: object[]) =>
  slash(OWNER, 'ban', [member(TARGET), ...options] as never, { permissions: ALL, roles: [] });

test('moderation: a temporary ban ends on the clock, with a case of its own', async () => {
  const bot = await standSafetyWorker(withLog);
  assert.match((await bot.ask(ban(text('duration', '1d'), text('delete', '3600')))).said, /banned for 1 day/);
  assert.deepEqual(bot.discord.state.bans.get(TARGET), { delete_message_seconds: 3600 });
  await bot.clock(Date.now() + 3_600_000);
  assert.ok(bot.discord.state.bans.has(TARGET), 'not yet');
  await bot.clock(Date.now() + 2 * 86_400_000);
  assert.equal(bot.discord.state.bans.has(TARGET), false);
  assert.deepEqual(
    bot.cases().map((row) => [row.action, row.active]),
    [
      ['ban', 0],
      ['unban', 1],
    ],
  );
  const titles = bot.discord.postsTo(LOG_CHANNEL).map((post) => (post.embeds as { title: string }[])[0]?.title);
  assert.ok(titles.includes('Case 2 | Unban'));
});

test('moderation: a ban ends the ban cases before it, so an old time limit never lifts it', async () => {
  const bot = await standSafetyWorker();
  await bot.ask(ban(text('duration', '1d')));
  await bot.ask(ban());
  assert.deepEqual(
    bot.cases().map((row) => [row.action, row.active]),
    [
      ['ban', 0],
      ['ban', 1],
    ],
  );
  await bot.clock(Date.now() + 2 * 86_400_000);
  assert.ok(bot.discord.state.bans.has(TARGET), 'still banned, for good');
});

test('moderation: a member is told of a ban only once the bot holds Ban Members, and told again if Discord refuses', async () => {
  const bot = await standSafetyWorker();
  const botRole = (permissions: string) => ({
    id: BOT_ROLE,
    name: 'The bot',
    color: 0,
    position: 4,
    permissions,
    managed: true,
  });
  await bot.dispatcher.dispatch('GUILD_ROLE_UPDATE', { guild_id: GUILD, role: botRole('0') });
  assert.match((await bot.ask(ban())).said, /lacks the permission/);
  assert.equal(bot.discord.state.dms.length, 0, 'nothing reached the member');
  await bot.dispatcher.dispatch('GUILD_ROLE_UPDATE', { guild_id: GUILD, role: botRole(String(1n << 3n)) });
  const refused = () => Response.json({ code: 50013, message: 'Missing Permissions' }, { status: 403 });
  bot.discord.state.extra = [['PUT', /^\/guilds\/\d+\/bans\/\d+$/, refused]];
  assert.match((await bot.ask(ban())).said, /lacks the permission/);
  assert.equal(bot.discord.state.dms.length, 2);
  assert.match(JSON.stringify(bot.discord.state.dms.at(-1)), /Ignore the last message: you were not banned/);
  assert.equal(bot.cases().length, 0);
});

test('moderation: a temporary ban the bot cannot lift waits an hour, and does not hold the line for the rest', async () => {
  const bot = await standSafetyWorker();
  await bot.ask(ban(text('duration', '1d')));
  const refused = () => Response.json({ code: 50013, message: 'Missing Permissions' }, { status: 403 });
  bot.discord.state.extra = [['DELETE', /^\/guilds\/\d+\/bans\/\d+$/, refused]];
  const later = Date.now() + 2 * 86_400_000;
  await bot.clock(later);
  const [row] = bot.cases();
  assert.equal(row?.active, 1);
  assert.ok(Number(row?.expires_at) >= Math.floor(later / 1000) + 3500, 'pushed an hour on');
});

test('moderation: a time-out needs a duration within 28 days; a reason can be required', async () => {
  const bot = await standSafetyWorker({ requireReason: true });
  const timeout = (...options: object[]) => bot.ask(slash(MOD, 'timeout', [member(TARGET), ...options] as never));
  assert.match((await timeout(text('duration', '60d'), text('reason', 'x'))).said, /28 days/);
  assert.match((await timeout(text('duration', 'soon'), text('reason', 'x'))).said, /10m, 2h or 7d/);
  assert.match((await timeout(text('duration', '10m'))).said, /reason is required/);
  assert.match((await timeout(text('duration', '10m'), text('reason', 'calm down'))).said, /timed out for 10 minutes/);
});

test("moderation: purge deletes only young, unpinned messages, only the member's when named", async () => {
  const bot = await standSafetyWorker();
  const now = Date.now();
  const message = (id: string, author: string, ageMs: number, pinned = false) => ({
    id,
    author: { id: author },
    timestamp: new Date(now - ageMs).toISOString(),
    pinned,
  });
  bot.discord.state.messages.set(TEXT_CHANNEL, [
    message('100000000000000001', TARGET, 1000),
    message('100000000000000002', MEMBER, 2000),
    message('100000000000000003', TARGET, 3000, true),
    message('100000000000000004', TARGET, 4000),
    message('100000000000000005', TARGET, 20 * 86_400_000),
  ]);
  const count = { type: 4, name: 'count', value: 10 };
  const { said } = await bot.ask(slash(MOD, 'purge', [count, member(TARGET)], { permissions: String(1n << 13n) }));
  assert.match(said, /Deleted 2 messages/);
  assert.deepEqual(bot.discord.state.deleted, ['100000000000000001', '100000000000000004']);
});

test('moderation: lock takes sending from @everyone and keeps every other overwrite; unlock gives it back', async () => {
  const bot = await standSafetyWorker();
  const manage = { permissions: String(1n << 4n) };
  bot.discord.state.channels.set(TEXT_CHANNEL, {
    id: TEXT_CHANNEL,
    permission_overwrites: [{ id: GUILD, type: 0, allow: String(1 << 6), deny: '0' }],
  });
  const everyone = () =>
    (
      bot.discord.state.channels.get(TEXT_CHANNEL)?.permission_overwrites as {
        id: string;
        allow: string;
        deny: string;
      }[]
    ).find((over) => over.id === GUILD);
  const sendBits = (1n << 11n) | (1n << 38n);
  await bot.ask(slash(MOD, 'lock', [], manage));
  assert.equal(BigInt(everyone()?.deny ?? '0') & sendBits, sendBits);
  assert.equal(everyone()?.allow, String(1 << 6), 'the reactions it allowed stay allowed');
  await bot.ask(slash(MOD, 'unlock', [], manage));
  assert.equal(BigInt(everyone()?.deny ?? '0') & sendBits, 0n);
  const slow = await bot.ask(slash(MOD, 'slowmode', [{ type: 4, name: 'seconds', value: 30 }], manage));
  assert.match(slow.said, /30 seconds/);
  assert.equal(bot.discord.state.channels.get(TEXT_CHANNEL)?.rate_limit_per_user, 30);
});

test('moderation: with the module off, its commands say so and do nothing', async () => {
  const bot = await standSafetyWorker({}, false);
  assert.match((await bot.ask(slash(MOD, 'warn', [member(TARGET)]))).said, /Moderation is off in this server/);
  assert.equal(bot.cases().length, 0);
});

test('moderation panel: an act needs the Discord permission it names, not only the panel level; each is audited', async () => {
  const bot = await standSafetyWorker();
  const act = (token: string, id: string, input: object) =>
    bot.call(
      panelRequest(token, `/v1/panel/g/${GUILD}/m/moderation/a/${id}`, {
        method: 'POST',
        body: JSON.stringify({ input }),
      }),
    );
  const mod = await bot.signIn(MOD);
  const refused = await act(mod, 'ban', { user: TARGET, reason: 'x' });
  assert.deepEqual([refused.status, (await bodyOf(refused)).error], [403, 'permission']);
  assert.equal((await act(mod, 'warn', { user: 'nobody' })).status, 400);
  const warned = await act(mod, 'warn', { user: TARGET, reason: 'from the panel' });
  assert.equal(warned.status, 200);
  assert.match(String((await bodyOf(warned)).message), /warned\. Case 1/);
  const owner = await bot.signIn(OWNER);
  assert.equal((await act(owner, 'ban', { user: TARGET, duration: '', reason: 'done' })).status, 200);
  assert.ok(bot.discord.state.bans.has(TARGET));
  const read = async (path: string) => bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}${path}`)));
  const audit = (await read('/audit')).entries as { action: string }[];
  assert.deepEqual(
    audit.map((entry) => entry.action),
    ['moderation.ban', 'moderation.warn'],
    'refused before the act, nothing is logged',
  );
  const table = (await read('/m/moderation/v/cases')).rows as { action: string }[];
  assert.deepEqual(
    table.map((row) => row.action),
    ['Ban', 'Warning'],
  );
  assert.deepEqual((await read(`/m/moderation/v/cases?user=${MEMBER}`)).rows, []);
  assert.equal(((await read('/m/moderation/v/bans')).rows as unknown[]).length, 1);
});
