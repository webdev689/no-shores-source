/**
 * A guild's treasury: Aurem its members put in and its outposts earn, spent only on its outposts, never paid out to a
 * player. Every move is a line in its ledger with the balance after, named by the asking's id, and made in one write
 * with whatever it pays for. The paid writes go first, the first holding only while no line has this ask's id and the
 * balance allows the move (at least nothing, at most the most), each after it only while the one before changed a row;
 * the line and the balance follow only while the last did. So an ask made twice moves once, and nothing is paid for
 * that did not change; a write before the last that keeps value (a settling) may land alone. A ledger keeps its
 * newest lines.
 */

import { TREASURY_MOST } from '../../client/src/game/guild/outpostLaw.ts';
import type { Db, Statement } from './database.ts';
import { randomToken } from './secrets.ts';

/** The most lines a guild's ledger keeps. */
export const LEDGER_MOST = 200;

/** A write paid for by a move: `guard` is the SQL that says it may change, its parameters numbered from `from`, and
 *  `binds` what they are bound to. */
export type Paid = (guard: (from: number) => string, binds: readonly unknown[]) => Statement;

/** How a move went: made now, made already by the same ask before, or refused as the balance does not allow it. */
export type Moved = 'moved' | 'already' | 'refused';

/** The SQL that holds while a balance moved by `amount` stays within the treasury's bounds. */
const within = (guild: string, amount: string) =>
  `(SELECT treasury FROM guilds WHERE id = ${guild}) + ${amount} BETWEEN 0 AND ${TREASURY_MOST}`;

/** Moves `amount` into a guild's treasury (out of it when less than nothing) for `kind`, in the same write as `paid`,
 *  which change first: answers `stale` when what they would change is not as it was read. An amount of nothing writes
 *  no line. A write the database refuses for a clash with what it holds is stale too. */
export async function move(
  database: Db,
  guild: string,
  move: { account: string | null; kind: string; amount: number; rid: string; now: number },
  paid: readonly Paid[] = [],
): Promise<Moved | 'stale'> {
  const mark = randomToken();
  const first = (from: number) =>
    `NOT EXISTS (SELECT 1 FROM guild_ledger WHERE guild_id = ?${from} AND rid = ?${from + 1})
     AND ${within(`?${from}`, `?${from + 2}`)}`;
  const writes = paid.map((statement, place) =>
    place === 0 ? statement(first, [guild, move.rid, move.amount]) : statement(() => 'changes() = 1', []),
  );
  const lined = move.amount === 0 ? [] : line(database, guild, move, mark, paid.length > 0);
  let written;
  try {
    written = await database.batch([...writes, ...lined]);
  } catch (error) {
    if (/constraint/i.test(String(error))) return 'stale';
    throw error;
  }
  if (move.amount === 0) return written.at(-1)?.meta.changes === 1 ? 'moved' : 'stale';
  // Decided by the balance's own write, never by reading the line back: the prune after it may take the line first.
  if (written[writes.length + 1]?.meta.changes === 1) return 'moved';
  const kept = await database
    .prepare('SELECT 1 AS yes FROM guild_ledger WHERE guild_id = ?1 AND rid = ?2')
    .bind(guild, move.rid)
    .first<{ yes: number }>();
  if (kept) return 'already';
  if (paid.length === 0) return 'refused';
  const balance = await database
    .prepare(`SELECT ${within('?1', '?2')} AS fits`)
    .bind(guild, move.amount)
    .first<{ fits: number }>();
  return balance?.fits === 1 ? 'stale' : 'refused';
}

/** The ledger line, the balance it moves and the oldest lines pruned: the line only after a paid write that changed. */
function line(
  database: Db,
  guild: string,
  move: { account: string | null; kind: string; amount: number; rid: string; now: number },
  mark: string,
  afterPaid: boolean,
): Statement[] {
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO guild_ledger (guild_id, rid, mark, account_id, kind, amount, balance, at)
         SELECT id, ?2, ?3, ?4, ?5, ?6, treasury + ?6, ?7 FROM guilds
         WHERE id = ?1 AND ${within('?1', '?6')}${afterPaid ? ' AND changes() = 1' : ''}`,
      )
      .bind(guild, move.rid, mark, move.account, move.kind, move.amount, move.now),
    database
      .prepare(
        `UPDATE guilds SET treasury = treasury + ?4 WHERE id = ?1
         AND EXISTS (SELECT 1 FROM guild_ledger WHERE guild_id = ?1 AND rid = ?2 AND mark = ?3)`,
      )
      .bind(guild, move.rid, mark, move.amount),
    database
      .prepare(
        `DELETE FROM guild_ledger WHERE guild_id = ?1 AND rowid NOT IN
         (SELECT rowid FROM guild_ledger WHERE guild_id = ?1 ORDER BY at DESC, rowid DESC LIMIT ?2)`,
      )
      .bind(guild, LEDGER_MOST),
  ];
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
