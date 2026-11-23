/**
 * A guild's face and its page. Its founder and admins set its banner, by the banner law the page's editor keeps, and
 * its description; each write holds only while the asker still has that rank, read inside the write itself, so one
 * demoted a moment before cannot. The Guild tab reads the guild here: its name and words, its banner, its level and
 * what brings the next.
 */

import { type Banner, bannerFrom, bannerOfName, bannerRefusal } from '../../client/src/game/guild/bannerLaw.ts';
import { levelOf, nextLevelXp, LEVELS, weekOf, weekStart } from '../../client/src/game/guild/guildLaw.ts';
import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import { guildKey } from './outpostStores.ts';
import { refusalOf } from './names.ts';

/** The most a founder or admin may hold of the guild's ranks: the founder 0, an admin 1. */
const ADMIN = 1;

/** A guild as its own members read it. */
export interface KeptGuild {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly motto: string;
  readonly description: string;
  readonly banner: string;
  readonly xp: number;
  readonly rank: number;
}

/** A guild's banner as kept, or the one its name draws while it keeps none (or one no longer read). */
export function keptBanner(kept: string, name: string): Banner {
  try {
    return bannerFrom(JSON.parse(kept)) ?? bannerOfName(name);
  } catch {
    return bannerOfName(name);
  }
}

/** The write a founder or admin of this guild makes, holding only while they still are one. */
function byAdmin(database: Db, set: string, value: string, own: string, guild: string) {
  return database
    .prepare(
      `UPDATE guilds SET ${set} = ?1 WHERE id = ?2 AND EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?3
       AND guild_id = ?2 AND rank <= ${ADMIN})`,
    )
    .bind(value, guild, own)
    .run();
}

/** What a member asks of their guild's face: its banner or its description; null for any other ask. */
export async function faceAsk(
  database: Db,
  own: string,
  asked: string,
  given: Record<string, unknown> | null,
  guild: KeptGuild,
): Promise<Answer | null> {
  if (asked !== 'banner' && asked !== 'description') return null;
  if (guild.rank > ADMIN) return said(403, `Only the founder and admins can set the ${asked}.`);
  if (asked === 'banner') {
    const banner = bannerFrom(given?.['banner']);
    if (!banner) return said(400, 'That is not a banner.');
    const refusal = bannerRefusal(banner, levelOf(guild.xp));
    if (refusal) return said(400, refusal);
    const written = await byAdmin(database, 'banner', JSON.stringify(banner), own, guild.id);
    return written.meta.changes === 1 ? done : said(403, 'Only the founder and admins can set the banner.');
  }
  const words = given?.['description'];
  const unfit = refusalOf('description', words);
  if (unfit) return said(400, unfit);
  const written = await byAdmin(database, 'description', String(words).trim(), own, guild.id);
  return written.meta.changes === 1 ? done : said(403, 'Only the founder and admins can set the description.');
}

/** The Guild tab's own read of the player's guild: its face, its level and the XP to the next, the week, and the key
 *  its outposts' rooms are named by. */
export function guildPage(guild: KeptGuild, members: number, now: number) {
  const level = levelOf(guild.xp);
  const week = weekOf(now);
  return {
    key: guildKey(guild.id),
    name: guild.name,
    tag: guild.tag,
    motto: guild.motto,
    description: guild.description,
    banner: keptBanner(guild.banner, guild.name),
    rank: guild.rank,
    members,
    level,
    xp: guild.xp,
    levelXp: LEVELS[level - 1] ?? 0,
    nextXp: nextLevelXp(guild.xp),
    week,
    weekEnds: weekStart(week + 1),
  };
}
