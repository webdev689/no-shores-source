// Sign-in to the panel with Discord. The flow is OAuth2's authorization code with PKCE and the `identify` and `guilds`
// scopes: Discord tells the bot who the person is and which servers they are in, so the panel lists only the servers
// they share with the bot, and the bot works out what they may do from each server itself, so no Discord token is
// kept. The finished sign-in reaches the panel as a one-use ticket in the URL's fragment (never sent
// to a server or a Referer), which the panel trades for a session token it sends as a bearer header. A bearer header
// carries no ambient credential, so the panel API needs no CSRF defence.

import { recordOf } from './law/settings.ts';
import { pkceChallenge, randomToken, sha256Hex } from './crypto.ts';
import { type HeaderSet, fail, json, panelOrigins, readJson, redirect } from './http.ts';
import type { Vars } from './kit.ts';
import { DISCORD_API, type Fetch, USER_AGENT } from './rest.ts';
import type { Db } from './store.ts';

export const OAUTH_AUTHORIZE = 'https://discord.com/oauth2/authorize';
export const OAUTH_TOKEN = `${DISCORD_API}/oauth2/token`;
export const OAUTH_REVOKE = `${DISCORD_API}/oauth2/token/revoke`;
export const STATE_KEEP_S = 600;
export const TICKET_KEEP_S = 120;
export const SESSION_IDLE_S = 7 * 86_400;
export const SESSION_MAX_S = 30 * 86_400;
/** last_seen is written at most this often, so a busy panel does not write on every read. */
export const SEEN_EVERY_S = 300;
/** Sign-ins one address may start a minute, in one isolate. */
export const STARTS_A_MINUTE = 10;
export const CALLBACK_PATH = '/v1/auth/discord/callback';
/** The cookie the sign-in's state rides in, out to Discord and back: a callback carried to another browser (a link
 *  sent to someone, to sign them in as its sender) finds none there, and is refused. */
export const STATE_COOKIE = 'noshores_panel_state';
const STATE_COOKIE_AT = `Path=/v1/auth/discord; HttpOnly; Secure; SameSite=Lax`;
const CALL_TIMEOUT_MS = 8_000;

export interface PanelUser {
  readonly id: string;
  readonly username: string;
  readonly globalName: string;
  readonly avatar: string | null;
}
export interface AuthContext {
  readonly vars: Vars;
  readonly database: Db;
  readonly fetch: Fetch;
  readonly nowS: number;
  readonly later: (work: Promise<unknown>) => void;
  readonly selfOrigin: string;
  readonly cors: HeaderSet;
  readonly ip: string;
}

const starts = new Map<string, { count: number; until: number }>();

function tooManyStarts(address: string, nowS: number): boolean {
  const window = starts.get(address);
  if (!window || window.until <= nowS) {
    if (starts.size > 5_000) starts.clear();
    starts.set(address, { count: 1, until: nowS + 60 });
    return false;
  }
  window.count++;
  return window.count > STARTS_A_MINUTE;
}

/** The panel's address: PANEL_URL, an absolute https URL (or one on this machine). */
export function panelUrl(vars: Vars): URL | null {
  try {
    const url = new URL(String(vars.PANEL_URL ?? ''));
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url : null;
  } catch {
    return null;
  }
}

/** A path a sign-in may come back to. */
const RETURN_PATH = /^\/(?!\/)[A-Za-z0-9/_.~-]{0,200}$/;

/**
 * Where a sign-in comes back to: a path on the panel's own site, or a page on a site the panel also runs on
 * (PANEL_ORIGINS), as its origin and path alone. Anything else comes back to the panel's own path.
 */
export function safeReturn(to: string | null, panel: URL, origins: readonly string[] = []): string {
  if (typeof to !== 'string') return panel.pathname;
  if (RETURN_PATH.test(to)) return to;
  let url: URL;
  try {
    url = new URL(to);
  } catch {
    return panel.pathname;
  }
  const known = url.origin === panel.origin || origins.includes(url.origin);
  const bare = !url.username && !url.password && !url.search && !url.hash;
  return known && bare && RETURN_PATH.test(url.pathname) ? `${url.origin}${url.pathname}` : panel.pathname;
}

/** Whether the panel's sign-in is set up: the application's id and its OAuth2 secret. */
export const loginOn = (vars: Vars): boolean =>
  typeof vars.DISCORD_CLIENT_SECRET === 'string' &&
  vars.DISCORD_CLIENT_SECRET.length > 0 &&
  /^\d{5,25}$/.test(String(vars.DISCORD_APPLICATION_ID ?? ''));

