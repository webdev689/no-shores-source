/**
 * The accounts' web API. Every player is an account from their first visit: a guest, whose session's token their
 * browser keeps. A guest may add a username and password, and any account may sign in or link with Discord
 * (`discord.ts`). Answers are JSON, open to any page: a session travels only as a bearer token, never a cookie.
 */

import type { Db } from './database.ts';
import { type DiscordApp, backTo, callback, start, ticketFor } from './discord.ts';
import { NO_ONES_PASSWORD, hashOf, hashPassword, passwordMatches, randomToken } from './secrets.ts';

/** What the API runs on: the database, the clock, the Discord app if its keys are set, and the pages (by origin) a
 *  Discord sign-in may come back to. */
export interface Deps {
  readonly database: Db;
  readonly now: () => number;
  readonly discord: DiscordApp | null;
  readonly pages: readonly string[];
}

/** A username: 3 to 20 letters, digits and underscores, starting with a letter. */
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
const PASSWORD_LEAST = 8;
const PASSWORD_MOST = 200;
const MINUTE = 60_000;
/** How many times one address may ask each of these within its window, and one username be tried. */
const LIMITS = {
  guest: { most: 10, window: 60 * MINUTE },
  register: { most: 10, window: 60 * MINUTE },
  login: { most: 20, window: 10 * MINUTE },
  name: { most: 10, window: 10 * MINUTE },
  discord: { most: 20, window: 10 * MINUTE },
} as const;

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
const refused = (status: number, why: string): Response => json({ error: why }, status);

interface AccountRow {
  readonly id: string;
  readonly username: string | null;
  readonly discord_id: string | null;
}

/** An account as its player sees it. */
const shown = (row: AccountRow) => ({
  id: row.id,
  username: row.username,
  discord: row.discord_id !== null,
  guest: row.username === null && row.discord_id === null,
});

/** Whether one more ask under `key` passes its limit; counts it either way. */
async function within(
  database: Db,
  key: string,
  limit: { most: number; window: number },
  now: number,
): Promise<boolean> {
  const start = now - (now % limit.window);
  const counted = await database
    .prepare(
      `INSERT INTO limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count`,
    )
    .bind(`${key}@${start}`, start)
    .first<{ count: number }>();
  return (counted?.count ?? 0) <= limit.most;
}

async function newSession(database: Db, account: string, now: number): Promise<string> {
  const token = randomToken();
  await database
    .prepare('INSERT INTO sessions (token_hash, account_id, created_at, seen_at) VALUES (?1, ?2, ?3, ?3)')
    .bind(await hashOf(token), account, now)
    .run();
  return token;
}

