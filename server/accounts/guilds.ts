/**
 * Guilds, after Destiny's clans: a name, a tag shown in brackets after each member's name, a motto and a banner
 * (`guildFace.ts`). Its founder and admins invite players, who accept or decline; the founder promotes members to admin
 * and demotes them, either removes a member below them, and the founder may hand the founding to an admin. A founder
 * leaves only once another founds it, or alone, which ends it. A player is in one guild at most, which holds a hundred.
 */

import { bannerFrom, bannerOfName, bannerRefusal } from '../../client/src/game/guild/bannerLaw.ts';
import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import { faceAsk, guildPage, type KeptGuild } from './guildFace.ts';
import { countFromJoining, weekRead } from './guildWeeks.ts';
import { refusalOf, skeleton } from './names.ts';
import { accountNamed, blocks } from './people.ts';

/** The most members a guild holds, as Destiny's clans do. */
export const GUILD_MOST = 100;
/** The ranks: its founder, an admin, a member. */
export const RANKS = ['Founder', 'Admin', 'Member'] as const;
const [FOUNDER, ADMIN, MEMBER] = [0, 1, 2];
/** How long an invite unanswered is kept. */
const INVITE_KEPT_MS = 30 * 24 * 60 * 60_000;

/** A player's guild and rank in it, or null for none. */
export async function guildOf(database: Db, account: string): Promise<KeptGuild | null> {
  return database
    .prepare(
      `SELECT guilds.id, guilds.name, guilds.tag, guilds.motto, guilds.description, guilds.banner, guilds.xp,
       guild_members.rank FROM guild_members JOIN guilds ON guilds.id = guild_members.guild_id
       WHERE guild_members.account_id = ?1`,
    )
    .bind(account)
    .first<KeptGuild>();
}