/** GET /v1/auth/discord: send the person to Discord. */
export async function startLogin(context: AuthContext, url: URL): Promise<Response> {
  const panel = panelUrl(context.vars);
  if (!panel) return fail('panel-url', 500, {}, 'PANEL_URL is not set.');
  const returnTo = safeReturn(url.searchParams.get('to'), panel, panelOrigins(context.vars));
  const refuse = (error: string) => {
    const back = new URL(returnTo, panel);
    back.hash = `error=${error}`;
    return redirect(back.toString());
  };
  if (!loginOn(context.vars)) return refuse('login-off');
  if (tooManyStarts(context.ip, context.nowS)) return refuse('rate');
  const state = randomToken(24);
  const verifier = randomToken(48);
  await context.database
    .prepare('INSERT INTO oauth_states (state_hash, verifier, return_to, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(state), verifier, returnTo, context.nowS)
    .run();
  const discord = new URL(OAUTH_AUTHORIZE);
  discord.searchParams.set('response_type', 'code');
  discord.searchParams.set('client_id', String(context.vars.DISCORD_APPLICATION_ID));
  discord.searchParams.set('scope', 'identify guilds');
  discord.searchParams.set('redirect_uri', `${context.selfOrigin}${CALLBACK_PATH}`);
  discord.searchParams.set('state', state);
  discord.searchParams.set('code_challenge', await pkceChallenge(verifier));
  discord.searchParams.set('code_challenge_method', 'S256');
  discord.searchParams.set('prompt', 'none');
  const away = redirect(discord.toString());
  away.headers.append('Set-Cookie', `${STATE_COOKIE}=${state}; Max-Age=${STATE_KEEP_S}; ${STATE_COOKIE_AT}`);
  return away;
}

/** GET /v1/auth/discord/callback: Discord sends the person back here, `cookies` the browser's own. */
export async function finishLogin(context: AuthContext, url: URL, cookies: string | null): Promise<Response> {
  const panel = panelUrl(context.vars);
  if (!panel) return fail('panel-url', 500, {}, 'PANEL_URL is not set.');
  let held = false;
  const back = (fragment: string, path = panel.pathname) => {
    const target = new URL(path, panel);
    target.hash = fragment;
    const sent = redirect(target.toString());
    // Let go only once it was this sign-in's: a stale tab's callback leaves a newer sign-in's state standing.
    if (held) sent.headers.append('Set-Cookie', `${STATE_COOKIE}=; Max-Age=0; ${STATE_COOKIE_AT}`);
    return sent;
  };
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return back('error=state');
  held = (cookies ?? '').split(/;\s*/).includes(`${STATE_COOKIE}=${state}`);
  if (!held) return back('error=state');
  const row = await context.database
    .prepare('DELETE FROM oauth_states WHERE state_hash = ? RETURNING verifier, return_to, created_at')
    .bind(await sha256Hex(state))
    .first<{ verifier: string; return_to: string; created_at: number }>();
  if (!row || context.nowS - Number(row.created_at) > STATE_KEEP_S) return back('error=state');
  const returnTo = String(row.return_to);
  if (url.searchParams.get('error')) return back('error=denied', returnTo);
  if (!/^[A-Za-z0-9]{10,64}$/.test(code)) return back('error=code', returnTo);
  const signedIn = await identify(context, code, String(row.verifier));
  if (!signedIn) return back('error=discord', returnTo);
  const guilds = await guildsOf(context, signedIn.access);
  context.later(revoke(context, signedIn.access));
  const ticket = randomToken(32);
  await context.database
    .prepare('INSERT INTO panel_tickets (ticket_hash, user_id, user, created_at, guilds) VALUES (?, ?, ?, ?, ?)')
    .bind(
      await sha256Hex(ticket),
      signedIn.user.id,
      JSON.stringify(signedIn.user),
      context.nowS,
      guilds ? JSON.stringify(guilds) : null,
    )
    .run();
  return back(`ticket=${ticket}`, returnTo);
}

/** The application's keys, as an OAuth2 form carries them. */
const appKeys = (vars: Vars) => ({
  client_id: String(vars.DISCORD_APPLICATION_ID),
  client_secret: String(vars.DISCORD_CLIENT_SECRET),
});

/** Trade the code for an access token and read who it belongs to. The caller revokes the token when it is done. */
async function identify(
  context: AuthContext,
  code: string,
  verifier: string,
): Promise<{ user: PanelUser; access: string } | null> {
  const form = new URLSearchParams({
    ...appKeys(context.vars),
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${context.selfOrigin}${CALLBACK_PATH}`,
    code_verifier: verifier,
  });
  try {
    const granted = await context.fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
      body: form.toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!granted.ok) {
      console.warn(`[bot] Discord refused the sign-in code: ${granted.status}`);
      return null;
    }
    const access = recordOf(await granted.json()).access_token;
    if (typeof access !== 'string' || !access) return null;
    const answered = await context.fetch(`${DISCORD_API}/users/@me`, {
      headers: { authorization: `Bearer ${access}`, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const self = answered.ok ? recordOf(await answered.json()) : {};
    if (!/^\d{5,25}$/.test(String(self.id ?? ''))) {
      context.later(revoke(context, access));
      return null;
    }
    const user: PanelUser = {
      id: String(self.id),
      username: String(self.username ?? '').slice(0, 64),
      globalName: String(self.global_name ?? self.username ?? '').slice(0, 64),
      avatar: typeof self.avatar === 'string' ? self.avatar : null,
    };
    return { user, access };
  } catch (error) {
    console.warn(`[bot] the sign-in did not reach Discord: ${error instanceof Error ? error.name : 'error'}`);
    return null;
  }
}

/** The most servers Discord lists for a person in one answer, which covers every account's limit. */
const GUILDS_A_PAGE = 200;

/** The ids of the servers Discord says the token's person is in, or null when Discord does not answer them. */
async function guildsOf(context: AuthContext, access: string): Promise<string[] | null> {
  try {
    const answered = await context.fetch(`${DISCORD_API}/users/@me/guilds?limit=${GUILDS_A_PAGE}`, {
      headers: { authorization: `Bearer ${access}`, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!answered.ok) return null;
    const listed: unknown = await answered.json();
    if (!Array.isArray(listed)) return null;
    return listed.map((guild) => String(recordOf(guild).id ?? '')).filter((id) => /^\d{5,25}$/.test(id));
  } catch {
    return null;
  }
}

/** Revoke a Discord token the bot holds. */
export async function revoke(context: { readonly vars: Vars; readonly fetch: Fetch }, access: string): Promise<void> {
  try {
    await context.fetch(OAUTH_REVOKE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        ...appKeys(context.vars),
        token: access,
        token_type_hint: 'access_token',
      }).toString(),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    // The token expires by itself within a week; a failed revoke leaves nothing the bot holds.
  }
}

/** POST /v1/auth/exchange: the panel collects its sign-in. */
export async function exchange(context: AuthContext, request: Request): Promise<Response> {
  const body = await readJson(request);
  const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return fail('ticket', 400, context.cors);
  const row = await context.database
    .prepare('DELETE FROM panel_tickets WHERE ticket_hash = ? RETURNING user_id, user, created_at, guilds')
    .bind(await sha256Hex(ticket))
    .first<{ user_id: string; user: string; created_at: number; guilds: string | null }>();
  if (!row || context.nowS - Number(row.created_at) > TICKET_KEEP_S) return fail('ticket', 401, context.cors);
  const token = randomToken(32);
  await context.database
    .prepare(
      'INSERT INTO panel_sessions (token_hash, user_id, user, created_at, last_seen, guilds) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(await sha256Hex(token), String(row.user_id), String(row.user), context.nowS, context.nowS, row.guilds ?? null)
    .run();
  return json({ token, user: JSON.parse(String(row.user)) as unknown }, 200, context.cors);
}

/** The panel user a bearer token belongs to, or null when it is unknown, idle too long or too old. */
export async function sessionOf(
  context: { readonly database: Db; readonly nowS: number },
  token: string,
): Promise<{ user: PanelUser; tokenHash: string; guilds: string[] | null } | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await context.database
    .prepare('SELECT user, created_at, last_seen, guilds FROM panel_sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ user: string; created_at: number; last_seen: number; guilds: string | null }>();
  if (!row) return null;
  const idle = context.nowS - Number(row.last_seen);
  if (idle > SESSION_IDLE_S || context.nowS - Number(row.created_at) > SESSION_MAX_S) {
    await context.database.prepare('DELETE FROM panel_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  if (idle > SEEN_EVERY_S)
    await context.database
      .prepare('UPDATE panel_sessions SET last_seen = ? WHERE token_hash = ?')
      .bind(context.nowS, tokenHash)
      .run();
  const guilds = row.guilds ? (JSON.parse(String(row.guilds)) as unknown) : null;
  return {
    user: JSON.parse(String(row.user)) as PanelUser,
    tokenHash,
    guilds: Array.isArray(guilds) ? guilds.map(String) : null,
  };
}

/** POST /v1/auth/logout. */
export async function logout(
  context: { readonly database: Db; readonly cors: HeaderSet },
  tokenHash: string,
): Promise<Response> {
  await context.database.prepare('DELETE FROM panel_sessions WHERE token_hash = ?').bind(tokenHash).run();
  return json({ ok: true }, 200, context.cors);
}

/** For tests: forget the per-isolate sign-in counts. */
export const resetStarts = (): void => starts.clear();
