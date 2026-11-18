/**
 * The accounts' web API. Every player is an account from their first visit: a guest, whose session's token their
 * browser keeps. A guest may add a username and password, and any account may sign in or link with Discord
 * (`discord.ts`). Answers are JSON, open to any page: a session travels only as a bearer token, never a cookie.
 */

import { type Db, SESSION_IDLE_MS } from './database.ts';
import { type DiscordApp, NONCE, backTo, callback, start, taken, ticketFor } from './discord.ts';
import { friendAsk, friendsOf } from './friends.ts';
import { NO_ONES_PASSWORD, hashOf, hashPassword, passwordMatches, randomToken } from './secrets.ts';

/** What the API runs on: the database, the clock, the Discord app if its keys are set, and the pages (by origin and
 *  path) a Discord sign-in may come back to. */
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
/** How many times one address may ask each of these within its window; one username be tried from one address, and
 *  from everywhere at once; and one account take a Discord ticket. */
const LIMITS = {
  guest: { most: 10, window: 60 * MINUTE },
  register: { most: 10, window: 60 * MINUTE },
  login: { most: 20, window: 10 * MINUTE },
  name: { most: 10, window: 10 * MINUTE },
  nameEverywhere: { most: 100, window: 10 * MINUTE },
  discord: { most: 20, window: 10 * MINUTE },
  ticket: { most: 10, window: 10 * MINUTE },
  friend: { most: 30, window: 60 * MINUTE },
} as const;
/** The most a request's body may hold, in bytes: a username and password, or a code and nonce, are far less. */
const BODY_MOST = 2048;

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

/** Said of a session its account has not used in `SESSION_IDLE_MS`. */
const LAPSED = 'Your sign-in lapsed after 30 days away. Sign in again.';

/** The account a request's bearer token is a session of, seen now; `LAPSED` if it lapsed, which ends it. */
async function sessionOf(request: Request, database: Db, now: number): Promise<AccountRow | typeof LAPSED | null> {
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return null;
  const hash = await hashOf(token);
  const row = await database
    .prepare(
      `SELECT accounts.id, accounts.username, accounts.discord_id, sessions.seen_at FROM sessions
       JOIN accounts ON accounts.id = sessions.account_id WHERE sessions.token_hash = ?1`,
    )
    .bind(hash)
    .first<AccountRow & { seen_at: number }>();
  if (!row) return null;
  const lapsed = (row.username !== null || row.discord_id !== null) && row.seen_at < now - SESSION_IDLE_MS;
  await database
    .prepare(
      lapsed ? 'DELETE FROM sessions WHERE token_hash = ?2' : 'UPDATE sessions SET seen_at = ?1 WHERE token_hash = ?2',
    )
    .bind(now, hash)
    .run();
  return lapsed ? LAPSED : { id: row.id, username: row.username, discord_id: row.discord_id };
}

/** The account a request's bearer token is a live session of. */
async function signedIn(request: Request, database: Db, now: number): Promise<AccountRow | null> {
  const found = await sessionOf(request, database, now);
  return found === LAPSED ? null : found;
}

/** A request's body as text, read only up to `BODY_MOST` bytes however it is sent; null past that. */
async function textOf(request: Request): Promise<string | null> {
  if (Number(request.headers.get('Content-Length') ?? 0) > BODY_MOST) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const read: Uint8Array[] = [];
  let size = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength;
      if (size > BODY_MOST) {
        await reader.cancel();
        return null;
      }
      read.push(chunk.value);
    }
  } catch {
    return '';
  }
  const whole = new Uint8Array(size);
  read.reduce((offset, part) => (whole.set(part, offset), offset + part.byteLength), 0);
  return new TextDecoder().decode(whole);
}

