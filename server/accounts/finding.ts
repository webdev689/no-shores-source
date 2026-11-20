/**
 * Find a Company: the runs found for players who searched together. A group found is no company: the accounts keep
 * whom each run was found for (`found_runs`), and that run's room lets them in together, for that run alone.
 */

import type { Db } from './database.ts';

/** How long the accounts keep whom a run was found for: a day, far past any run. */
export const FOUND_KEPT_MS = 24 * 60 * 60_000;

/** Keeps that `run` was found for `accounts`, so its room lets them in together, forgetting runs found more than
 *  FOUND_KEPT_MS ago; false if it could not be kept. */
export async function foundRun(database: Db, run: string, accounts: readonly string[], now: number): Promise<boolean> {
  try {
    await database
      .prepare('DELETE FROM found_runs WHERE found_at < ?1')
      .bind(now - FOUND_KEPT_MS)
      .run();
    if (accounts.length === 0) return true;
    const rows = accounts.map((_account, index) => `(?1, ?2, ?${index + 3})`).join(', ');
    await database
      .prepare(`INSERT OR REPLACE INTO found_runs (room, found_at, account_id) VALUES ${rows}`)
      .bind(run, now, ...accounts)
      .run();
    return true;
  } catch {
    return false;
  }
}
