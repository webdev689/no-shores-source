/**
 * Each account's character, held by one player in one room at a time. A room claims it with the player's session
 * when they join, saves it while they play, and lets it go when they leave. A hold lapses once its room stops saving,
 * and a claim waits a moment for another room to let go (a player moving between rooms leaves one as they join the
 * next) before taking it anyway, so the room that held it learns from its next save that the player went elsewhere.
 */

import { type Db, SESSION_IDLE_MS } from './database.ts';
import { present } from './people.ts';
import { hashOf } from './secrets.ts';

/** How long a hold lasts past its room's last save. */
export const HOLD_MS = 60_000;
/** How long a claim waits for another room to let go, and how often it looks. */
const WAIT_MS = 3_000;
const LOOK_MS = 250;
/** The longest character kept: far past any the gear's limits allow. */
const BODY_MOST = 1_000_000;

/** A claim answered: the account, and its character as last kept (null before a room first keeps one). */
export interface Claimed {
  readonly account: string;
  readonly body: string | null;
}

/** What the accounts answer the rooms over their binding. */
export interface Characters {
  claim(token: string, holder: string): Promise<Claimed | null>;
  save(account: string, holder: string, body: string): Promise<boolean>;
  release(account: string, holder: string, body: string | null): Promise<boolean>;
  present(token: string, room: string | null): Promise<boolean>;
}

/** The characters on a database, with a clock and a way to wait. */
export function characters(database: Db, now: () => number, wait: (millis: number) => Promise<void>): Characters {
  const take = (account: string, holder: string, anyway: boolean) =>
    (anyway
      ? database
          .prepare('UPDATE characters SET holder = ?1, held_until = ?2 WHERE account_id = ?3 RETURNING body')
          .bind(holder, now() + HOLD_MS, account)
      : database
          .prepare(
            `UPDATE characters SET holder = ?1, held_until = ?2 WHERE account_id = ?3
             AND (holder IS NULL OR holder = ?1 OR held_until < ?4) RETURNING body`,
          )
          .bind(holder, now() + HOLD_MS, account, now())
    ).first<{ body: string | null }>();
  /** The account a session's token is for, seen now; null when the token is no session, or one that lapsed. */
  const live = async (token: string) => {
    const session = await database
      .prepare(
        `UPDATE sessions SET seen_at = ?1 WHERE token_hash = ?2 AND (seen_at >= ?3 OR EXISTS
         (SELECT 1 FROM accounts WHERE accounts.id = sessions.account_id AND username IS NULL AND discord_id IS NULL))
         RETURNING account_id`,
      )
      .bind(now(), await hashOf(token), now() - SESSION_IDLE_MS)
      .first<{ account_id: string }>();
    return session?.account_id ?? null;
  };
  return {
    /** Notes that a session's player is in a room that keeps no character, or with none that they left it; false
     *  when the token is no live session. */
    async present(token, room) {
      const account = await live(token);
      if (account === null) return false;
      await present(database, account, room, now());
      return true;
    },
    /** The account a session's token is for, its character held for `holder`; null when the token is no session, or
     *  one that lapsed. */
    async claim(token, holder) {
      const account = await live(token);
      if (account === null) return null;
      await database.prepare('INSERT OR IGNORE INTO characters (account_id) VALUES (?1)').bind(account).run();
      for (let waited = 0; ; waited += LOOK_MS) {
        const held = await take(account, holder, waited >= WAIT_MS);
        if (held) return { account, body: held.body };
        await wait(LOOK_MS);
      }
    },
    /** Saves a character its holder still holds, and holds it longer; false once another has taken it. */
    async save(account, holder, body) {
      if (body.length > BODY_MOST) return false;
      const saved = await database
        .prepare(
          'UPDATE characters SET body = ?1, held_until = ?2, saved_at = ?3 WHERE account_id = ?4 AND holder = ?5',
        )
        .bind(body, now() + HOLD_MS, now(), account, holder)
        .run();
      return saved.meta.changes === 1;
    },
    /** Lets a character go, saving it last if the room has it to give; false if another had already taken it. */
    async release(account, holder, body) {
      const statement =
        body === null || body.length > BODY_MOST
          ? database
              .prepare('UPDATE characters SET holder = NULL, held_until = 0 WHERE account_id = ?1 AND holder = ?2')
              .bind(account, holder)
          : database
              .prepare(
                `UPDATE characters SET body = ?3, holder = NULL, held_until = 0, saved_at = ?4
                 WHERE account_id = ?1 AND holder = ?2`,
              )
              .bind(account, holder, body, now());
      return (await statement.run()).meta.changes === 1;
    },
  };
}
