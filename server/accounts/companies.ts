/**
 * Companies, after Destiny 1's fireteams: up to three players, one of them its leader. A player alone leads their own. Another
 * joins by an invite, or by asking to, as the leader's privacy allows: anyone, the leader's friends, those invited, or
 * no one. The leader can remove a member or hand the lead on; a leader who leaves hands it to the longest there. A
 * member away from the game ten minutes leaves it.
 */

import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import { AWAY_MS, LAST_SEEN, accountNamed, blocks } from './people.ts';

/** The most players a company holds, as Destiny 1's held for a patrol or a strike. */
export const COMPANY_MOST = 3;
/** How long an invite stands. */
export const INVITE_MS = 10 * 60_000;
/** Who may join: anyone, the leader's friends, those invited, no one. */
export const PRIVACIES = ['Public', 'Friends Only', 'Invite Only', 'Closed'] as const;

/** A player's company: its id, leader and members, longest there first; null for a player alone. */
export async function companyOf(
  database: Db,
  account: string,
): Promise<{ id: string; leader: string; members: string[] } | null> {
  const company = await database
    .prepare(
      `SELECT companies.id, companies.leader_id AS leader FROM company_members
       JOIN companies ON companies.id = company_members.company_id WHERE company_members.account_id = ?1`,
    )
    .bind(account)
    .first<{ id: string; leader: string }>();
  if (!company) return null;
  const { results } = await database
    .prepare('SELECT account_id FROM company_members WHERE company_id = ?1 ORDER BY joined_at, account_id')
    .bind(company.id)
    .all<{ account_id: string }>();
  return { ...company, members: results.map((row) => row.account_id) };
}

/** Takes a player out of their company: a company left with one ends, and a leader who leaves hands the lead to the
 *  longest there. */
async function leave(database: Db, account: string): Promise<void> {
  const company = await companyOf(database, account);
  if (!company) return;
  await database.prepare('DELETE FROM company_members WHERE account_id = ?1').bind(account).run();
  // Each step reads what is left as it runs, so two leaving at once still end a company of one and pass its lead.
  const ended = await database
    .prepare('DELETE FROM companies WHERE id = ?1 AND (SELECT COUNT(*) FROM company_members WHERE company_id = ?1) < 2')
    .bind(company.id)
    .run();
  if (ended.meta.changes === 1) {
    await database.prepare('DELETE FROM company_members WHERE company_id = ?1').bind(company.id).run();
    return;
  }
  await database
    .prepare(
      `UPDATE companies SET leader_id = (SELECT account_id FROM company_members WHERE company_id = ?1
       ORDER BY joined_at, account_id LIMIT 1)
       WHERE id = ?1 AND leader_id NOT IN (SELECT account_id FROM company_members WHERE company_id = ?1)`,
    )
    .bind(company.id)
    .run();
}

/** Whether a block stands either way between `account` and any of `others`. */
async function blockedAmong(database: Db, account: string, others: readonly string[]): Promise<boolean> {
  const found = await database
    .prepare(
      `SELECT 1 AS yes FROM blocks WHERE (blocker_id = ?1 AND blocked_id IN (SELECT value FROM json_each(?2)))
       OR (blocked_id = ?1 AND blocker_id IN (SELECT value FROM json_each(?2))) LIMIT 1`,
    )
    .bind(account, JSON.stringify(others))
    .first<{ yes: number }>();
  return found !== null;
}

/** Said to one who may not join, whether for the leader's privacy or a block, so it tells no one they are blocked. */
const closed = (privacy: number): Answer =>
  said(403, privacy === 1 ? 'Only their friends can join them.' : 'Their company is closed to you.');

/** Who may join the company `leader` leads, as its leader set it. */
export async function privacyOf(database: Db, leader: string): Promise<number> {
  const row = await database
    .prepare('SELECT privacy FROM accounts WHERE id = ?1')
    .bind(leader)
    .first<{ privacy: number }>();
  return row?.privacy ?? 1;
}

/** Lets go of those in a player's company who have been away from the game too long; never the player asking, who is
 *  plainly here. */
export async function keepPresent(database: Db, account: string, now: number): Promise<void> {
  const company = await companyOf(database, account);
  if (!company) return;
  const others = company.members.filter((member) => member !== account);
  const { results } = await database
    .prepare(
      `SELECT accounts.id FROM accounts WHERE accounts.id IN (SELECT value FROM json_each(?1)) AND ${LAST_SEEN} < ?2`,
    )
    .bind(JSON.stringify(others), now - AWAY_MS)
    .all<{ id: string }>();
  for (const { id } of results) await leave(database, id);
}

/** Puts `joining` in the company `host` is in, made for the host if they lead none; false if it is full. Joining
 *  ends the invites the player had sent, which were for a company they no longer lead. */
