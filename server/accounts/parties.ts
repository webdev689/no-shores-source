/**
 * Parties, after Destiny 1's fireteams: up to three players, one of them its leader. A player alone leads their own. Another
 * joins by an invite, or by asking to, as the leader's privacy allows: anyone, the leader's friends, those invited, or
 * no one. The leader can remove a member or hand the lead on; a leader who leaves hands it to the longest there. A
 * member away from the game ten minutes leaves it.
 */

import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import { AWAY_MS, LAST_SEEN, accountNamed, blocks } from './people.ts';

/** The most players a party holds, as Destiny 1's fireteam held for a patrol or a strike. */
export const PARTY_MOST = 3;
/** How long an invite stands. */
export const INVITE_MS = 10 * 60_000;
/** Who may join: anyone, the leader's friends, those invited, no one. */
export const PRIVACIES = ['Public', 'Friends Only', 'Invite Only', 'Closed'] as const;

/** A player's party: its id, leader and members, longest there first; null for a player alone. */
export async function partyOf(
  database: Db,
  account: string,
): Promise<{ id: string; leader: string; members: string[] } | null> {
  const party = await database
    .prepare(
      `SELECT parties.id, parties.leader_id AS leader FROM party_members
       JOIN parties ON parties.id = party_members.party_id WHERE party_members.account_id = ?1`,
    )
    .bind(account)
    .first<{ id: string; leader: string }>();
  if (!party) return null;
  const { results } = await database
    .prepare('SELECT account_id FROM party_members WHERE party_id = ?1 ORDER BY joined_at, account_id')
    .bind(party.id)
    .all<{ account_id: string }>();
  return { ...party, members: results.map((row) => row.account_id) };
}

/** Takes a player out of their party: a party left with one ends, and a leader who leaves hands the lead to the
 *  longest there. */
async function leave(database: Db, account: string): Promise<void> {
  const party = await partyOf(database, account);
  if (!party) return;
  const rest = party.members.filter((member) => member !== account);
  await database.prepare('DELETE FROM party_members WHERE account_id = ?1').bind(account).run();
  if (rest.length < 2) {
    await database.prepare('DELETE FROM parties WHERE id = ?1').bind(party.id).run();
    await database.prepare('DELETE FROM party_members WHERE party_id = ?1').bind(party.id).run();
  } else if (party.leader === account) {
    await database.prepare('UPDATE parties SET leader_id = ?1 WHERE id = ?2').bind(rest[0], party.id).run();
  }
}

/** Lets go of those in a player's party who have been away from the game too long; never the player asking, who is
 *  plainly here. */
export async function keepPresent(database: Db, account: string, now: number): Promise<void> {
  const party = await partyOf(database, account);
  if (!party) return;
  const others = party.members.filter((member) => member !== account);
  const { results } = await database
    .prepare(
      `SELECT accounts.id FROM accounts WHERE accounts.id IN (SELECT value FROM json_each(?1)) AND ${LAST_SEEN} < ?2`,
    )
    .bind(JSON.stringify(others), now - AWAY_MS)
    .all<{ id: string }>();
  for (const { id } of results) await leave(database, id);
}

