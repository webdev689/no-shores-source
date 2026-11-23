/**
 * Guilds' weeks, as the accounts keep them. Each character holds its part in its guild's week (the rules' `GuildWeek`:
 * the XP it gave, its counts toward the week's four guild bounties, and its claims). As a room saves a member's
 * character, what came since their record was last counted goes to their guild: its XP to the guild's, its counts to
 * the guild's week. A count reaching its bounty's target marks the bounty done, which pays the guild its XP once. Joining
 * a guild counts the record as it stands, so nothing done before it is given. The rooms read here which bounties a
 * member's guild has done, and whether they joined before the week turned.
 */

import { BOUNTY_XP, GUILD_BOUNTIES, bountiesOf, weekOf, weekStart } from '../../client/src/game/guild/guildLaw.ts';
import { boonsOf } from '../../client/src/game/guild/outpostLaw.ts';
import type { Db } from './database.ts';
import { plotOf } from './outpostStores.ts';
import { randomToken } from './secrets.ts';

/** The week's four guild bounties, by slot. */
const SLOTTED = [0, 1, 2, 3] as const;

/** A character's guild record as the rules keep it: the week, the XP given, and the counts toward its bounties. */
interface GuildRecord {
  readonly week: number;
  readonly given: number;
  readonly counts: readonly number[];
  readonly claimed?: readonly boolean[];
}

/** A record read from a character's kept text or a member's counted part, or null when there is none. */
function recordOf(text: string | null | undefined): GuildRecord | null {
  try {
    const value = JSON.parse(text ?? '') as Partial<GuildRecord> | null;
    const week = value?.week;
    const counts = Array.isArray(value?.counts) ? value.counts : [];
    if (typeof week !== 'number' || typeof value?.given !== 'number') return null;
    return {
      week,
      given: value.given,
      counts: SLOTTED.map((slot) => Number(counts[slot]) || 0),
      claimed: value.claimed,
    };
  } catch {
    return null;
  }
}

/** A character's guild record from its kept body. */
export function recordOfBody(body: string | null): GuildRecord | null {
  try {
    const guild = (JSON.parse(body ?? '') as { guild?: unknown } | null)?.guild;
    return guild ? recordOf(JSON.stringify(guild)) : null;
  } catch {
    return null;
  }
}

/** What a member's record added since it was last counted: all of a later week, none of an earlier one. */
function since(record: GuildRecord, counted: GuildRecord | null): { given: number; counts: number[] } {
  if (counted && record.week < counted.week) return { given: 0, counts: [0, 0, 0, 0] };
  const before = counted?.week === record.week ? counted : null;
  const less = (now: number, then: number) => Math.max(0, now - then);
  return {
    given: less(record.given, before?.given ?? 0),
    counts: SLOTTED.map((slot) => less(record.counts[slot] ?? 0, before?.counts[slot] ?? 0)),
  };
}

/** Counts a member's record as it stands as they join, so only what they do after goes to the guild. */
export async function countFromJoining(database: Db, account: string): Promise<void> {
  await database
    .prepare(
      `UPDATE guild_members SET counted = COALESCE((SELECT json_extract(body, '$.guild') FROM characters
       WHERE account_id = ?1), '') WHERE account_id = ?1`,
    )
    .bind(account)
    .run();
}

/** Gives a member's guild what their saved character's record added since it was last counted, in one write: none
 *  of it if another save counted it meanwhile. Then marks each of that week's bounties done whose count reached its
 *  target, paying the guild each one's XP once. */
