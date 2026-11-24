/**
 * The Roster's routes: the Roster itself, another player's details, and every ask of it: of friends (`friends.ts`),
 * the company (`companies.ts`), the guild (`guilds.ts`), and blocking, muting and reporting a player. Each needs a
 * username, as a player is found by theirs.
 */

import type { Db } from './database.ts';
import { done, friendAsk, said, type Answer } from './friends.ts';
import { guildAsk, guildOf, guildRead } from './guilds.ts';
import { outpostAsk } from './outposts.ts';
import { outpostFor, outpostsRead } from './outpostStores.ts';
import { levelOf } from '../../client/src/game/guild/guildLaw.ts';
import { outpostsAllowed } from '../../client/src/game/guild/outpostLaw.ts';
import { companyAsk } from './companies.ts';
import { accountNamed } from './people.ts';
import { detailsOf, rosterOf } from './roster.ts';

/** Why a player may be reported. */
export const REASONS = ['cheating', 'name', 'abuse', 'other'] as const;
/** The most players one may mute. */
export const MUTES_MOST = 200;

/** Blocks a player, ending what is between them: a friendship or its ask, and invites either way. */
async function block(database: Db, own: string, them: string, now: number): Promise<void> {
  await database
    .prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(own, them, now)
    .run();
  await database
    .prepare('DELETE FROM friends WHERE (asker_id = ?1 AND asked_id = ?2) OR (asker_id = ?2 AND asked_id = ?1)')
    .bind(own, them)
    .run();
  await database
    .prepare('DELETE FROM company_invites WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)')
    .bind(own, them)
    .run();
  await database
    .prepare('DELETE FROM guild_invites WHERE (from_id = ?1 AND account_id = ?2) OR (from_id = ?2 AND account_id = ?1)')
    .bind(own, them)
    .run();
}

/** What account `own` asks by `path` (`friend/ask`, `company/join`, `guild/found`, `block`, ...), with its body. */
export async function socialAsk(
  database: Db,
  own: string,
  path: string,
  given: Record<string, unknown> | null,
  now: number,
): Promise<Answer> {
  const [group = '', asked = ''] = path.split('/');
  if (group === 'friend' && (asked === 'ask' || asked === 'accept' || asked === 'remove'))
    return friendAsk(database, own, asked, given?.['name'], now);
  if (group === 'company') return companyAsk(database, own, asked, given, now);
  if (group === 'guild') return guildAsk(database, own, asked, given, now);
  if (group === 'outpost') {
    const guild = await guildOf(database, own);
    return guild ? outpostAsk(database, own, guild, asked, given ?? {}, now) : said(404, 'You are in no guild.');
  }
  // Blocking, muting and reporting take nothing after them, so no other path escapes their limit.
  if (asked !== '') return said(404, 'No such page.');
  const them = await accountNamed(database, given?.['name']);
  if (!them || them.id === own) return said(404, 'No one by that name is there.');
  switch (group) {
    case 'block':
      await block(database, own, them.id, now);
      return done;
    case 'unblock':
      await database.prepare('DELETE FROM blocks WHERE blocker_id = ?1 AND blocked_id = ?2').bind(own, them.id).run();
      return done;
    case 'mute': {
      // One statement counts and adds, so two asks at once cannot pass the most; one muted already is done.
      const added = await database
        .prepare(
          `INSERT OR IGNORE INTO mutes (muter_id, muted_id, created_at) SELECT ?1, ?2, ?3
           WHERE (SELECT count(*) FROM mutes WHERE muter_id = ?1) < ?4`,
        )
        .bind(own, them.id, now, MUTES_MOST)
        .run();
      if (added.meta.changes === 0) {
        const muted = await database
          .prepare('SELECT 1 AS yes FROM mutes WHERE muter_id = ?1 AND muted_id = ?2')
          .bind(own, them.id)
          .first<{ yes: number }>();
        if (!muted) return said(409, `You mute ${MUTES_MOST} players already.`);
      }
      return done;
    }
    case 'unmute':
      await database.prepare('DELETE FROM mutes WHERE muter_id = ?1 AND muted_id = ?2').bind(own, them.id).run();
      return done;
    case 'report': {
      const reason = given?.['reason'];
      if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason))
        return said(400, 'Choose why.');
      await database
        .prepare('INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(own, them.id, reason, now)
        .run();
      return done;
    }
    default:
      return said(404, 'No such page.');
  }
}

/** The Roster, the player's guild as its tab shows it, or another player's details. */
export async function socialRead(database: Db, own: string, path: string, now: number): Promise<Answer> {
  if (path === 'roster') return { status: 200, body: await rosterOf(database, own, now) };
  if (path === 'guild') return { status: 200, body: await guildRead(database, own, now) };
  if (path === 'outposts') {
    const guild = await guildOf(database, own);
    if (!guild) return said(404, 'You are in no guild.');
    return { status: 200, body: await outpostsRead(database, own, guild.id, outpostsAllowed(levelOf(guild.xp)), now) };
  }
  // An outpost's plot by its room, for anyone standing in it to draw: members and their company alike.
  const room = /^outposts\/(node-[a-z0-9-]+)$/.exec(path)?.[1];
  if (room) return { status: 200, body: { outpost: await outpostFor(database, room) } };
  const name = /^players\/([A-Za-z0-9_]{1,20})$/.exec(path)?.[1];
  const details = name ? await detailsOf(database, own, name, now) : null;
  return details ? { status: 200, body: details } : said(404, 'No one by that name is there.');
}
