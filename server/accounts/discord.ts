/**
 * Signing in with Discord. A page sends the player to `/v1/discord/start` with a nonce it keeps for itself, and a
 * ticket when it holds a session; Discord sends them back to `/v1/discord/callback`, which takes them back to the page
 * with a one-time code; the page takes what the code came to from `/v1/discord/finish`, showing its nonce. A Discord
 * account already linked signs in to its account; one not yet linked links to the ticket's account, which only that
 * account's own session may take, and otherwise becomes a new account. The state sent to Discord is single-use, lapses
 * after ten minutes, and must match a cookie set on the way out; the code is single-use, lapses as soon, and is taken
 * only with the nonce of the page that began it. So no page can be handed another's sign-in or link.
 */

import type { Db } from './database.ts';
import { randomToken } from './secrets.ts';

/** The Discord app's keys, and the way to reach Discord. */
export interface DiscordApp {
  readonly id: string;
  readonly secret: string;
  readonly fetch: typeof fetch;
}

const AUTHORIZE = 'https://discord.com/oauth2/authorize';
const TOKEN = 'https://discord.com/api/v10/oauth2/token';
const USER = 'https://discord.com/api/v10/users/@me';
/** How long a state, a ticket or a code lasts. */
const STATE_MS = 10 * 60_000;
const COOKIE = 'overlook_discord';
/** A nonce or a code: what `randomToken` makes. */
export const NONCE = /^[0-9a-f]{64}$/;

/** What a sign-in came to, for the page to read from its address's fragment. */
type Came = { readonly discord: 'done'; readonly code: string } | { readonly discord: 'cancelled' | 'failed' };

/** What a code is taken for: a session (an existing account's, or a new one's), or a link to the page's account. */
export type Finished =
  | { readonly kind: 'signin'; readonly account: string | null; readonly discord: string }
  | { readonly kind: 'link'; readonly account: string; readonly discord: string };

/** Where the callback lives, which the Discord app must list as a redirect. */
const callbackOf = (request: Request): string => `${new URL(request.url).origin}/v1/discord/callback`;

