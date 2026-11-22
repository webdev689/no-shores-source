/**
 * What the chat's hall asks of the accounts' database: who a session's player is, where each player plays (and at sea
 * in which water), whom each is kept apart from by a block, who mutes them, and whom a username names.
 */

import { liveAccount } from './characters.ts';
import type { Db } from './database.ts';
import type { HallDeps } from './chatHall.ts';
import { accountNamed, blocks } from './people.ts';

/** The hall's asks of `database`, at `now`. */
export function hallDeps(database: Db, now: () => number): HallDeps {
  return {
    now,
    async speaker(token) {
      const account = await liveAccount(database, token, now());
      if (account === null) return null;
      const row = await database
        .prepare('SELECT username FROM accounts WHERE id = ?1')
        .bind(account)
        .first<{ username: string | null }>();
      return { account, name: row?.username ?? null };
    },
    async places(accounts) {
      const { results } = await database
        .prepare(
          `SELECT accounts.id AS id,
           CASE WHEN characters.held_until > ?1 THEN substr(characters.holder, 1, instr(characters.holder, ':') - 1)
                WHEN presence.until > ?1 THEN presence.room END AS room,
           CASE WHEN presence.until > ?1 THEN presence.water END AS water
           FROM accounts
           LEFT JOIN characters ON characters.account_id = accounts.id
           LEFT JOIN presence ON presence.account_id = accounts.id
           WHERE accounts.id IN (SELECT value FROM json_each(?2))`,
        )
        .bind(now(), JSON.stringify(accounts))
        .all<{ id: string; room: string | null; water: string | null }>();
      return new Map(results.map((row) => [row.id, { room: row.room, water: row.water }]));
    },
    async apart(account) {
      const { results } = await database
        .prepare(
          `SELECT blocked_id AS other FROM blocks WHERE blocker_id = ?1
           UNION SELECT blocker_id AS other FROM blocks WHERE blocked_id = ?1`,
        )
        .bind(account)
        .all<{ other: string }>();
      return results.map((row) => row.other);
    },
    async mutedBy(account) {
      const { results } = await database
        .prepare('SELECT muter_id AS other FROM mutes WHERE muted_id = ?1')
        .bind(account)
        .all<{ other: string }>();
      return results.map((row) => row.other);
    },
    async named(name) {
      const found = await accountNamed(database, name);
      return found && { account: found.id, name: found.username };
    },
    blocks: (blocker, blocked) => blocks(database, blocker, blocked),
  };
}
