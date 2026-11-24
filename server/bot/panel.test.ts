import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetStarts } from './auth.ts';
import {
  ADMIN_ROLE,
  BOT_ROLE,
  GUILD,
  MEMBER,
  MOD,
  MOD_ROLE,
  ORIGIN,
  OWNER,
  TEXT_CHANNEL,
  type StoodWorker,
  bodyOf,
  freshDatabase,
  guildWithRanks,
  panelRequest,
  signInPanel,
  standWorker,
} from './botForTests.ts';
import type { ServerModule } from './modules/module.ts';
import { MEMBER_KEEP_MS, MEMBER_STALE_MS, levelIn, resetMembers } from './panel.ts';
import type { Rest, RestResult } from './rest.ts';

beforeEach(() => {
  resetStarts();
  resetMembers();
});

const THEIRS = '800000000000000031';
const CORE = { panelGrants: [{ role: MOD_ROLE, level: 'manager' }], problemsChannel: '', accent: '#8a5a2b' };

/** A polls module whose act and table say what reached them. */
const polls = (heard: unknown[] = []): ServerModule => ({
  id: 'polls',
  actions: {
    start: async (_context, _guildId, input, actor) => {
      heard.push({ input, actor: actor.id });
      return { ok: true, message: 'Started.' };
    },
  },
});

const configOf = async (bot: StoodWorker, token: string, moduleId: string) =>
  (await bodyOf(await bot.call(panelRequest(token, `/v1/panel/g/${GUILD}/m/${moduleId}`)))).config as Record<
    string,
    unknown
  >;
const save = (bot: StoodWorker, token: string, moduleId: string, config: unknown, rev: number, enabled = true) =>
  bot.call(
    panelRequest(token, `/v1/panel/g/${GUILD}/m/${moduleId}`, {
      method: 'PUT',
      body: JSON.stringify({ config, rev, enabled }),
    }),
  );

test("panel: without a session every route is 401; CORS names the panel's origin only", async () => {
  const bot = await standWorker();
  const answer = await bot.call(panelRequest('x'.repeat(43), '/v1/panel/me'));
  assert.equal(answer.status, 401);
  assert.equal(answer.headers.get('access-control-allow-origin'), ORIGIN);
  const other = await bot.call(
    new Request('https://bot.test/v1/panel/me', { headers: { origin: 'https://evil.example' } }),
  );
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const local = { method: 'OPTIONS', headers: { origin: 'http://localhost:5174' } };
  const before = await bot.call(new Request('https://bot.test/v1/panel/me', local));
  assert.equal(before.status, 204);
  assert.equal(before.headers.get('access-control-allow-origin'), 'http://localhost:5174');
});

test('panel: a moderator sees the server and the modules their level allows; a plain member sees nothing', async () => {
  const bot = await standWorker();
  const mod = await signInPanel(bot, MOD);
  const mine = await bodyOf(await bot.call(panelRequest(mod, '/v1/panel/me')));
  assert.deepEqual(
    (mine.guilds as Array<{ id: string; level: string }>).map((guild) => [guild.id, guild.level]),
    [[GUILD, 'moderator']],
  );
  assert.equal(mine.owner, false);
  const overview = await bodyOf(await bot.call(panelRequest(mod, `/v1/panel/g/${GUILD}`)));
  assert.equal(overview.level, 'moderator');
  assert.equal((overview.gateway as { state: string }).state, 'ready');
  assert.ok(!(overview.modules as Array<{ id: string }>).some((shape) => shape.id === 'core'), 'core needs manager');
  assert.ok((overview.channels as Array<{ name: string }>).some((channel) => channel.name === 'general'));
  const member = await signInPanel(bot, MEMBER);
  assert.deepEqual((await bodyOf(await bot.call(panelRequest(member, '/v1/panel/me')))).guilds, []);
  assert.equal((await bot.call(panelRequest(member, `/v1/panel/g/${GUILD}`))).status, 403);
  assert.equal((await bot.call(panelRequest(mod, '/v1/panel/g/900000000000000777'))).status, 404, 'not a server');
});

