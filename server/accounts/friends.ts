/**
 * Friends, as Destiny keeps them: a player with a username asks another by theirs, who accepts or declines, and
 * either may end it after. A pair is one row whichever asked, so an ask that crosses one already made accepts it. A
 * friend is playing while a room holds their character.
 */

import type { Db } from './database.ts';
import { USERNAME } from './names.ts';
import { blocks } from './people.ts';

/** The most friends and asks one player keeps at once, and the most asks a player's list takes. */
export const FRIENDS_MOST = 100;

/** A player's friends, by name, whether each is playing; who has asked them; and whom they have asked. */
export interface FriendsList {
  readonly friends: readonly { readonly name: string; readonly playing: boolean }[];
  readonly asking: readonly string[];
  readonly asked: readonly string[];
}

/** An answer: its status, and what it holds or why not. */
export interface Answer {
  readonly status: number;
  readonly body: object;
}

export const said = (status: number, error: string): Answer => ({ status, body: { error } });
export const done: Answer = { status: 200, body: { ok: true } };

/** The friends list of account `own` at `now`. */
export async function friendsOf(database: Db, own: string, now: number): Promise<FriendsList> {
  const { results } = await database
    .prepare(
      `SELECT accounts.username AS name, friends.accepted, friends.asker_id = ?1 AS mine,
       characters.holder IS NOT NULL AND characters.held_until > ?2 AS playing
       FROM friends JOIN accounts ON accounts.id =
       CASE WHEN friends.asker_id = ?1 THEN friends.asked_id ELSE friends.asker_id END
       LEFT JOIN characters ON characters.account_id = accounts.id
       WHERE friends.asker_id = ?1 OR friends.asked_id = ?1 ORDER BY accounts.username_key`,
    )
    .bind(own, now)
    .all<{ name: string; accepted: number; mine: number; playing: number | null }>();
  return {
    friends: results.filter((row) => row.accepted).map((row) => ({ name: row.name, playing: row.playing === 1 })),
    asking: results.filter((row) => !row.accepted && !row.mine).map((row) => row.name),
    asked: results.filter((row) => !row.accepted && row.mine).map((row) => row.name),
  };
}

/** What account `own` asks of the player named `name`: to be friends, to accept their ask, or to end what is between them.
 *  A name no one holds is answered as a name held by someone who never asked, so accepting and removing tell no one
 *  which names exist. */
export async function friendAsk(
  database: Db,
  own: string,
  asked: 'ask' | 'accept' | 'remove',
  name: unknown,
  now: number,
): Promise<Answer> {
  const notAsked = said(404, 'They have not asked you.');
  const them =
    typeof name === 'string' && USERNAME.test(name)
      ? await database
          .prepare('SELECT id FROM accounts WHERE username_key = ?1')
          .bind(name.toLowerCase())
          .first<{ id: string }>()
      : null;
  if (!them || them.id === own) {
    if (asked !== 'ask') return asked === 'remove' ? done : notAsked;
    return them ? said(400, 'That is you.') : said(404, 'No one has that username.');
  }
  // An ask of one who blocks the asker is answered as made, and never reaches them; one blocked must be unblocked.
  if (asked === 'ask' && (await blocks(database, own, them.id))) return said(409, 'Unblock them first.');
  if (asked !== 'remove' && (await blocks(database, them.id, own))) return asked === 'ask' ? done : notAsked;
  if (asked === 'remove') {
    await database
      .prepare('DELETE FROM friends WHERE (asker_id = ?1 AND asked_id = ?2) OR (asker_id = ?2 AND asked_id = ?1)')
      .bind(own, them.id)
      .run();
    return done;
  }
  // Their ask waiting is accepted, by accepting it or by asking them back. Theirs was counted as they made it; the
  // friend it makes must fit the acceptor's list, judged in the one statement that accepts, so two at once cannot
  // both pass it.
  const acceptTheirs = () =>
    database
      .prepare(
        `UPDATE friends SET accepted = 1 WHERE asker_id = ?1 AND asked_id = ?2 AND accepted = 0
         AND (SELECT COUNT(*) FROM friends WHERE asker_id = ?2 OR (asked_id = ?2 AND accepted = 1)) < ?3`,
      )
      .bind(them.id, own, FRIENDS_MOST)
      .run();
  const full = said(409, `You can keep ${FRIENDS_MOST} friends and asks at most.`);
  if ((await acceptTheirs()).meta.changes === 1) return done;
  if (asked === 'accept') {
    // An ask that waits and was not taken met a full list; with none waiting, it is answered as for anyone.
    const waits = await database
      .prepare('SELECT 1 AS waits FROM friends WHERE asker_id = ?1 AND asked_id = ?2 AND accepted = 0')
      .bind(them.id, own)
      .first<{ waits: number }>();
    return waits ? full : notAsked;
  }
  // Each player's count is their friends and their own asks, so strangers' asks cannot fill it; a list that holds
  // the most takes no new asks.
  const counts = await database
    .prepare(
      `SELECT (SELECT COUNT(*) FROM friends WHERE asker_id = ?1 OR (asked_id = ?1 AND accepted = 1)) AS mine,
       (SELECT COUNT(*) FROM friends WHERE asker_id = ?2 OR (asked_id = ?2 AND accepted = 1)) AS theirs`,
    )
    .bind(own, them.id)
    .first<{ mine: number; theirs: number }>();
  if ((counts?.mine ?? 0) >= FRIENDS_MOST) return full;
  if ((counts?.theirs ?? 0) >= FRIENDS_MOST) return said(409, 'Their list is full.');
  const made = await database
    .prepare('INSERT OR IGNORE INTO friends (asker_id, asked_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(own, them.id, now)
    .run();
  if (made.meta.changes === 1) return done;
  // The pair has its row already: an ask of theirs made just now, which this one accepts, or one of before.
  if ((await acceptTheirs()).meta.changes === 1) return done;
  const between = await database
    .prepare(
      'SELECT accepted FROM friends WHERE (asker_id = ?1 AND asked_id = ?2) OR (asker_id = ?2 AND asked_id = ?1)',
    )
    .bind(own, them.id)
    .first<{ accepted: number }>();
  return said(409, between?.accepted ? 'You are friends already.' : 'You have asked them already.');
}
