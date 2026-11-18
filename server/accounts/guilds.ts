/**
 * Guilds, after Destiny's clans: a name, a tag shown in brackets after each member's name, and a motto. Its founder
 * and admins invite players, who accept or decline; the founder promotes members to admin and demotes them, either
 * removes a member below them, and the founder may hand the founding to an admin. A founder leaves only once another
 * founds it, or alone, which ends it. A player is in one guild at most, which holds a hundred.
 */

import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import { refusalOf, skeleton } from './names.ts';
import { accountNamed, blocks } from './people.ts';

/** The most members a guild holds, as Destiny's clans do. */
export const GUILD_MOST = 100;
/** The ranks: its founder, an admin, a member. */
export const RANKS = ['Founder', 'Admin', 'Member'] as const;
const [FOUNDER, ADMIN, MEMBER] = [0, 1, 2];

/** A player's guild and rank in it, or null for none. */
export async function guildOf(
  database: Db,
  account: string,
): Promise<{ id: string; name: string; tag: string; motto: string; rank: number } | null> {
  return database
    .prepare(
      `SELECT guilds.id, guilds.name, guilds.tag, guilds.motto, guild_members.rank FROM guild_members
       JOIN guilds ON guilds.id = guild_members.guild_id WHERE guild_members.account_id = ?1`,
    )
    .bind(account)
    .first<{ id: string; name: string; tag: string; motto: string; rank: number }>();
}

