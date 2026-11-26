import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { SESSION_IDLE_S, SESSION_MAX_S, STATE_COOKIE, STATE_KEEP_S, TICKET_KEEP_S, resetStarts } from './auth.ts';
import {
  GUILD,
  MOD,
  ORIGIN,
  OWNER,
  PANEL,
  bodyOf,
  countOf,
  exchangeRequest,
  panelRequest,
  signInPanel,
  standWorker,
  ticketFor,
} from './botForTests.ts';
import { commandsOf, writeCommands } from './commands.ts';
import type { ServerModule } from './modules/module.ts';
import { resetMembers } from './panel.ts';
import { registryOf } from './registry.ts';
import { createRest } from './rest.ts';
import { AUDIT_KEEP_S } from './store.ts';
import { BOT_VERSION, tick } from './worker.ts';

beforeEach(() => {
  resetStarts();
  resetMembers();
});

const start = (to = '/panel/') => new Request(`https://bot.test/v1/auth/discord?to=${encodeURIComponent(to)}`);
const stateOf = (answer: Response) => new URL(answer.headers.get('location') ?? '').searchParams.get('state') ?? '';
const backOf = (answer: Response) => new URL(answer.headers.get('location') ?? '');
/** Discord sending the browser back, which holds the state's cookie the start set (`held`: another's, or none). */
const callback = (state: string, query = 'code=goodcode00000', held: string | null = state) =>
  new Request(`https://bot.test/v1/auth/discord/callback?${query}&state=${state}`, {
    headers: held === null ? {} : { Cookie: `theme=dark; ${STATE_COOKIE}=${held}` },
  });

/** A module with a command and a button, which says what reached it. */
const greeter: ServerModule = {
  id: 'tags',
  commands: [{ name: 'tag', description: 'A tag' }],
  command: async () => ({ type: 4, data: { content: 'the command reached the module' } }),
  component: async (_context, _interaction, words) => ({ type: 4, data: { content: `pressed ${words.join(',')}` } }),
};

test('worker: health names the version, and the commit the deploy stamped on it', async () => {
  const bot = await standWorker();
  assert.deepEqual(await bodyOf(await bot.call(new Request('https://bot.test/health'))), {
    ok: true,
    version: BOT_VERSION,
    commit: '',
  });
  const stamped = await standWorker({ env: { BOT_COMMIT: 'abc123' } });
  assert.equal(
    ((await bodyOf(await stamped.call(new Request('https://bot.test/health')))) as { commit: string }).commit,
    'abc123',
  );
});

test("commands: the bot's own /panel and every module's, each name once", () => {
  const names = commandsOf(registryOf([greeter])).map((command) => command.name);
  assert.deepEqual(names, ['panel', 'tag']);
  const every = commandsOf().map((command) => command.name);
  assert.equal(every[0], 'panel');
  assert.ok(every.includes('ban'), "moderation's commands are deployed with the rest");
  assert.equal(new Set(every).size, every.length, 'no name twice across the modules');
});

