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
  guildCreate,
  guildWithRanks,
  panelRequest,
  signInPanel,
  standWorker,
} from './botForTests.ts';
import type { ServerModule } from './modules/module.ts';
import { MEMBER_KEEP_MS, MEMBER_STALE_MS, levelIn, resetMembers } from './panel.ts';
import type { Rest, RestResult } from './rest.ts';
import { LISTED_MAX } from './store.ts';

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
      : { ok: false, status: 503, code: 0, down: true, message: 'down' };
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

test("panel: a role a setting only names need only be the server's, even an app's; a mention keeps Discord's rule", async () => {
  const bot = await standWorker();
  await bot.dispatcher.dispatch('GUILD_CREATE', guildWithRanks());
  const open = '900000000000000024';
  const pings = { id: open, name: 'Pings', position: 1, permissions: '0', mentionable: true };
  await bot.dispatcher.dispatch('GUILD_ROLE_CREATE', { guild_id: GUILD, role: pings });
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  const levels = await configOf(bot, owner, 'levels');
  const boosted = { ...levels, boosts: [{ role: BOT_ROLE, percent: 50 }], noXpRoles: [BOT_ROLE] };
  assert.equal((await save(bot, owner, 'levels', boosted, 0)).status, 200, "an app's role can be matched");
  // a manager by grant holds no Manage Roles, yet may name a role above their own where it is only matched
  assert.equal((await save(bot, mod, 'levels', { ...levels, noXpRoles: [ADMIN_ROLE] }, 1)).status, 200);
  const gone = await save(bot, mod, 'levels', { ...levels, noXpRoles: ['900000000000000777'] }, 2);
  assert.deepEqual([gone.status, (await bodyOf(gone)).role], [403, '900000000000000777'], "still the server's own");
  const grants = { ...CORE, panelGrants: [...CORE.panelGrants, { role: BOT_ROLE, level: 'viewer' }] };
  assert.equal((await save(bot, owner, 'core', grants, 1)).status, 200);
  const tickets = await configOf(bot, owner, 'tickets');
  assert.equal((await save(bot, owner, 'tickets', { ...tickets, staffRoles: [BOT_ROLE] }, 0)).status, 200);
  // a ticket's channel opened to a role changes who sees it, which Discord leaves to Manage Roles
  const staff = await save(bot, mod, 'tickets', { ...tickets, staffRoles: [BOT_ROLE, MOD_ROLE] }, 1);
  assert.deepEqual([staff.status, (await bodyOf(staff)).role], [403, MOD_ROLE]);
  const everyone = await save(bot, owner, 'tickets', { ...tickets, staffRoles: [GUILD] }, 1);
  assert.match(String((await bodyOf(everyone)).message), /everyone role/, 'a ticket open to everyone is not');
  const base = await configOf(bot, owner, 'announce');
  const item = { name: 'rules', channels: [], message: { content: 'Read the rules.', embeds: [] } };
  const announce = (who: string, ping: string, role: string, rev: number) =>
    save(bot, who, 'announce', { ...base, messages: [{ ...item, ping, role }] }, rev);
  assert.equal((await announce(mod, 'role', open, 0)).status, 200, 'a role that lets anyone mention it');
  const closed = await announce(mod, 'role', ADMIN_ROLE, 1);
  const said = await bodyOf(closed);
  assert.deepEqual([closed.status, said.role], [403, ADMIN_ROLE]);
  assert.match(String(said.message), /Mention Everyone/);
  const nowhere = await announce(mod, 'none', '900000000000000777', 1);
  assert.deepEqual([nowhere.status, (await bodyOf(nowhere)).role], [403, '900000000000000777'], 'unmentioned: named');
  assert.equal((await announce(owner, 'none', ADMIN_ROLE, 1)).status, 200);
  const turned = await announce(mod, 'role', ADMIN_ROLE, 2);
  assert.deepEqual([turned.status, (await bodyOf(turned)).role], [403, ADMIN_ROLE], 'a kept role mentioned anew');
  const socials = await configOf(bot, owner, 'socials');
  const feed = (role: string) => ({ ...socials, feeds: [{ kind: 'rss', source: 'https://x.example/feed', role }] });
  assert.equal((await save(bot, mod, 'socials', feed(open), 0)).status, 200);
  assert.equal((await save(bot, mod, 'socials', feed(ADMIN_ROLE), 1)).status, 403, "a feed's mention too");
});

test('panel: whether a role lets anyone mention it is asked of Discord, so a snapshot that does not say still lets it', async () => {
  const open = '900000000000000024';
  const pings = { id: open, name: 'Pings', color: 0, position: 1, permissions: '0', managed: false, mentionable: true };
  const roles = [...(guildWithRanks().roles as object[]), pings];
  const bot = await standWorker({ routes: { [`GET /api/v10/guilds/${GUILD}/roles`]: () => [200, roles] } });
  await bot.dispatcher.dispatch('GUILD_CREATE', guildCreate({ roles }));
  // a snapshot written before roles were kept with whether they may be mentioned
  const unsaid = JSON.stringify(roles.map((role) => ({ ...role, mentionable: undefined })));
  bot.database.raw.prepare('UPDATE guild_snapshot SET roles = ? WHERE guild_id = ?').run(unsaid, GUILD);
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  const base = await configOf(bot, owner, 'announce');
  const item = { name: 'rules', channels: [], message: { content: 'Read the rules.', embeds: [] }, ping: 'role' };
  const saved = await save(bot, mod, 'announce', { ...base, messages: [{ ...item, role: open }] }, 0);
  assert.equal(saved.status, 200);
});