/** Founds a guild with its founder its one member, under the banner they chose or, with none, the one its name draws. */
async function found(database: Db, own: string, given: Record<string, unknown> | null, now: number): Promise<Answer> {
  const [name, tag] = [given?.['name'], given?.['tag']];
  const unfit = refusalOf('guild', name) ?? refusalOf('tag', tag);
  if (unfit) return said(400, unfit);
  const chosen = given?.['banner'] === undefined ? bannerOfName(String(name)) : bannerFrom(given['banner']);
  const badBanner = chosen ? bannerRefusal(chosen, 1) : 'That is not a banner.';
  if (badBanner) return said(400, badBanner);
  if (await guildOf(database, own)) return said(409, 'Leave your guild first.');
  const [id, look] = [crypto.randomUUID(), skeleton(String(name))];
  const made = await database
    .prepare(
      `INSERT OR IGNORE INTO guilds (id, name, name_key, tag, tag_key, created_at, banner)
       VALUES (?1, ?2, ?5, ?3, lower(?3), ?4, ?6)`,
    )
    .bind(id, name, String(tag).toUpperCase(), now, look, JSON.stringify(chosen))
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
  await countFromJoining(database, own);
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
  await countFromJoining(database, own);
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
    // They leave only at the rank read, and a founder only alone, so a founding handed to them meanwhile never
    // leaves the guild with none; it ends only while no one is left in it.
    const [gone] = await database.batch([
      database
        .prepare(
          `DELETE FROM guild_members WHERE account_id = ?1 AND guild_id = ?2 AND rank = ?3 AND (rank <> ${FOUNDER}
           OR NOT EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ?2 AND account_id <> ?1))`,
        )
        .bind(own, mine.id, mine.rank),
      database
        .prepare('DELETE FROM guilds WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM guild_members WHERE guild_id = ?1)')
        .bind(mine.id),
    ]);
    return gone?.meta.changes === 1 ? done : said(409, 'That changed as you asked. Look again.');
  }
  /** SQL that holds while the asker (?1) is in their guild (?2) at a rank so. */
  const asker = (rank: string) =>
    `EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?1 AND guild_id = ?2 AND rank ${rank})`;
  /** Runs a write whose parameters are the asker, their guild, then `values`: answers the rows it changed. */
  const guarded = async (sql: string, ...values: unknown[]) =>
    (
      await database
        .prepare(sql)
        .bind(own, mine.id, ...values)
        .run()
    ).meta.changes;
  const face = await faceAsk(database, own, asked, given, mine);
  if (face) return face;
  if (asked === 'motto') {
    const motto = given?.['motto'];
    if (mine.rank > ADMIN) return said(403, 'Only the founder and admins can set the motto.');
    const unfit = refusalOf('motto', motto);
    if (unfit) return said(400, unfit);
    const set = await guarded(
      `UPDATE guilds SET motto = ?3 WHERE id = ?2 AND ${asker(`<= ${ADMIN}`)}`,
      String(motto).trim(),
    );
    return set === 1 ? done : said(403, 'Only the founder and admins can set the motto.');
  }
  const them = await accountNamed(database, given?.['name']);
  if (!them || them.id === own) return said(404, 'No one by that name is there.');
  if (asked === 'invite' || asked === 'uninvite') {
    if (mine.rank > ADMIN) return said(403, 'Only the founder and admins can invite.');
    const refused = said(403, 'Only the founder and admins can invite.');
    if (asked === 'uninvite') {
      const taken = await guarded(
        `DELETE FROM guild_invites WHERE guild_id = ?2 AND account_id = ?3 AND ${asker(`<= ${ADMIN}`)}`,
        them.id,
      );
      return taken === 1 ? done : refused;
    }
    if (await blocks(database, own, them.id)) return said(409, 'Unblock them first.');
    if (await guildOf(database, them.id)) return said(409, 'They are in a guild already.');
    if (((await members())?.count ?? 0) >= GUILD_MOST) return said(409, 'Your guild is full.');
    // An invite to one who blocks the inviter is answered as sent, and never reaches them.
    if (await blocks(database, them.id, own)) return done;
    const [, sent] = await database.batch([
      database.prepare('DELETE FROM guild_invites WHERE created_at < ?1').bind(now - INVITE_KEPT_MS),
      database
        .prepare(
          `INSERT INTO guild_invites (guild_id, account_id, from_id, created_at) SELECT ?2, ?3, ?1, ?4
           WHERE ${asker(`<= ${ADMIN}`)} AND (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?2) < ${GUILD_MOST}
           ON CONFLICT (guild_id, account_id) DO UPDATE SET from_id = ?1, created_at = ?4`,
        )
        .bind(own, mine.id, them.id, now),
    ]);
    if (sent?.meta.changes === 1) return done;
    return ((await members())?.count ?? 0) >= GUILD_MOST ? said(409, 'Your guild is full.') : refused;
  }
  const theirs = await guildOf(database, them.id);
  if (theirs?.id !== mine.id) return said(404, 'They are not in your guild.');
  // Each write holds only while they are still in this guild at the rank read, and the asker still above them.
  const setRank = async (rank: number) =>
    (await guarded(
      `UPDATE guild_members SET rank = ?5 WHERE account_id = ?3 AND guild_id = ?2 AND rank = ?4
       AND ${asker(`= ${FOUNDER}`)}`,
      them.id,
      theirs.rank,
      rank,
    )) === 1;
  switch (asked) {
    case 'remove': {
      const refused = said(403, 'You can remove only those below you.');
      if (mine.rank > ADMIN || theirs.rank <= mine.rank) return refused;
      const removed = await guarded(
        `DELETE FROM guild_members WHERE account_id = ?3 AND guild_id = ?2 AND rank = ?4
         AND ${asker(`<= ${ADMIN} AND rank < ?4`)}`,
        them.id,
        theirs.rank,
      );
      return removed === 1 ? done : refused;
    }
    case 'promote': {
      const refused = said(403, 'The founder makes members admins.');
      if (mine.rank !== FOUNDER || theirs.rank !== MEMBER) return refused;
      return (await setRank(ADMIN)) ? done : refused;
    }
    case 'demote': {
      const refused = said(403, 'The founder makes admins members.');
      if (mine.rank !== FOUNDER || theirs.rank !== ADMIN) return refused;
      return (await setRank(MEMBER)) ? done : refused;
    }
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

/** The player's guild as the Guild tab shows it, with its members counted, or null in none. */
export async function guildRead(database: Db, own: string, now: number) {
  const mine = await guildOf(database, own);
  if (!mine) return { guild: null };
  const counted = await database
    .prepare('SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = ?1')
    .bind(mine.id)
    .first<{ count: number }>();
  return { guild: { ...guildPage(mine, counted?.count ?? 1, now), ...(await weekRead(database, mine.id, own, now)) } };
}
