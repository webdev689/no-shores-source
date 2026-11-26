/**
 * The accounts' web API. Every player is an account from their first visit: a guest, whose session's token their
 * browser keeps. A guest may add a username and password, and any account may sign in or link with Discord
 * (`discord.ts`), and keep the controls they bound (`binds.ts`). Answers are JSON, open to any page: a session travels
 * only as a bearer token, never a cookie.
 */

import { addressKey, guestKey } from '../address.ts';
import { type Db, SESSION_IDLE_MS } from './database.ts';
import { type AccountRow, HEADERS, LAPSED, bodyOf, json, refused, sessionOf, signedIn, within } from './http.ts';
import { type DiscordApp, NONCE, backTo, callback, start, taken, ticketFor } from './discord.ts';
import type { Developers } from './developers.ts';
import { INVITE_MS } from './companies.ts';
import { bindsAsk } from './binds.ts';
import { lastPlace } from './lastPlace.ts';
import { socialAsk, socialRead } from './social.ts';
import { forgetAnswers, outpostAllowed, plotReadAllowed } from './outpostStores.ts';
import { USERNAME, refusalOf, skeleton } from './names.ts';
import { NO_ONES_PASSWORD, hashOf, hashPassword, passwordMatches, randomToken } from './secrets.ts';

/** What the API runs on: the database, the clock, the Discord app if its keys are set, the pages (by origin and
 *  path) a Discord sign-in may come back to, and the bot that says who is a developer (none: no one is). */
export interface Deps {
  readonly database: Db;
  readonly now: () => number;
  readonly discord: DiscordApp | null;
  readonly pages: readonly string[];
  readonly bot?: Developers | null;
}

const PASSWORD_LEAST = 8;
const PASSWORD_MOST = 200;
const MINUTE = 60_000;
/** How many times one address may ask each of these within its window, and new guests be made from everywhere at
 *  once; one username be tried from one address, and from everywhere at once; and one account take a Discord ticket.
 *  Outpost asks count with the rooms' errands in `OUTPOST_LIMIT` (`outpostStores.ts`), plot reads apart in one alike. */
const LIMITS = {
  guest: { most: 10, window: 60 * MINUTE },
  guests: { most: 500, window: 60 * MINUTE },
  register: { most: 10, window: 60 * MINUTE },
  login: { most: 20, window: 10 * MINUTE },
  name: { most: 10, window: 10 * MINUTE },
  nameEverywhere: { most: 100, window: 10 * MINUTE },
  discord: { most: 20, window: 10 * MINUTE },
  ticket: { most: 10, window: 10 * MINUTE },
  social: { most: 60, window: 60 * MINUTE },
  report: { most: 10, window: 24 * 60 * MINUTE },
  binds: { most: 120, window: 60 * MINUTE },
} as const;

/** An account as its player sees it. */
const shown = (row: AccountRow) => ({
  id: row.id,
  username: row.username,
  discord: row.discord_id !== null,
  guest: row.username === null && row.discord_id === null,
});

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

