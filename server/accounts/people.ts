/**
 * Players as the Roster shows them: their name, their guild's tag, the emblem they wear and their level (from what
 * their room kept of them), and where they play now: the room that holds their character, or the room that last said
 * they were there (the sea). And the blocks between two players.
 */

import type { Db } from './database.ts';

/** How long a player not playing stays in a company. */
export const AWAY_MS = 10 * 60_000;
/** How long a room's word that a player is there lasts: twice how often it says so. */
export const PRESENCE_MS = 60_000;

/** A player as the Roster shows them. `place` is the room they play in, or null while they do not. */
export interface Person {
  readonly name: string;
  readonly tag: string | null;
  readonly emblem: string | null;
  readonly level: number | null;
  readonly place: string | null;
}

/** A player's row: their account's id and how they are shown. */
export interface PersonRow extends Person {
  readonly id: string;
}

/** The columns and joins that show a player; `?2` is now. A held character's room is its holder's name before `:`. */
export const PERSON = `SELECT accounts.id, accounts.username AS name, guilds.tag AS tag,
  json_extract(characters.body, '$.shown.emblem') AS emblem, json_extract(characters.body, '$.shown.level') AS level,
  CASE WHEN characters.held_until > ?2 THEN substr(characters.holder, 1, instr(characters.holder, ':') - 1)
       WHEN presence.until > ?2 THEN presence.room END AS place
  FROM accounts
  LEFT JOIN characters ON characters.account_id = accounts.id
  LEFT JOIN presence ON presence.account_id = accounts.id
  LEFT JOIN guild_members ON guild_members.account_id = accounts.id
  LEFT JOIN guilds ON guilds.id = guild_members.guild_id`;

/** When a player was last seen playing: their character's last save, or a room's last word that they were there. */
export const LAST_SEEN = `max(coalesce((SELECT saved_at FROM characters WHERE account_id = accounts.id), 0),
  coalesce((SELECT until - ${PRESENCE_MS} FROM presence WHERE account_id = accounts.id), 0),
  coalesce((SELECT held_until FROM characters WHERE account_id = accounts.id), 0))`;

/** A person without their account's id. */
export const shown = ({ name, tag, emblem, level, place }: PersonRow): Person => ({ name, tag, emblem, level, place });

/** The account holding a username, however it is typed; null for a name no account holds or none at all. */
export async function accountNamed(database: Db, name: unknown): Promise<{ id: string; username: string } | null> {
  if (typeof name !== 'string' || name.length > 40) return null;
  return database
    .prepare('SELECT id, username FROM accounts WHERE username_key = ?1')
    .bind(name.toLowerCase())
    .first<{ id: string; username: string }>();
}

/** The username an account keeps; null for a guest. */
export async function usernameOf(database: Db, account: string): Promise<string | null> {
  const row = await database
    .prepare('SELECT username FROM accounts WHERE id = ?1')
    .bind(account)
    .first<{ username: string | null }>();
  return row?.username ?? null;
}

/** The accounts `account` blocks or is blocked by. */
export async function apartFrom(database: Db, account: string): Promise<string[]> {
  const { results } = await database
    .prepare(
      `SELECT blocked_id AS other FROM blocks WHERE blocker_id = ?1
       UNION SELECT blocker_id AS other FROM blocks WHERE blocked_id = ?1 ORDER BY other`,
    )
    .bind(account)
    .all<{ other: string }>();
  return results.map((row) => row.other);
}

/** Whether `blocker` blocks `blocked`. */
export async function blocks(database: Db, blocker: string, blocked: string): Promise<boolean> {
  const found = await database
    .prepare('SELECT 1 AS yes FROM blocks WHERE blocker_id = ?1 AND blocked_id = ?2')
    .bind(blocker, blocked)
    .first<{ yes: number }>();
  return found !== null;
}

/** Notes that a player is in a room that keeps no character, for a while, and at sea the water their ship lies in
 *  (the chat's Region); or, with no room, that they left it now. The row stays, to say when they were last seen. */
export async function present(
  database: Db,
  account: string,
  room: string | null,
  now: number,
  water: string | null = null,
): Promise<void> {
  await (
    room === null
      ? database.prepare('UPDATE presence SET until = min(until, ?2) WHERE account_id = ?1').bind(account, now)
      : database
          .prepare(
            `INSERT INTO presence (account_id, room, until, water) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (account_id) DO UPDATE SET room = ?2, until = ?3, water = ?4`,
          )
          .bind(account, room, now + PRESENCE_MS, water)
  ).run();
}
