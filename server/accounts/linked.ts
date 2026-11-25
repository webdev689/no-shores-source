/**
 * A Discord member's linked character, as the Discord bot may show it in its messages: the username others read over
 * the character's head, the level its room kept for others to see (`shown`, as the Roster reads it) and the faction
 * it is pledged to. Nothing else leaves the accounts: no account id, no email, no gear.
 */

import book from '../../content/gear/factions.json' with { type: 'json' };
import type { Db } from './database.ts';

/** What the bot reads of a linked character: `name` null for an account with no username, `level` before a room
 *  first kept it, and `faction` while it is pledged to none. */
export interface LinkedCharacter {
  readonly name: string | null;
  readonly level: number | null;
  readonly faction: string | null;
}

/** The most Discord ids one ask of `linkedPledges` may name: a page of Discord's member list. */
export const PLEDGES_MAX = 1000;

/** A pledge's faction by name; null for none, or for a faction the book does not know. */
const factionNamed = (pledge: unknown): string | null => book.factions.find((each) => each.id === pledge)?.name ?? null;

/** The character of the account `discordId` is linked to; null when it is linked to none. */
export async function linkedCharacter(database: Db, discordId: string): Promise<LinkedCharacter | null> {
  const row = await database
    .prepare(
      `SELECT accounts.username, json_extract(characters.body, '$.shown.level') AS level,
       json_extract(characters.body, '$.allegiance.pledge') AS pledge
       FROM accounts LEFT JOIN characters ON characters.account_id = accounts.id WHERE accounts.discord_id = ?1`,
    )
    .bind(discordId)
    .first<{ username: string | null; level: number | null; pledge: number | null }>();
  if (row === null) return null;
  return { name: row.username, level: row.level, faction: factionNamed(row.pledge) };
}

/**
 * The faction each of these Discord ids' accounts is pledged to, by name, or null for none, so the bot can keep a
 * server's house roles in step. An id linked to no account is left out; more than `PLEDGES_MAX` answer nothing.
 */
export async function linkedPledges(
  database: Db,
  discordIds: readonly string[],
): Promise<Record<string, string | null>> {
  if (discordIds.length > PLEDGES_MAX) return {};
  const rows = await database
    .prepare(
      `SELECT accounts.discord_id AS discord, json_extract(characters.body, '$.allegiance.pledge') AS pledge
       FROM accounts LEFT JOIN characters ON characters.account_id = accounts.id
       WHERE accounts.discord_id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify(discordIds.map(String)))
    .all<{ discord: string; pledge: number | null }>();
  return Object.fromEntries(rows.results.map((row) => [row.discord, factionNamed(row.pledge)]));
}