/** Puts `joining` in the party `host` is in, made for the host if they lead none; false if it is full. */
async function join(database: Db, joining: string, host: string, now: number): Promise<boolean> {
  if ((await partyOf(database, joining))?.members.includes(host)) return true;
  await leave(database, joining);
  if (!(await partyOf(database, host))) {
    const id = crypto.randomUUID();
    await database
      .prepare('INSERT INTO parties (id, leader_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(id, host, now)
      .run();
    const made = await database
      .prepare('INSERT OR IGNORE INTO party_members (account_id, party_id, joined_at) VALUES (?1, ?2, ?3)')
      .bind(host, id, now)
      .run();
    // Another joining at once made the host's first: theirs stands.
    if (made.meta.changes === 0) await database.prepare('DELETE FROM parties WHERE id = ?1').bind(id).run();
  }
  const party = await partyOf(database, host);
  if (!party) return false;
  // Counted as it is joined, so two joining at once cannot make it more than full.
  const joined = await database
    .prepare(
      `INSERT OR IGNORE INTO party_members (account_id, party_id, joined_at) SELECT ?1, ?2, ?3
       WHERE (SELECT COUNT(*) FROM party_members WHERE party_id = ?2) < ${PARTY_MOST}`,
    )
    .bind(joining, party.id, now + 1)
    .run();
  return joined.meta.changes === 1;
}

/** What account `own` asks of the parties: of the player named, where it names one. */
export async function partyAsk(
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
  const mine = await partyOf(database, own);
  const leading = !mine || mine.leader === own;
  switch (asked) {
    case 'invite': {
      if (await blocks(database, own, them.id)) return said(409, 'Unblock them first.');
      if (!leading) return said(403, "Only your party's leader can invite.");
      if ((mine?.members.length ?? 1) >= PARTY_MOST) return said(409, 'Your party is full.');
      if (mine?.members.includes(them.id)) return said(409, 'They are in your party already.');
      // An invite to one who blocks the inviter is answered as sent, and never reaches them.
      if (await blocks(database, them.id, own)) return done;
      await database
        .prepare(
          `INSERT INTO party_invites (from_id, to_id, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (from_id, to_id) DO UPDATE SET created_at = ?3`,
        )
        .bind(own, them.id, now)
        .run();
      return done;
    }
    case 'accept':
    case 'decline': {
      const taken = await database
        .prepare('DELETE FROM party_invites WHERE from_id = ?1 AND to_id = ?2 RETURNING created_at')
        .bind(them.id, own)
        .first<{ created_at: number }>();
      if (asked === 'decline') return done;
      if (!taken || taken.created_at < now - INVITE_MS) return said(404, 'That invite has run out.');
      return (await join(database, own, them.id, now)) ? done : said(409, 'Their party is full.');
    }
    case 'join': {
      const theirs = await partyOf(database, them.id);
      const leader = theirs?.leader ?? them.id;
      if (theirs?.members.includes(own)) return done;
      const row = await database
        .prepare('SELECT privacy FROM accounts WHERE id = ?1')
        .bind(leader)
        .first<{ privacy: number }>();
      const blocked =
        (await blocks(database, leader, own)) ||
        (await blocks(database, them.id, own)) ||
        (await blocks(database, own, them.id));
      const friends = await database
        .prepare(
          `SELECT 1 AS yes FROM friends WHERE accepted = 1 AND ((asker_id = ?1 AND asked_id = ?2)
           OR (asker_id = ?2 AND asked_id = ?1))`,
        )
        .bind(own, leader)
        .first<{ yes: number }>();
      const members = theirs?.members ?? [them.id];
      const invited = await database
        .prepare(
          `SELECT 1 AS yes FROM party_invites WHERE to_id = ?1 AND created_at >= ?2
           AND from_id IN (SELECT value FROM json_each(?3))`,
        )
        .bind(own, now - INVITE_MS, JSON.stringify(members))
        .first<{ yes: number }>();
      const privacy = row?.privacy ?? 1;
      const allowed = !blocked && (privacy === 0 || (privacy === 1 && friends) || (privacy <= 2 && invited));
      // A block answers as a party closed to them, so it tells no one they are blocked.
      if (!allowed)
        return said(403, privacy === 1 ? 'Only their friends can join them.' : 'Their party is closed to you.');
      return (await join(database, own, them.id, now)) ? done : said(409, 'Their party is full.');
    }
    case 'kick':
    case 'lead': {
      if (!mine || mine.leader !== own) return said(403, "Only your party's leader can do that.");
      if (!mine.members.includes(them.id)) return said(404, 'They are not in your party.');
      if (asked === 'kick') await leave(database, them.id);
      else await database.prepare('UPDATE parties SET leader_id = ?1 WHERE id = ?2').bind(them.id, mine.id).run();
      return done;
    }
    default:
      return said(404, 'No such page.');
  }
}