/** A request's JSON body's username and password, if it has both as strings. */
async function nameAndPassword(request: Request): Promise<{ username: string; password: string } | null> {
  const body = await bodyOf(request);
  const [username, password] = [body?.['username'], body?.['password']];
  return typeof username === 'string' && typeof password === 'string' ? { username, password } : null;
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

/** The Roster's routes (`social.ts`): `GET /v1/roster`, `GET /v1/guild`, `GET /v1/outposts` (one's guild's, or one
 *  outpost's by its room), `GET /v1/players/<name>` and
 *  `POST /v1/social/<ask>`, each for a signed-in player with a username. Asks that reach other players are limited. */
async function social(request: Request, deps: Deps, route: string, now: number): Promise<Response> {
  const { database } = deps;
  const read = /^GET \/v1\/(roster|guild|outposts|outposts\/[a-z0-9-]+|players\/[^/]+)$/.exec(route)?.[1];
  const asked = /^POST \/v1\/social\/([a-z]+(?:\/[a-z]+)?)$/.exec(route)?.[1];
  if (!read && !asked) return refused(404, 'No such page.');
  const account = await sessionOf(request, database, now);
  if (account === LAPSED) return refused(401, LAPSED);
  if (!account) return refused(401, 'Not signed in.');
  if (account.username === null) return refused(409, 'Add a username in Settings to use the Roster.');
  // Outpost asks and reads of a plot each write or read a plot's rows, so they are limited too, each apart.
  const allowed = read?.startsWith('outposts/')
    ? plotReadAllowed
    : asked?.startsWith('outpost/')
      ? outpostAllowed
      : null;
  if (allowed && !(await allowed(database, account.id, now))) return refused(429, 'Too many asks. Wait a while.');
  if (read) {
    const answer = await socialRead(database, account.id, read, now);
    return json(answer.body, answer.status);
  }
  const limit = asked === 'report' ? LIMITS.report : LIMITS.social;
  const reaching = /^(friend\/ask|company\/invite|guild\/invite|guild\/found|report)$/.test(asked ?? '');
  if (reaching && !(await within(database, `${asked === 'report' ? 'report' : 'social'}:${account.id}`, limit, now)))
    return refused(429, 'Too many asks. Wait a while.');
  const answer = await socialAsk(database, account.id, asked ?? '', await bodyOf(request), now);
  return json(answer.body, answer.status);
}

/** Answers one request to the API, or throws for a write that failed. */
async function respond(request: Request, deps: Deps): Promise<Response> {
  const { database } = deps;
  const now = deps.now();
  const connecting = request.headers.get('CF-Connecting-IP') ?? 'nowhere';
  const address = addressKey(connecting);
  const route = `${request.method} ${new URL(request.url).pathname}`;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  switch (route) {
    case 'GET /v1/health':
      return json({ ok: true, discord: deps.discord !== null });
    case 'POST /v1/guest': {
      // One network past its ten spends none of everywhere's 500.
      const allowed =
        (await within(database, `guest:${guestKey(connecting)}`, LIMITS.guest, now)) &&
        (await within(database, 'guests', LIMITS.guests, now));
      if (!allowed) return refused(429, 'Too many new guests.');
      await database
        .prepare('DELETE FROM limits WHERE window_start < ?1')
        .bind(now - 24 * 60 * MINUTE)
        .run();
      await database
        .prepare('DELETE FROM company_invites WHERE created_at < ?1')
        .bind(now - INVITE_MS)
        .run();
      await database
        .prepare(
          `DELETE FROM sessions WHERE seen_at < ?1 AND account_id IN
           (SELECT id FROM accounts WHERE username IS NOT NULL OR discord_id IS NOT NULL)`,
        )
        .bind(now - SESSION_IDLE_MS)
        .run();
      await forgetAnswers(database, now);
      // A guest unused for 30 days, made, seen and saved by none since, goes with all it holds (each table's rows
      // follow their account). Ten at a time: every guest pruned was made by an ask like this one.
      await database
        .prepare(
          `DELETE FROM accounts WHERE id IN (SELECT id FROM accounts WHERE username IS NULL AND discord_id IS NULL
           AND created_at < ?1
           AND NOT EXISTS (SELECT 1 FROM sessions WHERE account_id = accounts.id AND seen_at >= ?1)
           AND NOT EXISTS (SELECT 1 FROM characters WHERE account_id = accounts.id AND saved_at >= ?1) LIMIT 10)`,
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
      if (!account) return refused(401, 'Not signed in.');
      // Where its character logs back in, for the page to go after the title (`lastPlace.ts`).
      return json({ account: shown(account), place: await lastPlace(database, account.id) });
    }
    case 'POST /v1/register': {
      const account = await signedIn(request, database, now);
      if (!account) return refused(401, 'Not signed in.');
      if (account.username !== null) return refused(409, 'This account already has a username.');
      if (!(await within(database, `register:${address}`, LIMITS.register, now)))
        return refused(429, 'Too many tries.');
      const given = await nameAndPassword(request);
      if (!given) return refused(400, 'Give a username and a password.');
      const unfit = refusalOf('username', given.username);
      if (unfit) return refused(400, unfit);
      if (given.password.length < PASSWORD_LEAST || given.password.length > PASSWORD_MOST)
        return refused(400, `A password is ${PASSWORD_LEAST} to ${PASSWORD_MOST} characters.`);
      const [key, look] = [given.username.toLowerCase(), skeleton(given.username)];
      const kept = await hashPassword(given.password);
      const named = await database
        .prepare(
          `UPDATE accounts SET username = ?1, username_key = ?2, name_skeleton = ?5, password = ?3
           WHERE id = ?4 AND username IS NULL AND NOT EXISTS (SELECT 1 FROM accounts WHERE username_key = ?2)
           AND NOT EXISTS (SELECT 1 FROM accounts WHERE name_skeleton = ?5)`,
        )
        .bind(given.username, key, kept, account.id, look)
        .run()
        .catch(() => ({ meta: { changes: 0 } }));
      if (named.meta.changes !== 1) {
        const like = await database
          .prepare('SELECT username_key = ?2 AS same FROM accounts WHERE name_skeleton = ?1')
          .bind(look, key)
          .first<{ same: number }>();
        return refused(409, like?.same === 0 ? "That name is too like another player's." : 'That username is taken.');
      }
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
    case 'GET /v1/binds':
    case 'PUT /v1/binds': {
      const account = await signedIn(request, database, now);
      if (!account) return refused(401, 'Not signed in.');
      if (!(await within(database, `binds:${account.id}`, LIMITS.binds, now))) return refused(429, 'Too many saves.');
      return bindsAsk(request, database, account, now);
    }
    default:
      return social(request, deps, route, now);
  }
}

/** Answers one request to the API. A write that fails is logged and answered as JSON with the usual headers: 409
 *  when a constraint refused it, as another ask changed the same rows between a read and a write; 500 otherwise. */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  try {
    return await respond(request, deps);
  } catch (error) {
    console.error('accounts:', error);
    return /constraint failed/i.test(String(error))
      ? refused(409, 'Someone else changed that at the same moment. Try again.')
      : refused(500, 'Something went wrong. Try again.');
  }
}