export async function creditGuild(database: Db, account: string, body: string): Promise<void> {
  const record = recordOfBody(body);
  if (!record) return;
  const member = await database
    .prepare('SELECT guild_id, counted FROM guild_members WHERE account_id = ?1')
    .bind(account)
    .first<{ guild_id: string; counted: string }>();
  if (!member) return;
  const added = since(record, recordOf(member.counted));
  const counted = JSON.stringify({
    week: record.week,
    given: record.given,
    counts: record.counts,
    mark: randomToken(),
  });
  const guild = member.guild_id;
  const ours = `EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?1 AND counted = ?2)`;
  const targets = bountiesOf(record.week).map((place) => GUILD_BOUNTIES[place]?.target ?? Number.MAX_SAFE_INTEGER);
  const doneSql = SLOTTED.map((slot) => `done${slot} = MAX(done${slot}, count${slot} >= ?${slot + 3})`).join(', ');
  const owed = SLOTTED.map((slot) => `(done${slot} - paid${slot})`).join(' + ');
  const paidSql = SLOTTED.map((slot) => `paid${slot} = done${slot}`).join(', ');
  await database.batch([
    database
      .prepare('UPDATE guild_members SET counted = ?2 WHERE account_id = ?1 AND guild_id = ?3 AND counted = ?4')
      .bind(account, counted, guild, member.counted),
    database
      .prepare(
        `INSERT INTO guild_weeks (guild_id, week, given, count0, count1, count2, count3)
         SELECT ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE ${ours}
         ON CONFLICT (guild_id, week) DO UPDATE SET given = given + excluded.given, count0 = count0 + excluded.count0,
         count1 = count1 + excluded.count1, count2 = count2 + excluded.count2, count3 = count3 + excluded.count3`,
      )
      .bind(account, counted, guild, record.week, added.given, ...added.counts),
    database
      .prepare(`UPDATE guilds SET xp = xp + ?3 WHERE id = ?4 AND ${ours}`)
      .bind(account, counted, added.given, guild),
    database
      .prepare(`UPDATE guild_weeks SET ${doneSql} WHERE guild_id = ?1 AND week = ?2`)
      .bind(guild, record.week, ...targets),
    database
      .prepare(
        `UPDATE guilds SET xp = xp + ?3 * COALESCE((SELECT ${owed} FROM guild_weeks WHERE guild_id = ?1 AND week = ?2),
         0) WHERE id = ?1`,
      )
      .bind(guild, record.week, BOUNTY_XP),
    database.prepare(`UPDATE guild_weeks SET ${paidSql} WHERE guild_id = ?1 AND week = ?2`).bind(guild, record.week),
  ]);
}

/** What a room is told of a player's guild: its id, which of this week's bounties it has done, and whether they were
 *  in it before the week turned; null in no guild. */
export async function guildTold(
  database: Db,
  account: string,
  now: number,
): Promise<{
  id: string;
  done: boolean[];
  beforeTheWeek: boolean;
  boons: { xp: number; aurem: number; reputation: number };
} | null> {
  const week = weekOf(now);
  const row = await database
    .prepare(
      `SELECT guild_members.guild_id, guild_members.joined_at, done0, done1, done2, done3 FROM guild_members
       LEFT JOIN guild_weeks ON guild_weeks.guild_id = guild_members.guild_id AND guild_weeks.week = ?2
       WHERE guild_members.account_id = ?1`,
    )
    .bind(account, week)
    .first<{ guild_id: string; joined_at: number; [done: `done${number}`]: number | null }>();
  if (!row) return null;
  const { results: sites } = await database
    .prepare('SELECT site FROM outposts WHERE guild_id = ?1')
    .bind(row.guild_id)
    .all<{ site: string }>();
  const plots = await Promise.all(sites.map(({ site }) => plotOf(database, row.guild_id, site)));
  return {
    id: row.guild_id,
    done: SLOTTED.map((slot) => row[`done${slot}`] === 1),
    beforeTheWeek: row.joined_at < weekStart(week),
    boons: boonsOf(plots),
  };
}

/** A guild's week as its tab shows it: each of the four bounties drawn with the guild's count and whether it is done,
 *  the XP its members gave, and the player's own part (what they gave, and which they claimed) from their character. */
export async function weekRead(database: Db, guild: string, account: string, now: number) {
  const week = weekOf(now);
  const kept = await database
    .prepare('SELECT * FROM guild_weeks WHERE guild_id = ?1 AND week = ?2')
    .bind(guild, week)
    .first<{ given: number; [part: string]: number }>();
  const body = await database
    .prepare('SELECT body FROM characters WHERE account_id = ?1')
    .bind(account)
    .first<{ body: string | null }>();
  const own = recordOfBody(body?.body ?? null);
  const mine = own?.week === week ? own : null;
  return {
    given: kept?.given ?? 0,
    bounties: bountiesOf(week).map((place, slot) => {
      const bounty = GUILD_BOUNTIES[place];
      return {
        name: bounty?.name ?? '',
        words: bounty?.words ?? '',
        target: bounty?.target ?? 0,
        together: bounty?.together ?? false,
        count: Math.min(kept?.[`count${slot}`] ?? 0, bounty?.target ?? 0),
        done: kept?.[`done${slot}`] === 1,
        claimed: mine?.claimed?.[slot] === true,
      };
    }),
    contribution: mine?.given ?? 0,
  };
}
