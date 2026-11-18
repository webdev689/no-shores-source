/**
 * What every route of the accounts' API shares: answers as JSON open to any page, a request's body read within its
 * limit, a session found from its bearer token, and the counted limits that slow guessing and floods.
 */

import { type Db, SESSION_IDLE_MS } from './database.ts';
import { hashOf } from './secrets.ts';

/** The most a request's body may hold, in bytes: a username and password, or a code and nonce, are far less. */
export const BODY_MOST = 2048;

export const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/json' } });
export const refused = (status: number, why: string): Response => json({ error: why }, status);

export interface AccountRow {
  readonly id: string;
  readonly username: string | null;
  readonly discord_id: string | null;
}

/** Whether one more ask under `key` passes its limit; counts it either way. */
export async function within(
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

/** Said of a session its account has not used in `SESSION_IDLE_MS`. */
export const LAPSED = 'Your sign-in lapsed after 30 days away. Sign in again.';

/** The account a request's bearer token is a session of, seen now; `LAPSED` if it lapsed, which ends it. */
export async function sessionOf(
  request: Request,
  database: Db,
  now: number,
): Promise<AccountRow | typeof LAPSED | null> {
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
export async function signedIn(request: Request, database: Db, now: number): Promise<AccountRow | null> {
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
export async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  const text = await textOf(request);
  if (text === null) return null;
  try {
    const read: unknown = JSON.parse(text);
    return typeof read === 'object' && read !== null ? (read as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