test('panel: the owner saves core; a stale save is refused; a bad one names its fields; each save is audited', async () => {
  const bot = await standWorker();
  const owner = await signInPanel(bot, OWNER);
  const read = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/m/core`)));
  assert.deepEqual([read.rev, read.canEdit], [0, true]);
  const config = { ...(read.config as object), panelGrants: [{ role: MOD_ROLE, level: 'manager' }] };
  const put = await save(bot, owner, 'core', config, 0);
  assert.deepEqual([put.status, (await bodyOf(put)).rev], [200, 1]);
  assert.deepEqual(bot.gateway.asked.at(-1), { path: '/config', body: { guildId: GUILD, module: 'core' } });
  const stale = await save(bot, owner, 'core', config, 0);
  assert.deepEqual([stale.status, (await bodyOf(stale)).rev], [409, 1]);
  const bad = await save(bot, owner, 'core', { accent: 'red' }, 1);
  assert.equal(bad.status, 400);
  assert.deepEqual(
    ((await bodyOf(bad)).errors as Array<{ path: string }>).map((error) => error.path),
    ['accent'],
  );
  const log = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/audit`)));
  const entries = log.entries as Array<{ action: string; target: string; detail: { changed: string[] } }>;
  assert.equal(entries.length, 1);
  assert.deepEqual(
    [entries[0]?.action, entries[0]?.target, entries[0]?.detail.changed],
    ['module.save', 'core', ['panelGrants']],
  );
  const turned = await save(bot, owner, 'polls', {}, 0, true);
  assert.equal(turned.status, 200);
  const latest = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/audit`)));
  assert.equal((latest.entries as Array<{ action: string }>)[0]?.action, 'module.on');
});

test("panel: a grant takes effect on the next read once the member's roles are asked again", async () => {
  const bot = await standWorker();
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  assert.equal((await bodyOf(await bot.call(panelRequest(mod, `/v1/panel/g/${GUILD}`)))).level, 'manager');
  assert.equal((await save(bot, mod, 'core', CORE, 1)).status, 403, "core stays the owner's to change");
});

test("panel: a role named in the settings is held to Discord's rule for giving it", async () => {
  const bot = await standWorker();
  await bot.dispatcher.dispatch('GUILD_CREATE', guildWithRanks());
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  const welcome = await configOf(bot, owner, 'welcome');
  const saveRoles = (who: string, joinRoles: string[], rev: number, extra = {}) =>
    save(bot, who, 'welcome', { ...welcome, ...extra, joinRoles }, rev);
  // a manager by grant holds no Manage Roles: they may not hand out any role, even one below their own
  const refused = await saveRoles(mod, [MOD_ROLE], 0);
  const said = await bodyOf(refused);
  assert.deepEqual([refused.status, said.error, said.role], [403, 'role', MOD_ROLE]);
  assert.match(String((await bodyOf(await saveRoles(owner, [BOT_ROLE], 0))).message), /belongs to Discord or an app/);
  assert.match(String((await bodyOf(await saveRoles(owner, ['900000000000000777'], 0))).message), /not in the server/);
  assert.equal((await saveRoles(owner, [ADMIN_ROLE], 0)).status, 200);
  assert.equal((await saveRoles(mod, [ADMIN_ROLE], 1, { delayMinutes: 5 })).status, 200, 'named before: not asked');
  const moved = await saveRoles(mod, [], 2, { botRoles: [ADMIN_ROLE] });
  assert.deepEqual([moved.status, (await bodyOf(moved)).role], [403, ADMIN_ROLE], 'moved elsewhere: asked');
  const levels = await configOf(bot, owner, 'levels');
  const saveLevels = (who: string, change: object, rev: number) =>
    save(bot, who, 'levels', { ...levels, ...change }, rev);
  assert.equal((await saveLevels(owner, { noXpRoles: [ADMIN_ROLE] }, 0)).status, 200);
  const reward = await saveLevels(mod, { noXpRoles: [ADMIN_ROLE], rewards: [{ level: 1, role: ADMIN_ROLE }] }, 1);
  assert.deepEqual([reward.status, (await bodyOf(reward)).role], [403, ADMIN_ROLE], 'not made a reward by a manager');
  assert.equal((await saveLevels(mod, { noXpRoles: [ADMIN_ROLE], cooldownSeconds: 90 }, 1)).status, 200);
  assert.equal((await saveLevels(owner, { noXpRoles: [], rewards: [{ level: 50, role: ADMIN_ROLE }] }, 2)).status, 200);
  const lowered = await saveLevels(mod, { noXpRoles: [], rewards: [{ level: 1, role: ADMIN_ROLE }] }, 3);
  assert.deepEqual([lowered.status, (await bodyOf(lowered)).role], [403, ADMIN_ROLE], 'a reward moved lower is asked');
});

test("panel: a mention of everyone needs Discord's Mention Everyone; one the owner set is kept", async () => {
  const bot = await standWorker();
  await bot.dispatcher.dispatch('GUILD_CREATE', guildWithRanks());
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  const base = await configOf(bot, owner, 'announce');
  const item = { name: 'rules', channels: [], message: { content: 'Read the rules.', embeds: [] }, role: '' };
  const announce = (who: string, ping: string, rev: number, extra = {}) =>
    save(bot, who, 'announce', { ...base, messages: [{ ...item, ...extra, ping }] }, rev);
  const loud = await announce(mod, 'everyone', 0);
  assert.deepEqual([loud.status, (await bodyOf(loud)).error], [403, 'everyone']);
  assert.equal((await announce(owner, 'everyone', 0)).status, 200);
  const again = { message: { content: 'Read the rules again.', embeds: [] } };
  assert.equal((await announce(mod, 'everyone', 1, again)).status, 200, 'one the owner set is kept');
});

test('panel: a channel from another server is refused on a save and in an act, and one saved before is never read back', async () => {
  const heard: unknown[] = [];
  const bot = await standWorker({ modules: [polls(heard)] });
  const owner = await signInPanel(bot, OWNER);
  const welcome = await configOf(bot, owner, 'welcome');
  const refused = await save(bot, owner, 'welcome', { ...welcome, joinChannel: THEIRS }, 0);
  const said = await bodyOf(refused);
  assert.deepEqual([refused.status, said.error, said.channel], [403, 'channel', THEIRS]);
  assert.equal((await save(bot, owner, 'welcome', { ...welcome, joinChannel: TEXT_CHANNEL }, 0)).status, 200);
  await save(bot, owner, 'polls', {}, 0);
  const act = (channel: string) =>
    bot.call(
      panelRequest(owner, `/v1/panel/g/${GUILD}/m/polls/a/start`, {
        method: 'POST',
        body: JSON.stringify({ input: { channel, question: 'Which?', answers: 'A\nB', hours: 24, many: false } }),
      }),
    );
  const foreign = await act(THEIRS);
  assert.deepEqual([foreign.status, (await bodyOf(foreign)).error], [403, 'channel']);
  assert.deepEqual(heard, [], 'the act never ran');
  assert.deepEqual(await bodyOf(await act(TEXT_CHANNEL)), { ok: true, message: 'Started.' });
  assert.equal(heard.length, 1);
  bot.database.raw
    .prepare("UPDATE guild_config SET config = json_set(config, '$.joinChannel', ?) WHERE module = 'welcome'")
    .run(THEIRS);
  assert.equal((await configOf(bot, owner, 'welcome')).joinChannel, '');
});

test('panel: an act needs its level and its Discord permission, and its module on; a table needs its level', async () => {
  const heard: unknown[] = [];
  const board: ServerModule = {
    id: 'invites',
    views: { top: async (_context, guildId) => ({ rows: [{ inviter: guildId, joins: 3 }] }) },
  };
  const bot = await standWorker({ modules: [polls(heard), board] });
  const owner = await signInPanel(bot, OWNER);
  const member = await signInPanel(bot, MEMBER);
  const act = (who: string) =>
    bot.call(
      panelRequest(who, `/v1/panel/g/${GUILD}/m/polls/a/start`, {
        method: 'POST',
        body: JSON.stringify({ input: { question: 'Which?', answers: 'A\nB' } }),
      }),
    );
  const off = await act(owner);
  assert.deepEqual([off.status, (await bodyOf(off)).error], [409, 'module-off']);
  await save(bot, owner, 'polls', {}, 0);
  assert.equal((await act(owner)).status, 200);
  assert.equal((await act(member)).status, 403, 'no level');
  // a grant gives a level, never a permission: a poll still needs Manage Messages
  const helpers = '900000000000000023';
  const role = { id: helpers, name: 'Helpers', position: 1, permissions: '0' };
  await bot.dispatcher.dispatch('GUILD_ROLE_CREATE', { guild_id: GUILD, role });
  const granted = await save(bot, owner, 'core', { ...CORE, panelGrants: [{ role: helpers, level: 'moderator' }] }, 0);
  assert.equal(granted.status, 200);
  bot.discord.members.set(MEMBER, [helpers]);
  resetMembers();
  const lacking = await act(member);
  assert.deepEqual([lacking.status, (await bodyOf(lacking)).error], [403, 'permission']);
  bot.discord.members.set(MEMBER, [helpers, MOD_ROLE]);
  resetMembers();
  assert.equal((await act(member)).status, 200, 'Moderators hold Manage Messages');
  assert.equal(heard.length, 2);
  const table = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/m/invites/v/top`)));
  assert.deepEqual(table, { rows: [{ inviter: GUILD, joins: 3 }] });
  assert.equal((await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/m/invites/v/none`))).status, 404);
});

test("panel: only the bot's owners restart the Gateway, and it is audited", async () => {
  const bot = await standWorker();
  const mod = await signInPanel(bot, MOD);
  const restart = { method: 'POST', body: '{"action":"restart"}' };
  assert.equal((await bot.call(panelRequest(mod, '/v1/panel/gateway', restart))).status, 403);
  const owner = await signInPanel(bot, OWNER);
  assert.equal((await bot.call(panelRequest(owner, '/v1/panel/gateway', restart))).status, 200);
  assert.equal(bot.gateway.asked.at(-1)?.path, '/restart');
  const log = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/audit`)));
  assert.equal((log.entries as Array<{ action: string }>)[0]?.action, 'gateway.restart');
});