async function newAccount(database: Db, now: number, discord: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await database
    .prepare('INSERT INTO accounts (id, discord_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(id, discord, now)
    .run();
  return id;
}

/** The account a request's bearer token is a session of. */
async function signedIn(request: Request, database: Db): Promise<AccountRow | null> {
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return null;
  return database
    .prepare(
      `SELECT accounts.id, accounts.username, accounts.discord_id FROM sessions
       JOIN accounts ON accounts.id = sessions.account_id WHERE sessions.token_hash = ?1`,
    )
    .bind(await hashOf(token))
    .first<AccountRow>();
}

/** A request's JSON body's username and password, if it has both as strings. */
async function nameAndPassword(request: Request): Promise<{ username: string; password: string } | null> {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const [username, password] = [body?.username, body?.password];
  return typeof username === 'string' && typeof password === 'string' ? { username, password } : null;
}

/** Answers one request to the API. */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const { database } = deps;
  const now = deps.now();
  const address = request.headers.get('CF-Connecting-IP') ?? 'nowhere';
  const route = `${request.method} ${new URL(request.url).pathname}`;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  switch (route) {
    case 'GET /v1/health':
      return json({ ok: true, discord: deps.discord !== null });
    case 'POST /v1/guest': {
      if (!(await within(database, `guest:${address}`, LIMITS.guest, now))) return refused(429, 'Too many new guests.');
      await database
        .prepare('DELETE FROM limits WHERE window_start < ?1')
        .bind(now - 24 * 60 * MINUTE)
        .run();
      const id = await newAccount(database, now);
      return json({
        token: await newSession(database, id, now),
        account: shown({ id, username: null, discord_id: null }),
      });
    }
    case 'GET /v1/me': {
      const account = await signedIn(request, database);
      return account ? json({ account: shown(account) }) : refused(401, 'Not signed in.');
    }
    case 'POST /v1/register': {
      const account = await signedIn(request, database);
      if (!account) return refused(401, 'Not signed in.');
      if (account.username !== null) return refused(409, 'This account already has a username.');
      if (!(await within(database, `register:${address}`, LIMITS.register, now)))
        return refused(429, 'Too many tries.');
      const given = await nameAndPassword(request);
      if (!given || !USERNAME.test(given.username))
        return refused(400, 'A username is 3 to 20 letters, digits or underscores, starting with a letter.');
      if (given.password.length < PASSWORD_LEAST || given.password.length > PASSWORD_MOST)
        return refused(400, `A password is ${PASSWORD_LEAST} to ${PASSWORD_MOST} characters.`);
      const key = given.username.toLowerCase();
      const kept = await hashPassword(given.password);
      const named = await database
        .prepare(
          `UPDATE accounts SET username = ?1, username_key = ?2, password = ?3 WHERE id = ?4 AND username IS NULL
           AND NOT EXISTS (SELECT 1 FROM accounts WHERE username_key = ?2)`,
        )
        .bind(given.username, key, kept, account.id)
        .run()
        .catch(() => ({ meta: { changes: 0 } }));
      if (named.meta.changes !== 1) return refused(409, 'That username is taken.');
      return json({ account: shown({ ...account, username: given.username }) });
    }
    case 'POST /v1/login': {
      const given = await nameAndPassword(request);
      if (!given) return refused(400, 'Give a username and a password.');
      const key = given.username.toLowerCase();
      const allowed =
        (await within(database, `login:${address}`, LIMITS.login, now)) &&
        (await within(database, `name:${key}`, LIMITS.name, now));
      if (!allowed) return refused(429, 'Too many tries. Wait a few minutes.');
      const row = await database
        .prepare('SELECT id, username, discord_id, password FROM accounts WHERE username_key = ?1')
        .bind(key)
        .first<AccountRow & { password: string | null }>();
      const matches = await passwordMatches(given.password.slice(0, PASSWORD_MOST), row?.password ?? NO_ONES_PASSWORD);
      if (!row || !matches) return refused(401, 'That username and password do not match.');
      return json({ token: await newSession(database, row.id, now), account: shown(row) });
    }
    case 'POST /v1/logout': {
      const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (token)
        await database
          .prepare('DELETE FROM sessions WHERE token_hash = ?1')
          .bind(await hashOf(token))
          .run();
      return json({ ok: true });
    }
    case 'POST /v1/discord/ticket': {
      const account = await signedIn(request, database);
      return account ? json({ ticket: await ticketFor(database, account.id, now) }) : refused(401, 'Not signed in.');
    }
    case 'GET /v1/discord/start': {
      if (!deps.discord) return refused(503, 'Discord sign-in is not set up yet.');
      if (!(await within(database, `discord:${address}`, LIMITS.discord, now))) return refused(429, 'Too many tries.');
      const back = backTo(new URL(request.url).searchParams.get('back'), deps.pages);
      if (!back) return refused(400, 'That page cannot sign in here.');
      return start(request, database, deps.discord, back, now);
    }
    case 'GET /v1/discord/callback': {
      if (!deps.discord) return refused(503, 'Discord sign-in is not set up yet.');
      return callback(request, database, deps.discord, now, async (owner, discord) =>
        newSession(database, owner ?? (await newAccount(database, now, discord)), now),
      );
    }
    default:
      return refused(404, 'No such page.');
  }
}