test('panel: a save against any revision but the one there is answered stale before its roles are weighed', async () => {
  const bot = await standWorker();
  await bot.dispatcher.dispatch('GUILD_CREATE', guildWithRanks());
  const owner = await signInPanel(bot, OWNER);
  const mod = await signInPanel(bot, MOD);
  await save(bot, owner, 'core', CORE, 0);
  const welcome = await configOf(bot, owner, 'welcome');
  assert.equal((await save(bot, owner, 'welcome', { ...welcome, joinRoles: [ADMIN_ROLE] }, 0)).status, 200);
  const ahead = await save(bot, mod, 'welcome', { ...welcome, joinRoles: [ADMIN_ROLE] }, 2);
  assert.deepEqual([ahead.status, (await bodyOf(ahead)).rev], [409, 1], 'a revision not yet made');
  const behind = await save(bot, mod, 'welcome', { ...welcome, joinRoles: [MOD_ROLE] }, 0);
  assert.deepEqual([behind.status, (await bodyOf(behind)).error], [409, 'stale']);
});

test('panel: a save without its settings is refused, not saved as every default', async () => {
  const bot = await standWorker();
  const owner = await signInPanel(bot, OWNER);
  assert.equal((await save(bot, owner, 'core', CORE, 0)).status, 200);
  const bare = { method: 'PUT', body: JSON.stringify({ rev: 1, enabled: true }) };
  assert.equal((await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/m/core`, bare))).status, 400);
  assert.deepEqual((await configOf(bot, owner, 'core')).panelGrants, CORE.panelGrants);
});

test('panel: without the bot token, a server says the bot is not set up, not that Discord is away', async () => {
  const bot = await standWorker({ env: { DISCORD_BOT_TOKEN: '' } });
  const mod = await signInPanel(bot, MOD);
  const answer = await bot.call(panelRequest(mod, `/v1/panel/g/${GUILD}`));
  const said = await bodyOf(answer);
  assert.deepEqual([answer.status, said.error], [503, 'not-set-up']);
  assert.match(String(said.message), /DISCORD_BOT_TOKEN/);
  const owner = await signInPanel(bot, OWNER);
  assert.equal((await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}`))).status, 200, "the bot's owners need none");
});

test('panel: the audit log pages by a row number, and refuses anything else', async () => {
  const bot = await standWorker();
  const owner = await signInPanel(bot, OWNER);
  await save(bot, owner, 'core', CORE, 0);
  const page = (before: string) => bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/audit?before=${before}`));
  for (const before of ['1e999', 'Infinity', '-1', '2.5', 'abc'])
    assert.equal((await page(before)).status, 400, before);
  const entriesOf = async (before: string) => ((await bodyOf(await page(before))).entries as unknown[]).length;
  assert.deepEqual([await entriesOf('999'), await entriesOf('1'), await entriesOf('')], [1, 0, 1]);
});

/** A rig with more servers than the panel weighs, every one named to sort before the rig's own. */
async function manyServers(guildsKnown: boolean) {
  const bot = await standWorker();
  if (!guildsKnown) bot.discord.world.guilds = null;
  const mod = await signInPanel(bot, MOD);
  let reads = 0;
  const prepare = bot.database.prepare;
  bot.database.prepare = (sql) => ((reads += 1), prepare(sql));
  const listing = async () => {
    reads = 0;
    resetMembers();
    const asked = bot.discord.calls.length;
    const mine = await bodyOf(await bot.call(panelRequest(mod, '/v1/panel/me')));
    const lookups = bot.discord.calls.slice(asked).filter((call) => call.path.includes('/members/')).length;
    return { reads, lookups, guilds: mine.guilds };
  };
  const one = await listing();
  const others = bot.database.raw.prepare(
    "INSERT INTO guild_snapshot (guild_id, name, owner_id, updated_at) VALUES (?, 'Aardvark Bay', ?, 1)",
  );
  for (let i = 0; i < LISTED_MAX + 10; i++) others.run(String(910000000000000000n + BigInt(i)), OWNER);
  return { one, many: await listing() };
}

test("panel: a person's list holds the servers Discord says they are in, read in one go, however many the bot is in", async () => {
  const { one, many } = await manyServers(true);
  assert.deepEqual(many.guilds, one.guilds, 'their own server, though fifty others sort before it');
  assert.equal(many.reads, one.reads, 'the reads do not grow with the bot’s servers');
  assert.equal(many.lookups, 1, 'Discord is asked about their server alone');
});

test("panel: where Discord gave no list of a person's servers, the panel weighs the bot's first servers by name", async () => {
  const { many } = await manyServers(false);
  assert.equal(many.lookups, LISTED_MAX);
});
