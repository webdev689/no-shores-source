// The bot stood up for the tests: a D1 over node:sqlite made by the bot's own migrations, a server the Gateway has
// seen, the Worker answering through a fake Discord, the panel's sign-in walked through, and the Gateway's side with
// its cache and modules.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { moduleOf } from './law/modules.ts';
import { referencedIds, validate } from './law/settings.ts';
import { createCache } from './cache.ts';
import { createDispatcher } from './dispatch.ts';
import { fakeBucket, fakeDiscord, fakeGateway, fakeSql, interactionKeys, type Route } from './discordForTests.ts';
import type { BotContext } from './kit.ts';
import type { ServerModule } from './modules/module.ts';
import { type Registry, moduleHandlers, registryOf } from './registry.ts';
import { createRest } from './rest.ts';
import { type Db, type Statement, writeConfig } from './store.ts';
import { type Env, type Execution, handle } from './worker.ts';

export const GUILD = '900000000000000001';
export const OWNER = '900000000000000002';
export const MOD = '900000000000000010';
export const MEMBER = '900000000000000011';
export const TARGET = '900000000000000012';
export const MOD_ROLE = '900000000000000020';
export const ADMIN_ROLE = '900000000000000021';
export const BOT_ROLE = '900000000000000022';
export const TEXT_CHANNEL = '900000000000000030';
export const LOG_CHANNEL = '900000000000000031';
export const APP_ID = '900000000000000099';
export const PANEL = 'https://noshores.online/panel/';
export const ORIGIN = 'https://noshores.online';

/** A fresh bot database, every migration applied in order, behind the part of D1 the bot uses. */
export function freshDatabase(): Db & { raw: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('migrations/', import.meta.url);
  for (const name of readdirSync(migrations)
    .filter((each) => each.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
  const statement = (sql: string, values: readonly SQLInputValue[] = []): Statement => ({
    bind: (...given) => statement(sql, given.map((value) => (value === undefined ? null : value)) as SQLInputValue[]),
    first: <T>() => Promise.resolve((sqlite.prepare(sql).get(...values) ?? null) as T | null),
    all: <T>() => Promise.resolve({ results: sqlite.prepare(sql).all(...values) as T[] }),
    run: () => {
      const done = sqlite.prepare(sql).run(...values);
      return Promise.resolve({ meta: { changes: Number(done.changes), last_row_id: Number(done.lastInsertRowid) } });
    },
  });
  return { raw: sqlite, prepare: (sql) => statement(sql) };
}

/** A count from the database, by a query that names it `count`. */
export const countOf = (held: { raw: DatabaseSync }, sql: string): number =>
  Number((held.raw.prepare(sql).get() as { count: number }).count);

/** A guild as the Gateway sends it on GUILD_CREATE. */
export const guildCreate = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: GUILD,
  name: 'Harbour',
  icon: null,
  owner_id: OWNER,
  member_count: 3,
  roles: [
    { id: GUILD, name: '@everyone', color: 0, position: 0, permissions: String(1 << 10), managed: false },
    {
      id: MOD_ROLE,
      name: 'Moderators',
      color: 0,
      position: 1,
      permissions: String((1 << 13) | (1 << 10)),
      managed: false,
    },
  ],
  channels: [
    { id: TEXT_CHANNEL, name: 'general', type: 0, position: 0 },
    { id: LOG_CHANNEL, name: 'mod-log', type: 0, position: 1 },
  ],
  ...over,
});

/** A server with an owner, an admin role above the bot's, a moderator role below it, and a plain member. */
export const guildWithRanks = () =>
  guildCreate({
    roles: [
      { id: GUILD, name: '@everyone', color: 0, position: 0, permissions: String(1 << 10), managed: false },
      {
        id: MOD_ROLE,
        name: 'Moderators',
        color: 0,
        position: 2,
        permissions: String((1n << 40n) | (1n << 13n) | (1n << 1n)),
        managed: false,
      },
      { id: BOT_ROLE, name: 'The bot', color: 0, position: 4, permissions: String(1n << 3n), managed: true },
      { id: ADMIN_ROLE, name: 'Admins', color: 0, position: 5, permissions: String(1n << 3n), managed: false },
    ],
  });

/** An execution that keeps what was handed to waitUntil, to be waited on. */
export function execution() {
  const later: Promise<unknown>[] = [];
  const held: Execution & { settle: () => Promise<unknown> } = {
    waitUntil: (work) => void later.push(work),
    settle: () => Promise.all(later.splice(0)),
  };
  return held;
}