test('panel: logout ends the session', async () => {
  const bot = await standWorker();
  const token = await signInPanel(bot, MOD);
  assert.equal((await bot.call(panelRequest(token, '/v1/auth/logout', { method: 'POST' }))).status, 200);
  assert.equal((await bot.call(panelRequest(token, '/v1/panel/me'))).status, 401);
});

test('panel: while Discord is away, roles read a little while ago stand in; older ones do not', async () => {
  let up = true;
  const answer = async (): Promise<RestResult> =>
    up
      ? { ok: true, status: 200, json: { roles: [] } }
      : { ok: false, status: 503, code: 0, down: true, retryAfterMs: 0, message: 'down' };
  const rest = { get: answer } as unknown as Rest;
  const context = { nowMs: 1_000_000, vars: {}, database: freshDatabase(), rest };
  const snapshot = { guildId: '900000000000000301', ownerId: '900000000000000302', roles: [] };
  assert.equal(await levelIn(context, snapshot, '900000000000000303'), 'none');
  up = false;
  context.nowMs += MEMBER_KEEP_MS + 1;
  assert.equal(await levelIn(context, snapshot, '900000000000000303'), 'none', 'a minute old: still stands');
  context.nowMs += MEMBER_STALE_MS;
  assert.equal(await levelIn(context, snapshot, '900000000000000303'), 'down', 'too old: Discord is away');
});
