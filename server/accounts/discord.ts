/**
 * Signing in with Discord. A page sends the player to `/v1/discord/start`, with a ticket when it holds a session, and
 * Discord sends them back to `/v1/discord/callback`, which takes them back to the page. A Discord account already
 * linked signs in to its account; one not yet linked links to the page's account if that has none, and otherwise
 * becomes a new account. The state sent to Discord is single-use, lapses after ten minutes, and must match a cookie
 * set on the way out, so no one can finish a sign-in begun in another browser.
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
/** How long a state or ticket lasts. */
const STATE_MS = 10 * 60_000;
const COOKIE = 'overlook_discord';

/** What a sign-in came to, for the page to read from its address's fragment. */
type Came = { readonly session: string } | { readonly discord: 'linked' | 'cancelled' | 'failed' };

/** Where the callback lives, which the Discord app must list as a redirect. */
const callbackOf = (request: Request): string => `${new URL(request.url).origin}/v1/discord/callback`;

/** A page the player may be sent back to: one whose origin is listed. */
export function backTo(given: string | null, pages: readonly string[]): string | null {
  if (given === null) return null;
  try {
    const url = new URL(given);
    url.hash = '';
    return pages.includes(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A ticket for a signed-in page to take to Discord, saying which account is asking. */
export async function ticketFor(database: Db, account: string, now: number): Promise<string> {
  const ticket = randomToken();
  await database
    .prepare('INSERT INTO discord_states (state, account_id, back, created_at) VALUES (?1, ?2, NULL, ?3)')
    .bind(ticket, account, now)
    .run();
  return ticket;
}

/** Starts a sign-in: keeps a state for the page to come back to, and sends the player to Discord. */
export async function start(
  request: Request,
  database: Db,
  app: DiscordApp,
  back: string,
  now: number,
): Promise<Response> {
  const given = new URL(request.url).searchParams.get('ticket');
  const ticket = given
    ? await database
        .prepare(
          'DELETE FROM discord_states WHERE state = ?1 AND back IS NULL AND created_at > ?2 RETURNING account_id',
        )
        .bind(given, now - STATE_MS)
        .first<{ account_id: string }>()
    : null;
  const state = randomToken();
  await database
    .prepare('INSERT INTO discord_states (state, account_id, back, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(state, ticket?.account_id ?? null, back, now)
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

/** Finishes a sign-in, signing in or linking, and sends the player back to their page with what it came to. */
export async function callback(
  request: Request,
  database: Db,
  app: DiscordApp,
  now: number,
  signIn: (account: string | null, discord: string) => Promise<string>,
): Promise<Response> {
  const asked = new URL(request.url).searchParams;
  const state = asked.get('state') ?? '';
  const kept = await database
    .prepare('DELETE FROM discord_states WHERE state = ?1 AND back IS NOT NULL RETURNING account_id, back, created_at')
    .bind(state)
    .first<{ account_id: string | null; back: string; created_at: number }>();
  if (!kept) return new Response('This sign-in has run out. Start it again from the game.', { status: 400 });
  const cookie = (request.headers.get('Cookie') ?? '').split(/;\s*/).find((each) => each.startsWith(`${COOKIE}=`));
  const came = async (): Promise<Came> => {
    if (cookie !== `${COOKIE}=${state}` || kept.created_at <= now - STATE_MS) return { discord: 'failed' };
    const code = asked.get('code');
    if (!code) return { discord: 'cancelled' };
    const discord = await discordId(request, app, code).catch(() => null);
    if (discord === null) return { discord: 'failed' };
    const owner = await database
      .prepare('SELECT id FROM accounts WHERE discord_id = ?1')
      .bind(discord)
      .first<{ id: string }>();
    if (owner) return { session: await signIn(owner.id, discord) };
    if (kept.account_id !== null) {
      const linked = await database
        .prepare('UPDATE accounts SET discord_id = ?1 WHERE id = ?2 AND discord_id IS NULL')
        .bind(discord, kept.account_id)
        .run();
      if (linked.meta.changes === 1) return { discord: 'linked' };
    }
    return { session: await signIn(null, discord) };
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