test("commands: a deploy writes the whole list to the application, with the bot's token", async () => {
  const sent: { url: string; method: string; auth: string; body: unknown }[] = [];
  const rest = createRest({
    token: 'bot-token',
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      sent.push({
        url,
        method: String(init?.method),
        auth: String(headers.get('authorization')),
        body: JSON.parse(String(init?.body)),
      });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const answer = await writeCommands(rest, '1234', registryOf([greeter]));
  assert.ok(answer.ok);
  assert.deepEqual(
    sent.map(({ url, method, auth }) => ({ url, method, auth })),
    [{ url: 'https://discord.com/api/v10/applications/1234/commands', method: 'PUT', auth: 'Bot bot-token' }],
  );
  assert.deepEqual(sent[0]?.body, commandsOf(registryOf([greeter])));
});

test('interactions: a bad or stale signature is refused; a ping is answered; no key says it is not set up', async () => {
  const bot = await standWorker();
  assert.deepEqual(await bodyOf(await bot.call(await bot.keys.signed({ type: 1 }))), { type: 1 });
  const stale = await bot.keys.signed({ type: 1 }, { stamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal((await bot.call(stale)).status, 401);
  const forged = new Request('https://bot.test/v1/discord/interactions', {
    method: 'POST',
    headers: { 'x-signature-ed25519': 'ab'.repeat(64), 'x-signature-timestamp': String(Math.floor(Date.now() / 1000)) },
    body: '{"type":1}',
  });
  assert.equal((await bot.call(forged)).status, 401);
  const bare = await standWorker({ env: { DISCORD_PUBLIC_KEY: '' } });
  const answer = await bare.call(await bare.keys.signed({ type: 1 }));
  assert.deepEqual([answer.status, (await bodyOf(answer)).error], [503, 'not-set-up']);
});

test("interactions: /panel answers privately with a link to this server's panel, pinging no one", async () => {
  const bot = await standWorker();
  const body = await bodyOf(
    await bot.call(await bot.keys.signed({ type: 2, guild_id: GUILD, data: { name: 'panel' } })),
  );
  const data = body.data as {
    flags: number;
    allowed_mentions: unknown;
    components: Array<{ components: Array<{ url: string }> }>;
  };
  assert.equal(body.type, 4);
  assert.equal(data.flags, 64);
  assert.deepEqual(data.allowed_mentions, { parse: [] });
  assert.equal(data.components[0]?.components[0]?.url, `${PANEL}#g=${GUILD}`);
  const unset = await standWorker({ env: { PANEL_URL: '' } });
  const said = await bodyOf(
    await unset.call(await unset.keys.signed({ type: 2, guild_id: GUILD, data: { name: 'panel' } })),
  );
  assert.equal((said.data as { content: string }).content, 'The panel is not set up yet.');
});

test("interactions: a module's command and buttons reach it only where it is on; anything else is not the bot's", async () => {
  const bot = await standWorker({ modules: [greeter] });
  const ask = async (interaction: unknown) =>
    ((await bodyOf(await bot.call(await bot.keys.signed(interaction)))).data as { content: string }).content;
  const command = { type: 2, guild_id: GUILD, data: { name: 'tag' } };
  const press = { type: 3, guild_id: GUILD, data: { custom_id: 'bot:tags:open:7' } };
  assert.match(await ask(command), /Tags is off in this server/);
  const turnedOn = await standWorker({ modules: [greeter] });
  turnedOn.database.raw
    .prepare("INSERT INTO guild_config (guild_id, module, config, enabled, updated_at) VALUES (?, 'tags', '{}', 1, 1)")
    .run(GUILD);
  const reached = async (interaction: unknown) =>
    ((await bodyOf(await turnedOn.call(await turnedOn.keys.signed(interaction)))).data as { content: string }).content;
  assert.equal(await reached(command), 'the command reached the module');
  assert.equal(await reached(press), 'pressed open,7', 'the words after the module id');
  for (const other of [
    { type: 2, guild_id: GUILD, data: { name: 'mod' } },
    { type: 3, guild_id: GUILD, data: { custom_id: 'safe:m30:0123456789abcdef' } },
    { type: 3, guild_id: GUILD, data: { custom_id: 'bot:nothing:x' } },
  ])
    assert.equal(await reached(other), 'That is not something this bot knows yet.');
});

test('sign-in: Discord is asked who the person is and which servers they are in, with PKCE, and sent back to the bot', async () => {
  const bot = await standWorker();
  const answer = await bot.call(start());
  assert.equal(answer.status, 302);
  const discord = backOf(answer);
  assert.equal(discord.origin + discord.pathname, 'https://discord.com/oauth2/authorize');
  assert.equal(discord.searchParams.get('scope'), 'identify guilds');
  assert.equal(discord.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(discord.searchParams.get('redirect_uri'), 'https://bot.test/v1/auth/discord/callback');
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM oauth_states'), 1);
});

test("sign-in: the whole flow ends in a panel token, of which only the hash is kept; Discord's token is revoked", async () => {
  const bot = await standWorker();
  const token = await signInPanel(bot);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(
    bot.discord.calls.some((call) => call.path === '/api/v10/oauth2/token/revoke'),
    'the token was revoked',
  );
  assert.match(bot.discord.calls.find((call) => call.path === '/api/v10/oauth2/token')?.body ?? '', /code_verifier=/);
  const stored = bot.database.raw.prepare('SELECT token_hash FROM panel_sessions').get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token, 'only the hash is kept');
});

test('sign-in: a ticket trades once and within two minutes; a state comes back within ten', async () => {
  const bot = await standWorker();
  const begun = Date.UTC(2026, 10, 15, 10, 0);
  const trade = async (ticket: string, afterS: number) =>
    (await bot.call(exchangeRequest(ticket), begun + afterS * 1000)).status;
  const ticket = await ticketFor(bot, MOD, begun);
  assert.equal(await trade(ticket, 1), 200);
  assert.equal(await trade(ticket, 2), 401, 'the same ticket a second time is refused');
  assert.equal(await trade(await ticketFor(bot, MOD, begun), TICKET_KEEP_S), 200, 'at two minutes it still trades');
  assert.equal(await trade(await ticketFor(bot, MOD, begun), TICKET_KEEP_S + 1), 401, 'past two minutes it does not');
  const late = stateOf(await bot.call(start(), begun));
  assert.equal(backOf(await bot.call(callback(late), begun + (STATE_KEEP_S + 1) * 1000)).hash, '#error=state');
  const inTime = stateOf(await bot.call(start(), begun));
  assert.match(backOf(await bot.call(callback(inTime), begun + STATE_KEEP_S * 1000)).hash, /^#ticket=/);
});

test("sign-in: a replayed state, a bad code, and Discord's refusal each come back to the panel as an error", async () => {
  const bot = await standWorker();
  const state = stateOf(await bot.call(start()));
  assert.equal(backOf(await bot.call(callback(state, 'code=badcodebadcode'))).hash, '#error=discord');
  assert.equal(backOf(await bot.call(callback(state))).hash, '#error=state');
  const second = stateOf(await bot.call(start()));
  assert.equal(backOf(await bot.call(callback(second, 'error=access_denied'))).hash, '#error=denied');
});

test("sign-in: the way back is a path on the panel's own site, never another site", async () => {
  const bot = await standWorker();
  for (const to of ['//evil.example/x', 'https://evil.example/', '/\\evil']) await bot.call(start(to));
  const kept = bot.database.raw.prepare('SELECT return_to FROM oauth_states').all() as Array<{ return_to: string }>;
  assert.deepEqual(
    kept.map((row) => row.return_to),
    ['/panel/', '/panel/', '/panel/'],
  );
});

test("sign-in: a page on another of the panel's sites gets its sign-in back there; a look-alike does not", async () => {
  const site = 'https://www.noshores.online/panel/';
  const bot = await standWorker({ env: { PANEL_ORIGINS: `${ORIGIN},https://www.noshores.online` } });
  const back = backOf(await bot.call(callback(stateOf(await bot.call(start(site))))));
  assert.equal(`${back.origin}${back.pathname}`, site, 'the ticket goes to the site the sign-in started on');
  assert.match(back.hash, /^#ticket=[A-Za-z0-9_-]{43}$/);
  const refused = backOf(await bot.call(callback(stateOf(await bot.call(start(site))), 'error=access_denied')));
  assert.equal(refused.toString(), `${site}#error=denied`, 'a refusal goes back there too');
  for (const to of [
    'https://www.noshores.online.evil.example/panel/',
    'http://www.noshores.online/panel/',
    'https://someone:pw@www.noshores.online/panel/',
    'https://www.noshores.online/panel/?next=//evil.example',
    'https://www.noshores.online/panel/#x',
    'https://www.noshores.online/pa%20nel/',
  ])
    await bot.call(start(to));
  const kept = bot.database.raw.prepare('SELECT return_to FROM oauth_states').all() as Array<{ return_to: string }>;
  assert.deepEqual(
    kept.map((row) => row.return_to),
    Array(6).fill('/panel/'),
  );
  const off = await standWorker({
    env: { PANEL_ORIGINS: `${ORIGIN},https://www.noshores.online`, DISCORD_CLIENT_SECRET: '' },
  });
  const said = await off.call(start(site));
  assert.equal(said.headers.get('location'), `${site}#error=login-off`, 'a sign-in that cannot start says so');
});

test('sign-in: with no client secret or no application id, the panel is told sign-in is off', async () => {
  for (const env of [{ DISCORD_CLIENT_SECRET: '' }, { DISCORD_APPLICATION_ID: '' }]) {
    const bot = await standWorker({ env });
    assert.equal(backOf(await bot.call(start())).hash, '#error=login-off');
  }
});

test('sign-in: a callback reached in a browser that did not start it is refused, as a link sent to sign someone in', async () => {
  const bot = await standWorker();
  const started = await bot.call(start());
  const state = stateOf(started);
  assert.match(started.headers.get('set-cookie') ?? '', new RegExp(`^${STATE_COOKIE}=${state};.*HttpOnly`));
  assert.equal(backOf(await bot.call(callback(state, undefined, null))).hash, '#error=state', 'no cookie');
  const other = stateOf(await bot.call(start()));
  const refused = await bot.call(callback(state, undefined, other));
  assert.equal(backOf(refused).hash, '#error=state', "another's");
  assert.equal(refused.headers.get('set-cookie'), null, "a newer sign-in's state is left standing");
  const back = await bot.call(callback(state));
  assert.match(backOf(back).hash, /^#ticket=/, 'its own browser signs in');
  assert.match(back.headers.get('set-cookie') ?? '', new RegExp(`^${STATE_COOKIE}=;.*Max-Age=0`), 'and lets it go');
});

test('sign-in: ten starts a minute from one address, then the panel is told to wait', async () => {
  const bot = await standWorker();
  const from = () =>
    new Request('https://bot.test/v1/auth/discord?to=/panel/', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
  for (let i = 0; i < 10; i++) assert.equal(backOf(await bot.call(from())).origin, 'https://discord.com');
  assert.equal(backOf(await bot.call(from())).hash, '#error=rate');
});

test('clock: each minute makes sure of the Gateway and runs every module; minute 17 sweeps old sign-ins', async () => {
  const ran: string[] = [];
  const modules: ServerModule[] = [
    { id: 'polls', minute: async () => void ran.push('polls') },
    {
      id: 'tags',
      minute: async () => {
        throw new Error('a broken minute');
      },
    },
    { id: 'stats', minute: async () => void ran.push('stats') },
  ];
  const bot = await standWorker();
  bot.database.raw
    .prepare("INSERT INTO oauth_states (state_hash, verifier, return_to, created_at) VALUES ('h', 'v', '/panel/', 1)")
    .run();
  const over = { fetch: bot.discord.fetch, registry: registryOf(modules) };
  await tick(bot.env, Date.UTC(2026, 10, 15, 10, 16), bot.execution, over);
  assert.equal(bot.gateway.asked.at(-1)?.path, '/ensure');
  assert.deepEqual(ran, ['polls', 'stats'], 'one that throws stops no other');
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM oauth_states'), 1);
  await tick(bot.env, Date.UTC(2026, 10, 15, 10, 17), bot.execution, over);
  assert.deepEqual(
    bot.gateway.asked.slice(-2).map((asked) => asked.path),
    ['/ensure', '/sweep'],
  );
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM oauth_states'), 0);
});

test('clock: the sweep takes lapsed sessions, stale tickets and sign-ins, and old audit rows; fresh ones stay', async () => {
  const bot = await standWorker();
  const nowMs = Date.UTC(2026, 10, 15, 10, 17);
  const nowS = nowMs / 1000;
  const raw = bot.database.raw;
  const session = raw.prepare(
    'INSERT INTO panel_sessions (token_hash, user_id, user, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
  );
  session.run('idle', MOD, '{}', nowS - SESSION_IDLE_S - 60, nowS - SESSION_IDLE_S - 60);
  session.run('too old', MOD, '{}', nowS - SESSION_MAX_S - 60, nowS - 60);
  session.run('fresh', MOD, '{}', nowS - SESSION_MAX_S + 60, nowS - SESSION_IDLE_S + 60);
  const ticket = raw.prepare('INSERT INTO panel_tickets (ticket_hash, user_id, user, created_at) VALUES (?, ?, ?, ?)');
  ticket.run('stale', MOD, '{}', nowS - TICKET_KEEP_S - 60);
  ticket.run('fresh', MOD, '{}', nowS - TICKET_KEEP_S + 60);
  const state = raw.prepare(
    "INSERT INTO oauth_states (state_hash, verifier, return_to, created_at) VALUES (?, 'v', '/panel/', ?)",
  );
  state.run('stale', nowS - STATE_KEEP_S - 60);
  state.run('fresh', nowS - STATE_KEEP_S + 60);
  const entry = raw.prepare(
    "INSERT INTO audit_log (guild_id, at, actor_id, source, action) VALUES (?, ?, ?, 'panel', ?)",
  );
  entry.run(GUILD, nowS - AUDIT_KEEP_S - 60, OWNER, 'old');
  entry.run(GUILD, nowS - AUDIT_KEEP_S + 60, OWNER, 'fresh');
  await tick(bot.env, nowMs, bot.execution, { fetch: bot.discord.fetch, registry: registryOf([]) });
  const left = (sql: string) => (raw.prepare(sql).all() as Array<{ kept: string }>).map((row) => row.kept);
  assert.deepEqual(left('SELECT token_hash AS kept FROM panel_sessions'), ['fresh'], 'idle a week, or a month in all');
  assert.deepEqual(left('SELECT ticket_hash AS kept FROM panel_tickets'), ['fresh']);
  assert.deepEqual(left('SELECT state_hash AS kept FROM oauth_states'), ['fresh']);
  assert.deepEqual(left('SELECT action AS kept FROM audit_log'), ['fresh']);
});

test("worker: a module's own public route answers before the panel's", async () => {
  const board: ServerModule = {
    id: 'levels',
    fetch: async (_context, _request, url) => (url.pathname === '/v1/public/board' ? new Response('the board') : null),
  };
  const bot = await standWorker({ modules: [board] });
  assert.equal(await (await bot.call(new Request('https://bot.test/v1/public/board'))).text(), 'the board');
  assert.equal((await bot.call(new Request('https://bot.test/v1/public/other'))).status, 404);
});

test('sign-in: a session lapses after a week unseen or a month in all; each use within a week keeps it', async () => {
  const bot = await standWorker();
  const token = await signInPanel(bot);
  const day = 86_400_000;
  const now = Date.now();
  const ask = (when: number) => bot.call(panelRequest(token, '/v1/panel/me'), when);
  assert.equal((await ask(now + 6 * day)).status, 200);
  assert.equal((await ask(now + 12 * day)).status, 200, 'seen six days ago: still kept');
  assert.equal((await ask(now + 18 * day)).status, 200);
  assert.equal((await ask(now + 24 * day)).status, 200);
  assert.equal((await ask(now + 30 * day + 60_000)).status, 401, 'a month in all, however often it was used');
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM panel_sessions'), 0, 'and it is gone');
  const idle = await signInPanel(bot);
  assert.equal((await bot.call(panelRequest(idle, '/v1/panel/me'), now + 7 * day + 60_000)).status, 401);
});

test("worker: a module's route never takes over the sign-in's or the panel's", async () => {
  const greedy: ServerModule = { id: 'levels', fetch: async () => new Response('taken') };
  const bot = await standWorker({ modules: [greedy] });
  assert.equal((await bot.call(new Request('https://bot.test/v1/panel/me'))).status, 401);
  assert.equal((await bot.call(start())).status, 302);
});
