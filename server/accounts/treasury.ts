/**
 * A guild's treasury: Aurem its members put in and its outposts earn, spent only on its outposts, never paid out to a
 * player. Every move is a line in its ledger with the balance after, named by the asking's id, and made in one write
 * with whatever it pays for: the line goes in only while the balance allows it (at least nothing, at most the most),
 * and each write after it holds only while that very line is this ask's, so an ask made twice moves once and pays
 * for nothing twice.
 */

import { TREASURY_MOST } from '../../client/src/game/guild/outpostLaw.ts';
import type { Db, Statement } from './database.ts';
import { randomToken } from './secrets.ts';

/** A write that holds only while the move's line is this ask's: `guard` is the SQL that says so, its parameters
 *  numbered from `from`, and `binds` what they are bound to. */
export type Paid = (guard: (from: number) => string, binds: readonly unknown[]) => Statement;

/** How a move went: made now, made already by the same ask before, or refused as the balance does not allow it. */
export type Moved = 'moved' | 'already' | 'refused';

/** Moves `amount` into a guild's treasury (out of it when less than nothing) for `kind`, in the same write as `paid`,
 *  each of which holds only with the move. */
export async function move(
  database: Db,
  guild: string,
  move: { account: string | null; kind: string; amount: number; rid: string; now: number },
  paid: readonly Paid[] = [],
): Promise<Moved> {
  const mark = randomToken();
  const guard = (from: number) =>
    `EXISTS (SELECT 1 FROM guild_ledger WHERE guild_id = ?${from} AND rid = ?${from + 1} AND mark = ?${from + 2})`;
  const binds = [guild, move.rid, mark] as const;
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO guild_ledger (guild_id, rid, mark, account_id, kind, amount, balance, at)
         SELECT id, ?2, ?3, ?4, ?5, ?6, treasury + ?6, ?7 FROM guilds
         WHERE id = ?1 AND treasury + ?6 >= 0 AND treasury + ?6 <= ?8`,
      )
      .bind(guild, move.rid, mark, move.account, move.kind, move.amount, move.now, TREASURY_MOST),
    database
      .prepare(`UPDATE guilds SET treasury = treasury + ?4 WHERE id = ?1 AND ${guard(1)}`)
      .bind(...binds, move.amount),
    ...paid.map((statement) => statement(guard, binds)),
  ]);
  const line = await database
    .prepare('SELECT mark FROM guild_ledger WHERE guild_id = ?1 AND rid = ?2')
    .bind(guild, move.rid)
    .first<{ mark: string }>();
  return !line ? 'refused' : line.mark === mark ? 'moved' : 'already';
}

/** A guild's treasury and its latest ledger lines, newest first. */
export async function treasuryOf(database: Db, guild: string) {
  const row = await database
    .prepare('SELECT treasury FROM guilds WHERE id = ?1')
    .bind(guild)
    .first<{ treasury: number }>();
  const { results } = await database
    .prepare(
      `SELECT guild_ledger.kind, guild_ledger.amount, guild_ledger.balance, guild_ledger.at, accounts.username AS name
       FROM guild_ledger LEFT JOIN accounts ON accounts.id = guild_ledger.account_id
       WHERE guild_id = ?1 ORDER BY guild_ledger.at DESC, guild_ledger.rowid DESC LIMIT 20`,
    )
    .bind(guild)
    .all<{ kind: string; amount: number; balance: number; at: number; name: string | null }>();
  return { treasury: row?.treasury ?? 0, ledger: results };
}