/** Founds a guild with its founder its one member. */
async function found(database: Db, own: string, given: Record<string, unknown> | null, now: number): Promise<Answer> {
  const [name, tag] = [given?.['name'], given?.['tag']];
  const unfit = refusalOf('guild', name) ?? refusalOf('tag', tag);
  if (unfit) return said(400, unfit);
  if (await guildOf(database, own)) return said(409, 'Leave your guild first.');
  const [id, look] = [crypto.randomUUID(), skeleton(String(name))];
  const made = await database
    .prepare(
      `INSERT OR IGNORE INTO guilds (id, name, name_key, tag, tag_key, created_at)
       VALUES (?1, ?2, ?5, ?3, lower(?3), ?4)`,
    )
    .bind(id, name, String(tag).toUpperCase(), now, look)
    .run();
  if (made.meta.changes !== 1) {
    const like = await database
      .prepare('SELECT lower(name) = lower(?2) AS same FROM guilds WHERE name_key = ?1')
      .bind(look, name)
      .first<{ same: number }>();
    return said(409, like?.same === 0 ? "That name is too like another guild's." : 'That name or tag is taken.');
  }
  const joined = await database
    .prepare('INSERT OR IGNORE INTO guild_members (account_id, guild_id, rank, joined_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(own, id, FOUNDER, now)
    .run();
  if (joined.meta.changes !== 1) {
    await database.prepare('DELETE FROM guilds WHERE id = ?1').bind(id).run();
    return said(409, 'Leave your guild first.');
  }
  await database.prepare('DELETE FROM guild_invites WHERE account_id = ?1').bind(own).run();
  return done;
}

/** Answers an invite to the guild by its tag: accepted, it joins them if they are in no guild and it has room. */
async function answer(database: Db, own: string, tag: unknown, accept: boolean, now: number): Promise<Answer> {
  const guild =
    typeof tag === 'string'
      ? await database
          .prepare('SELECT id FROM guilds WHERE tag_key = ?1')
          .bind(tag.toLowerCase())
          .first<{ id: string }>()
      : null;
  const taken = guild
    ? await database
        .prepare('DELETE FROM guild_invites WHERE guild_id = ?1 AND account_id = ?2 RETURNING guild_id')
        .bind(guild.id, own)
        .first<{ guild_id: string }>()
    : null;
  if (!accept) return done;
  if (!guild || !taken) return said(404, 'That invite is gone.');
  if (await guildOf(database, own)) return said(409, 'Leave your guild first.');
  const joined = await database
    .prepare(
      `INSERT OR IGNORE INTO guild_members (account_id, guild_id, rank, joined_at) SELECT ?1, ?2, ?3, ?4
       WHERE (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?2) < ${GUILD_MOST}`,
    )
    .bind(own, guild.id, MEMBER, now)
    .run();
  if (joined.meta.changes !== 1) return said(409, 'That guild is full.');
  await database.prepare('DELETE FROM guild_invites WHERE account_id = ?1').bind(own).run();
  return done;
}

/** What account `own` asks of the guilds: of the player named, where it names one. */
export async function guildAsk(
  database: Db,
  own: string,
  asked: string,
  given: Record<string, unknown> | null,
  now: number,
): Promise<Answer> {
  if (asked === 'found') return found(database, own, given, now);
  if (asked === 'accept' || asked === 'decline') return answer(database, own, given?.['tag'], asked === 'accept', now);
  const mine = await guildOf(database, own);
  if (!mine) return said(404, 'You are in no guild.');
  const members = () =>
    database
      .prepare('SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = ?1')
      .bind(mine.id)
      .first<{ count: number }>();
  if (asked === 'leave') {
    const left = (await members())?.count ?? 1;
    if (mine.rank === FOUNDER && left > 1) return said(409, 'Make an admin the founder first.');
    await database.prepare('DELETE FROM guild_members WHERE account_id = ?1').bind(own).run();
    if (left <= 1) await database.prepare('DELETE FROM guilds WHERE id = ?1').bind(mine.id).run();
    return done;
  }
  if (asked === 'motto') {
    const motto = given?.['motto'];
    if (mine.rank > ADMIN) return said(403, 'Only the founder and admins can set the motto.');
    const unfit = refusalOf('motto', motto);
    if (unfit) return said(400, unfit);
    await database.prepare('UPDATE guilds SET motto = ?1 WHERE id = ?2').bind(String(motto).trim(), mine.id).run();
    return done;
  }
  const them = await accountNamed(database, given?.['name']);
  if (!them || them.id === own) return said(404, 'No one by that name is there.');
  if (asked === 'invite' || asked === 'uninvite') {
    if (mine.rank > ADMIN) return said(403, 'Only the founder and admins can invite.');
    if (asked === 'uninvite') {
      await database
        .prepare('DELETE FROM guild_invites WHERE guild_id = ?1 AND account_id = ?2')
        .bind(mine.id, them.id)
        .run();
      return done;
    }
    if (await blocks(database, own, them.id)) return said(409, 'Unblock them first.');
    if (await guildOf(database, them.id)) return said(409, 'They are in a guild already.');
    if (((await members())?.count ?? 0) >= GUILD_MOST) return said(409, 'Your guild is full.');
    // An invite to one who blocks the inviter is answered as sent, and never reaches them.
    if (await blocks(database, them.id, own)) return done;
    await database
      .prepare(
        `INSERT INTO guild_invites (guild_id, account_id, from_id, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (guild_id, account_id) DO UPDATE SET from_id = ?3, created_at = ?4`,
      )
      .bind(mine.id, them.id, own, now)
      .run();
    return done;
  }
  const theirs = await guildOf(database, them.id);
  if (theirs?.id !== mine.id) return said(404, 'They are not in your guild.');
  const setRank = (rank: number, account: string) =>
    database.prepare('UPDATE guild_members SET rank = ?1 WHERE account_id = ?2').bind(rank, account).run();
  switch (asked) {
    case 'remove':
      if (mine.rank > ADMIN || theirs.rank <= mine.rank) return said(403, 'You can remove only those below you.');
      await database.prepare('DELETE FROM guild_members WHERE account_id = ?1').bind(them.id).run();
      return done;
    case 'promote':
      if (mine.rank !== FOUNDER || theirs.rank !== MEMBER) return said(403, 'The founder makes members admins.');
      await setRank(ADMIN, them.id);
      return done;
    case 'demote':
      if (mine.rank !== FOUNDER || theirs.rank !== ADMIN) return said(403, 'The founder makes admins members.');
      await setRank(MEMBER, them.id);
      return done;
    case 'founder': {
      const refused = said(403, 'The founder hands the founding to an admin.');
      if (mine.rank !== FOUNDER || theirs.rank !== ADMIN) return refused;
      // One write, made only while the asker still founds it and the other is still its admin, so two at once cannot
      // make two founders.
      const handed = await database
        .prepare(
          `UPDATE guild_members SET rank = CASE account_id WHEN ?1 THEN ${ADMIN} ELSE ${FOUNDER} END
           WHERE guild_id = ?3 AND account_id IN (?1, ?2)
           AND EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?1 AND guild_id = ?3 AND rank = ${FOUNDER})
           AND EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?2 AND guild_id = ?3 AND rank = ${ADMIN})`,
        )
        .bind(own, them.id, mine.id)
        .run();
      return handed.meta.changes === 2 ? done : refused;
    }
    default:
      return said(404, 'No such page.');
  }
}