/** A page the player may be sent back to: one under a listed page, by origin and path. */
export function backTo(given: string | null, pages: readonly string[]): string | null {
  if (given === null) return null;
  try {
    const url = new URL(given);
    url.hash = '';
    const under = (page: string) => {
      const listed = new URL(page);
      const path = listed.pathname.endsWith('/') ? listed.pathname : `${listed.pathname}/`;
      return url.origin === listed.origin && `${url.pathname}/`.startsWith(path);
    };
    return pages.some(under) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Lets go of every state, ticket and code past its time. */
async function sweep(database: Db, now: number): Promise<void> {
  await database
    .prepare('DELETE FROM discord_states WHERE created_at <= ?1')
    .bind(now - STATE_MS)
    .run();
  await database
    .prepare('DELETE FROM discord_codes WHERE created_at <= ?1')
    .bind(now - STATE_MS)
    .run();
}

/** A ticket for a signed-in page to take to Discord, saying which account is asking. */
export async function ticketFor(database: Db, account: string, now: number): Promise<string> {
  await sweep(database, now);
  const ticket = randomToken();
  await database
    .prepare('INSERT INTO discord_states (state, account_id, back, created_at) VALUES (?1, ?2, NULL, ?3)')
    .bind(ticket, account, now)
    .run();
  return ticket;
}

/** Starts a sign-in: keeps a state with the page's nonce for the page to come back to, and sends the player to
 *  Discord. */
export async function start(
  request: Request,
  database: Db,
  app: DiscordApp,
  back: string,
  nonce: string,
  now: number,
): Promise<Response> {
  await sweep(database, now);
  const given = new URL(request.url).searchParams.get('ticket');
  const ticket = given
    ? await database
        .prepare(
          'DELETE FROM discord_states WHERE state = ?1 AND back IS NULL AND created_at > ?2 RETURNING account_id',
        )
        .bind(given, now - STATE_MS)
        .first<{ account_id: string }>()
    : null;
  // A ticket given is a link: gone, it is no plain sign-in, which would make a new account in the guest's place.
  if (given && !ticket) return new Response('This sign-in has run out. Start it again from the game.', { status: 400 });
  const state = randomToken();
  await database
    .prepare('INSERT INTO discord_states (state, account_id, back, created_at, nonce) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(state, ticket?.account_id ?? null, back, now, nonce)
    .run();
  const to = new URL(AUTHORIZE);
  for (const [name, value] of [
    ['client_id', app.id],
    ['response_type', 'code'],
    ['scope', 'identify'],
    ['state', state],
    ['redirect_uri', callbackOf(request)],
  ] as const)
    to.searchParams.set(name, value);
  return new Response(null, {
    status: 302,
    headers: {
      Location: to.toString(),
      'Set-Cookie': `${COOKIE}=${state}; Path=/v1/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

/** The Discord account a sign-in's code is for, or null if Discord would not say. */
async function discordId(request: Request, app: DiscordApp, code: string): Promise<string | null> {
  const form = new URLSearchParams({
    client_id: app.id,
    client_secret: app.secret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackOf(request),
  });
  const granted = await app.fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!granted.ok) return null;
  const { access_token: access } = (await granted.json()) as { access_token?: unknown };
  if (typeof access !== 'string') return null;
  const user = await app.fetch(USER, { headers: { Authorization: `Bearer ${access}` } });
  if (!user.ok) return null;
  const { id } = (await user.json()) as { id?: unknown };
  return typeof id === 'string' && /^\d{1,24}$/.test(id) ? id : null;
}

/** Finishes Discord's side of a sign-in: keeps what it came to under a one-time code, and sends the player back to
 *  their page with the code. Nothing is signed in or linked until the page takes the code. */
export async function callback(request: Request, database: Db, app: DiscordApp, now: number): Promise<Response> {
  const asked = new URL(request.url).searchParams;
  const state = asked.get('state') ?? '';
  const kept = await database
    .prepare(
      'DELETE FROM discord_states WHERE state = ?1 AND back IS NOT NULL RETURNING account_id, back, created_at, nonce',
    )
    .bind(state)
    .first<{ account_id: string | null; back: string; created_at: number; nonce: string | null }>();
  if (!kept) return new Response('This sign-in has run out. Start it again from the game.', { status: 400 });
  const cookie = (request.headers.get('Cookie') ?? '').split(/;\s*/).find((each) => each.startsWith(`${COOKIE}=`));
  const came = async (): Promise<Came> => {
    const fresh = kept.created_at > now - STATE_MS && kept.nonce !== null;
    if (cookie !== `${COOKIE}=${state}` || !fresh) return { discord: 'failed' };
    const given = asked.get('code');
    if (!given) return { discord: 'cancelled' };
    const discord = await discordId(request, app, given).catch(() => null);
    if (discord === null) return { discord: 'failed' };
    const owner = await database
      .prepare('SELECT id FROM accounts WHERE discord_id = ?1')
      .bind(discord)
      .first<{ id: string }>();
    const [kind, account] = owner
      ? ['signin', owner.id]
      : kept.account_id
        ? ['link', kept.account_id]
        : ['signin', null];
    const code = randomToken();
    await database
      .prepare(
        `INSERT INTO discord_codes (code, nonce, kind, account_id, discord_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(code, kept.nonce, kind, account, discord, now)
      .run();
    return { discord: 'done', code };
  };
  const back = new URL(kept.back);
  back.hash = new URLSearchParams(Object.entries(await came())).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: back.toString(),
      'Set-Cookie': `${COOKIE}=; Path=/v1/discord; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

/** What a code came to, taken once by the page that began its sign-in, showing its nonce; null if it is not that
 *  page's, has been taken, or has lapsed. */
export async function taken(database: Db, code: string, nonce: string, now: number): Promise<Finished | null> {
  const row = await database
    .prepare('DELETE FROM discord_codes WHERE code = ?1 RETURNING nonce, kind, account_id, discord_id, created_at')
    .bind(code)
    .first<{ nonce: string; kind: string; account_id: string | null; discord_id: string; created_at: number }>();
  if (!row || row.nonce !== nonce || row.created_at <= now - STATE_MS) return null;
  if (row.kind === 'link' && row.account_id !== null)
    return { kind: 'link', account: row.account_id, discord: row.discord_id };
  return row.kind === 'signin' ? { kind: 'signin', account: row.account_id, discord: row.discord_id } : null;
}