async function join(database: Db, joining: string, host: string, now: number): Promise<boolean> {
  if ((await companyOf(database, joining))?.members.includes(host)) return true;
  // A full company is refused before the player leaves their own.
  if (((await companyOf(database, host))?.members.length ?? 1) >= COMPANY_MOST) return false;
  await leave(database, joining);
  if (!(await companyOf(database, host))) {
    const id = crypto.randomUUID();
    await database
      .prepare('INSERT INTO companies (id, leader_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(id, host, now)
      .run();
    const made = await database
      .prepare('INSERT OR IGNORE INTO company_members (account_id, company_id, joined_at) VALUES (?1, ?2, ?3)')
      .bind(host, id, now)
      .run();
    // Another joining at once made the host's first: theirs stands.
    if (made.meta.changes === 0) await database.prepare('DELETE FROM companies WHERE id = ?1').bind(id).run();
  }
  const company = await companyOf(database, host);
  if (!company) return false;
  // Counted as it is joined, so two joining at once cannot make it more than full.
  const joined = await database
    .prepare(
      `INSERT OR IGNORE INTO company_members (account_id, company_id, joined_at) SELECT ?1, ?2, ?3
       WHERE (SELECT COUNT(*) FROM company_members WHERE company_id = ?2) < ${COMPANY_MOST}`,
    )
    .bind(joining, company.id, now + 1)
    .run();
  if (joined.meta.changes !== 1) return false;
  await database.prepare('DELETE FROM company_invites WHERE from_id = ?1').bind(joining).run();
  return true;
}

/** What account `own` asks of the companies: of the player named, where it names one. */
export async function companyAsk(
  database: Db,
  own: string,
  asked: string,
  given: Record<string, unknown> | null,
  now: number,
): Promise<Answer> {
  if (asked === 'leave') return (await leave(database, own), done);
  if (asked === 'privacy') {
    const privacy = given?.['privacy'];
    if (typeof privacy !== 'number' || !Number.isInteger(privacy) || privacy < 0 || privacy >= PRIVACIES.length)
      return said(400, 'Choose who may join.');
    await database.prepare('UPDATE accounts SET privacy = ?1 WHERE id = ?2').bind(privacy, own).run();
    return done;
  }
  const them = await accountNamed(database, given?.['name']);
  if (!them || them.id === own) return said(404, 'No one by that name is there.');
  const mine = await companyOf(database, own);
  const leading = !mine || mine.leader === own;
  switch (asked) {
    case 'invite': {
      if (await blocks(database, own, them.id)) return said(409, 'Unblock them first.');
      if (!leading) return said(403, "Only your company's leader can invite.");
      if ((mine?.members.length ?? 1) >= COMPANY_MOST) return said(409, 'Your company is full.');
      if (mine?.members.includes(them.id)) return said(409, 'They are in your company already.');
      // An invite to one who blocks the inviter is answered as sent, and never reaches them.
      if (await blocks(database, them.id, own)) return done;
      await database
        .prepare(
          `INSERT INTO company_invites (from_id, to_id, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (from_id, to_id) DO UPDATE SET created_at = ?3`,
        )
        .bind(own, them.id, now)
        .run();
      return done;
    }
    case 'accept':
    case 'decline': {
      const taken = await database
        .prepare('DELETE FROM company_invites WHERE from_id = ?1 AND to_id = ?2 RETURNING created_at')
        .bind(them.id, own)
        .first<{ created_at: number }>();
      if (asked === 'decline') return done;
      if (!taken || taken.created_at < now - INVITE_MS) return said(404, 'That invite has run out.');
      const theirs = await companyOf(database, them.id);
      if (await blockedAmong(database, own, theirs?.members ?? [them.id]))
        return closed(await privacyOf(database, theirs?.leader ?? them.id));
      return (await join(database, own, them.id, now)) ? done : said(409, 'Their company is full.');
    }
    case 'join': {
      const theirs = await companyOf(database, them.id);
      const leader = theirs?.leader ?? them.id;
      if (theirs?.members.includes(own)) return done;
      const members = theirs?.members ?? [them.id];
      const blocked = await blockedAmong(database, own, members);
      const friends = await database
        .prepare(
          `SELECT 1 AS yes FROM friends WHERE accepted = 1 AND ((asker_id = ?1 AND asked_id = ?2)
           OR (asker_id = ?2 AND asked_id = ?1))`,
        )
        .bind(own, leader)
        .first<{ yes: number }>();
      const invited = await database
        .prepare(
          `SELECT 1 AS yes FROM company_invites WHERE to_id = ?1 AND created_at >= ?2
           AND from_id IN (SELECT value FROM json_each(?3))`,
        )
        .bind(own, now - INVITE_MS, JSON.stringify(members))
        .first<{ yes: number }>();
      const privacy = await privacyOf(database, leader);
      const allowed = !blocked && (privacy === 0 || (privacy === 1 && friends) || (privacy <= 2 && invited));
      if (!allowed) return closed(privacy);
      return (await join(database, own, them.id, now)) ? done : said(409, 'Their company is full.');
    }
    case 'kick':
    case 'lead': {
      if (!mine || mine.leader !== own) return said(403, "Only your company's leader can do that.");
      if (!mine.members.includes(them.id)) return said(404, 'They are not in your company.');
      if (asked === 'kick') await leave(database, them.id);
      else await database.prepare('UPDATE companies SET leader_id = ?1 WHERE id = ?2').bind(them.id, mine.id).run();
      return done;
    }
    default:
      return said(404, 'No such page.');
  }
}
