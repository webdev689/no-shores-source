/**
 * The player's controls kept with their account: `GET /v1/binds` answers what they bound (null for none yet), and
 * `PUT /v1/binds` keeps what they send. Only what differs from the game's defaults is kept, checked against the
 * game's own table of controls: a control or a key the game does not know is left out, as a page of another build may
 * send one, and a body that is no object of controls is refused.
 */

import { readOverrides } from '../../client/src/player/binds.ts';
import type { Db } from './database.ts';
import { type AccountRow, bodyOf, json, refused } from './http.ts';

/** The most a body of binds may hold, in bytes: every control bound anew to three of the longest names on the keys and
 *  on the pad is under three quarters of it. */
export const BINDS_MOST = 8192;

/** Answers `GET` or `PUT /v1/binds` for `account`. */
export async function bindsAsk(request: Request, database: Db, account: AccountRow, now: number): Promise<Response> {
  if (request.method === 'GET') {
    const kept = await database
      .prepare('SELECT body FROM binds WHERE account_id = ?1')
      .bind(account.id)
      .first<{ body: string }>();
    return json({ binds: kept ? (JSON.parse(kept.body) as unknown) : null });
  }
  const binds = readOverrides((await bodyOf(request, BINDS_MOST))?.['binds']);
  if (!binds) return refused(400, 'Those controls are not ones the game knows.');
  await database
    .prepare(
      `INSERT INTO binds (account_id, body, saved_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (account_id) DO UPDATE SET body = ?2, saved_at = ?3`,
    )
    .bind(account.id, JSON.stringify(binds), now)
    .run();
  return json({ ok: true });
}