/** A stood Worker: its database, a fake Discord, the Gateway's namespace, and the server seen once. */
export async function standWorker(
  over: {
    readonly routes?: Readonly<Record<string, Route>>;
    readonly env?: Partial<Env>;
    readonly modules?: readonly ServerModule[];
  } = {},
) {
  const database = freshDatabase();
  const discord = fakeDiscord(
    over.routes,
    new Map([
      [OWNER, []],
      [MOD, [MOD_ROLE]],
      [MEMBER, []],
    ]),
  );
  const gateway = fakeGateway();
  const keys = await interactionKeys();
  const env: Env = {
    BOT_DB: database,
    GATEWAY: gateway.namespace,
    BOT_URL: 'https://bot.example.workers.dev',
    PANEL_URL: PANEL,
    PANEL_ORIGINS: `${ORIGIN},http://localhost:5174`,
    BOT_OWNERS: OWNER,
    DISCORD_BOT_TOKEN: 'bot-token-for-tests',
    DISCORD_CLIENT_SECRET: 'client-secret-for-tests',
    DISCORD_APPLICATION_ID: APP_ID,
    DISCORD_PUBLIC_KEY: keys.publicKeyHex,
    ...over.env,
  };
  // the person signing in is in the rig's server, as Discord's list of their servers says
  discord.world.guilds = [GUILD];
  const registry: Registry = registryOf(over.modules ?? []);
  const dispatcher = createDispatcher({ database, now: Date.now });
  await dispatcher.dispatch('GUILD_CREATE', guildCreate());
  const running = execution();
  const call = async (request: Request, nowMs?: number) => {
    try {
      const clock = nowMs === undefined ? {} : { nowMs };
      return await handle(request, env, running, { fetch: discord.fetch, registry, ...clock });
    } finally {
      await running.settle();
    }
  };
  return { database, discord, gateway, keys, env, call, dispatcher, registry, execution: running };
}
export type StoodWorker = Awaited<ReturnType<typeof standWorker>>;

/** Walk a user through Discord's sign-in, at `nowMs` on the rig's clock when given, and answer the panel's ticket. */
export async function ticketFor(bot: StoodWorker, userId = MOD, nowMs?: number): Promise<string> {
  if (!bot.discord.members.has(userId)) bot.discord.members.set(userId, []);
  bot.discord.world.signedIn = { id: userId, username: `u${userId.slice(-2)}`, global_name: 'Someone' };
  const start = await bot.call(new Request('https://bot.test/v1/auth/discord?to=/panel/'), nowMs);
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
  const back = await bot.call(
    new Request(`https://bot.test/v1/auth/discord/callback?code=goodcode00000&state=${state}`),
    nowMs,
  );
  return new URL(back.headers.get('location') ?? '').hash.replace('#ticket=', '');
}

/** The panel trading a ticket for a session, from its own origin. */
export const exchangeRequest = (ticket: string) =>
  new Request('https://bot.test/v1/auth/exchange', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });

/** Sign a user in through the whole flow and answer their panel token. */
export async function signInPanel(bot: StoodWorker, userId = MOD): Promise<string> {
  const exchanged = await bot.call(exchangeRequest(await ticketFor(bot, userId)));
  return ((await exchanged.json()) as { token: string }).token;
}

/** A request to the panel API with a session token, from the panel's own origin. */
export const panelRequest = (token: string, path: string, init: RequestInit = {}) =>
  new Request(`https://bot.test${path}`, {
    ...init,
    headers: {
      origin: ORIGIN,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...((init.headers ?? {}) as Record<string, string>),
    },
  });

/** The answer's JSON, read as the test knows its shape. */
export const bodyOf = async (answer: Response): Promise<Record<string, unknown>> =>
  (await answer.json()) as Record<string, unknown>;

/**
 * The Gateway's side of the bot with the given modules' settings saved and on: a dispatcher, its cache, a context,
 * a fake Discord, and the server seen with every channel the settings name.
 */
export async function standGateway(settings: Readonly<Record<string, unknown>>, modules: readonly ServerModule[] = []) {
  const database = freshDatabase();
  const discord = fakeDiscord();
  const clock = { now: Date.now() };
  const cache = createCache(fakeSql());
  const lines: string[] = [];
  const dispatcher = createDispatcher({ database, now: () => clock.now, cache, log: (line) => lines.push(line) });
  const channels = new Set<string>();
  for (const [moduleId, config] of Object.entries(settings)) {
    const schema = moduleOf(moduleId)?.schema ?? {};
    const checked = validate(schema, config);
    assert.equal(checked.ok, true, JSON.stringify(checked.ok ? [] : checked.errors));
    if (!checked.ok) continue;
    referencedIds(schema, checked.value).channels.forEach((id) => channels.add(id));
    const write = { guildId: GUILD, moduleId, config: checked.value, enabled: true, rev: 0, by: OWNER, nowS: 1 };
    await writeConfig(database, write);
  }
  const context: BotContext = {
    vars: { DISCORD_BOT_TOKEN: 'bot-token-for-tests' },
    database,
    rest: createRest({ token: 'bot-token-for-tests', fetch: discord.fetch }),
    now: () => clock.now,
    log: (line) => lines.push(line),
    config: (guildId, moduleId) => dispatcher.config(guildId, moduleId),
    snapshot: (guildId) => dispatcher.snapshot(guildId),
    later: () => {},
    cache,
    memory: new Map(),
  };
  dispatcher.use(moduleHandlers(context, registryOf(modules)));
  // the server has every channel its settings name, as a real one does: the bot reads back only its own channels
  const guild = guildWithRanks();
  const known = guild.channels as Array<Record<string, unknown>>;
  for (const id of channels)
    if (!known.some((channel) => channel.id === id)) known.push({ id, name: `channel-${id.slice(-2)}`, type: 0 });
  await dispatcher.dispatch('GUILD_CREATE', guild);
  return { database, discord, clock, cache, context, dispatcher, lines, send: dispatcher.dispatch };
}

export { fakeBucket };
