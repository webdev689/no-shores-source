/**
 * Friends, as Destiny keeps them: a player with a username asks another by theirs, who accepts or declines, and
 * either may end it after. A pair is one row whichever asked, so an ask that crosses one already made accepts it. A
 * friend is playing while a room holds their character.
 */

import type { Db } from './database.ts';

/** The most friends and asks one player keeps at once. */
export const FRIENDS_MOST = 100;

/** A player's friends, by name, whether each is playing; who has asked them; and whom they have asked. */
export interface FriendsList {
  readonly friends: readonly { readonly name: string; readonly playing: boolean }[];
  readonly asking: readonly string[];
  readonly asked: readonly string[];
}

/** An answer: its status, and the list or why not. */
export interface Answer {
  readonly status: number;
  readonly body: FriendsList | { readonly ok: true } | { readonly error: string };
}

const said = (status: number, error: string): Answer => ({ status, body: { error } });
const done: Answer = { status: 200, body: { ok: true } };

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

/** What account `own` asks of the player named `name`: to be friends, to accept their ask, or to end what is between them. */
export async function friendAsk(
  database: Db,
  own: string,
  asked: 'ask' | 'accept' | 'remove',
  name: unknown,
  now: number,
): Promise<Answer> {
  if (typeof name !== 'string' || name.length > 20) return said(400, 'Give a username.');
  const them = await database
    .prepare('SELECT id FROM accounts WHERE username_key = ?1')
    .bind(name.toLowerCase())
    .first<{ id: string }>();
  if (!them) return said(404, 'No one has that username.');
  if (them.id === own) return said(400, 'That is you.');
  const between = await database
    .prepare(
      'SELECT asker_id, accepted FROM friends WHERE (asker_id = ?1 AND asked_id = ?2) OR (asker_id = ?2 AND asked_id = ?1)',
    )
    .bind(own, them.id)
    .first<{ asker_id: string; accepted: number }>();
  if (asked === 'remove') {
    await database
      .prepare('DELETE FROM friends WHERE (asker_id = ?1 AND asked_id = ?2) OR (asker_id = ?2 AND asked_id = ?1)')
      .bind(own, them.id)
      .run();
    return done;
  }
  const theyAsked = between !== null && !between.accepted && between.asker_id === them.id;
  if (theyAsked) {
    await database
      .prepare('UPDATE friends SET accepted = 1 WHERE asker_id = ?1 AND asked_id = ?2')
      .bind(them.id, own)
      .run();
    return done;
  }
  if (asked === 'accept') return said(404, 'They have not asked you.');
  if (between?.accepted) return said(409, 'You are friends already.');
  if (between) return said(409, 'You have asked them already.');
  const held = await database
    .prepare('SELECT COUNT(*) AS count FROM friends WHERE asker_id = ?1 OR asked_id = ?1')
    .bind(own)
    .first<{ count: number }>();
  if ((held?.count ?? 0) >= FRIENDS_MOST) return said(409, `You can keep ${FRIENDS_MOST} friends and asks at most.`);
  await database
    .prepare('INSERT INTO friends (asker_id, asked_id, created_at) VALUES (?1, ?2, ?3)')
    .bind(own, them.id, now)
    .run();
  return done;
}