/** A request's JSON body, read only up to `BODY_MOST` bytes; null if it is longer or not JSON. */
async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  const text = await textOf(request);
  if (text === null) return null;
  try {
    const read: unknown = JSON.parse(text);
    return typeof read === 'object' && read !== null ? (read as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A request's JSON body's username and password, if it has both as strings. */
async function nameAndPassword(request: Request): Promise<{ username: string; password: string } | null> {
  const body = await bodyOf(request);
  const [username, password] = [body?.['username'], body?.['password']];
  return typeof username === 'string' && typeof password === 'string' ? { username, password } : null;
}

/** The address a request's limits are kept by: an IPv4 address whole, an IPv6 address by its /64, since one network
 *  holds a whole /64. */
export function addressKey(address: string): string {
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...front, ...Array(8 - front.length - back.length).fill('0'), ...back]
    : front;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** Takes what a Discord sign-in came to for the page that began it: a session, or a link to the page's own account,
 *  which only that account's session may take. */
async function finish(request: Request, deps: Deps, now: number): Promise<Response> {
  const { database } = deps;
  const body = await bodyOf(request);
  const [code, nonce] = [body?.['code'], body?.['nonce']];
  const came =
    typeof code === 'string' && typeof nonce === 'string' && NONCE.test(code) && NONCE.test(nonce)
      ? await taken(database, code, nonce, now)
      : null;
  if (!came) return refused(400, 'This sign-in has run out. Start it again from the game.');
  if (came.kind === 'link') {
    const account = await signedIn(request, database, now);
    if (account?.id !== came.account) return refused(403, 'Discord can be linked only from the account that asked.');
    const linked = await database
      .prepare('UPDATE accounts SET discord_id = ?1 WHERE id = ?2 AND discord_id IS NULL')
      .bind(came.discord, came.account)
      .run()
      .catch(() => ({ meta: { changes: 0 } }));
    if (linked.meta.changes !== 1) return refused(409, 'That Discord account or this account is already linked.');
    return json({ linked: true, account: shown({ ...account, discord_id: came.discord }) });
  }
  // A Discord account linked since its code was made signs in to its account, never a second one.
  const owner = await database
    .prepare('SELECT id, username, discord_id FROM accounts WHERE discord_id = ?1')
    .bind(came.discord)
    .first<AccountRow>();
  const id = owner?.id ?? came.account ?? (await newAccount(database, now, came.discord));
  const row =
    owner ??
    (await database
      .prepare('SELECT id, username, discord_id FROM accounts WHERE id = ?1')
      .bind(id)
      .first<AccountRow>());
  if (!row) return refused(400, 'This sign-in has run out. Start it again from the game.');
  return json({ token: await newSession(database, row.id, now), account: shown(row) });
}

/** Answers one request to the API. */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  const { database } = deps;
  const now = deps.now();
  const address = addressKey(request.headers.get('CF-Connecting-IP') ?? 'nowhere');
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
      await database
        .prepare(
          `DELETE FROM sessions WHERE seen_at < ?1 AND account_id IN
           (SELECT id FROM accounts WHERE username IS NOT NULL OR discord_id IS NOT NULL)`,
        )
        .bind(now - SESSION_IDLE_MS)
        .run();
      const id = await newAccount(database, now);
      return json({
        token: await newSession(database, id, now),
        account: shown({ id, username: null, discord_id: null }),
      });
    }
    case 'GET /v1/me': {
      const account = await sessionOf(request, database, now);
      if (account === LAPSED) return refused(401, LAPSED);
      return account ? json({ account: shown(account) }) : refused(401, 'Not signed in.');
    }
    case 'POST /v1/register': {
      const account = await signedIn(request, database, now);
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
      if (!(await within(database, `login:${address}`, LIMITS.login, now)))
        return refused(429, 'Too many tries. Wait a few minutes.');
      const given = await nameAndPassword(request);
      if (!given) return refused(400, 'Give a username and a password.');
      // No account holds a name that is not a username, so it is refused before it is kept or hashed.
      if (!USERNAME.test(given.username)) return refused(401, 'That username and password do not match.');
      const key = given.username.toLowerCase();
      const allowed =
        (await within(database, `name:${key}:${address}`, LIMITS.name, now)) &&
        (await within(database, `name:${key}`, LIMITS.nameEverywhere, now));
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
    case 'POST /v1/logout/everywhere': {
      const account = await signedIn(request, database, now);
      if (!account) return refused(401, 'Not signed in.');
      if (account.username === null && account.discord_id === null)
        return refused(409, 'A guest has no way back in. Add a username or Discord first.');
      await database.prepare('DELETE FROM sessions WHERE account_id = ?1').bind(account.id).run();
      return json({ ok: true });
    }
    case 'POST /v1/discord/ticket': {
      const account = await signedIn(request, database, now);
      if (!account) return refused(401, 'Not signed in.');
      if (!(await within(database, `ticket:${account.id}`, LIMITS.ticket, now))) return refused(429, 'Too many tries.');
      return json({ ticket: await ticketFor(database, account.id, now) });
    }
    case 'GET /v1/discord/start': {
      if (!deps.discord) return refused(503, 'Discord sign-in is not set up yet.');
      if (!(await within(database, `discord:${address}`, LIMITS.discord, now))) return refused(429, 'Too many tries.');
      const asked = new URL(request.url).searchParams;
      const back = backTo(asked.get('back'), deps.pages);
      if (!back) return refused(400, 'That page cannot sign in here.');
      const nonce = asked.get('nonce') ?? '';
      if (!NONCE.test(nonce)) return refused(400, 'Start Discord sign-in from the game.');
      return start(request, database, deps.discord, back, nonce, now);
    }
    case 'GET /v1/discord/callback': {
      if (!deps.discord) return refused(503, 'Discord sign-in is not set up yet.');
      return callback(request, database, deps.discord, now);
    }
    case 'POST /v1/discord/finish':
      return finish(request, deps, now);
    case 'GET /v1/friends':
    case 'POST /v1/friends/ask':
    case 'POST /v1/friends/accept':
    case 'POST /v1/friends/remove': {
      const account = await signedIn(request, database, now);
      if (!account) return refused(401, 'Not signed in.');
      if (account.username === null) return refused(409, 'Add a username in Settings to have friends.');
      if (request.method === 'GET') return json(await friendsOf(database, account.id, now));
      const asked =
        route === 'POST /v1/friends/ask' ? 'ask' : route === 'POST /v1/friends/accept' ? 'accept' : 'remove';
      if (asked === 'ask' && !(await within(database, `friend:${account.id}`, LIMITS.friend, now)))
        return refused(429, 'Too many asks. Wait a while.');
      const answer = await friendAsk(database, account.id, asked, (await bodyOf(request))?.['name'], now);
      return json(answer.body, answer.status);
    }
    default:
      return refused(404, 'No such page.');
  }
}
