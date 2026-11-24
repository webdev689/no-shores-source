/**
 * Each account's character, held by one player in one room at a time. A room claims it with the player's session
 * when they join, saves it while they play, and lets it go when they leave. A hold lapses once its room stops saving,
 * and a claim waits a moment for another room to let go (a player moving between rooms leaves one as they join the
 * next) before taking it anyway, so the room that held it learns from its next save that the player went elsewhere.
 * Each claim says which room held the character before, so the room judges where it came from.
 */

import { companionsOf, launchedFor } from './companies.ts';
import { type Db, SESSION_IDLE_MS } from './database.ts';
import { creditGuild, guildTold } from './guildWeeks.ts';
import type { Stuff } from '../../client/src/game/guild/outpostLaw.ts';
import { type Deposited, deliver, deposit, outpostFor, soundHorn, takeStores } from './outpostStores.ts';
import { guildTagOf, present, usernameOf } from './people.ts';
import { hashOf } from './secrets.ts';

/** How long a hold lasts past its room's last save. */
export const HOLD_MS = 60_000;
/** How long a claim waits for another room to let go, and how often it looks. */
const WAIT_MS = 3_000;
const LOOK_MS = 250;
/** The longest character kept: far past any the gear's limits allow. */
const BODY_MOST = 1_000_000;

/** A claim answered: the account, its character as last kept (null before a room first keeps one), the room that
 *  held it before (null before any did), and its username and its guild's tag, which others read over the player's
 *  head (null for a guest, and for one in no guild). */
export interface Claimed {
  readonly account: string;
  readonly body: string | null;
  readonly from: string | null;
  readonly name: string | null;
  readonly tag: string | null;
}

/** The account a session's token is for, seen at `now`; null when the token is no session, or one that lapsed. */
export async function liveAccount(database: Db, token: string, now: number): Promise<string | null> {
  const session = await database
    .prepare(
      `UPDATE sessions SET seen_at = ?1 WHERE token_hash = ?2 AND (seen_at >= ?3 OR EXISTS
       (SELECT 1 FROM accounts WHERE accounts.id = sessions.account_id AND username IS NULL AND discord_id IS NULL))
       RETURNING account_id`,
    )
    .bind(now, await hashOf(token), now - SESSION_IDLE_MS)
    .first<{ account_id: string }>();
  return session?.account_id ?? null;
}

/** What the accounts answer the rooms over their binding. */
export interface Characters {
  look(token: string): Promise<Claimed | null>;
  claim(token: string, holder: string): Promise<Claimed | null>;
  save(account: string, holder: string, body: string): Promise<boolean>;
  release(account: string, holder: string, body: string | null): Promise<boolean>;
  present(token: string, room: string | null, water?: string | null): Promise<boolean>;
  companions(account: string, room: string): Promise<string[]>;
  launched(account: string, room: string): Promise<boolean>;
  /** What a room is told of a player's guild (`guildWeeks.ts`), null in none. */
  guild(account: string): ReturnType<typeof guildTold>;
  /** What an outpost's room asks for its players (`outpostStores.ts`). */
  deposit(account: string, amount: number, rid: string): Promise<Deposited>;
  deliver(
    account: string,
    room: string,
    given: { id: number; stuff: Stuff; amount: number },
    rid?: string,
  ): Promise<number>;
  takeStores(account: string, room: string, stuff: Stuff, amount: number, rid?: string): Promise<number>;
  soundHorn(account: string, room: string, rid?: string): Promise<number>;
  outpost(room: string): ReturnType<typeof outpostFor>;
}

/** The characters on a database, with a clock and a way to wait. */
export function characters(database: Db, now: () => number, wait: (millis: number) => Promise<void>): Characters {
  // A holder is its room's name, then `:`; the room held before is read as the row was, before this claim.
  const holding = `UPDATE characters SET holder = ?1, held_until = ?2, came_from = room,
    room = substr(?1, 1, instr(?1, ':') - 1) WHERE account_id = ?3`;
  const take = (account: string, holder: string, anyway: boolean) =>
    (anyway
      ? database.prepare(`${holding} RETURNING body, came_from`).bind(holder, now() + HOLD_MS, account)
      : database
          .prepare(`${holding} AND (holder IS NULL OR holder = ?1 OR held_until < ?4) RETURNING body, came_from`)
          .bind(holder, now() + HOLD_MS, account, now())
    ).first<{ body: string | null; came_from: string | null }>();
  const live = (token: string) => liveAccount(database, token, now());
  const namesOf = async (account: string) => ({
    name: await usernameOf(database, account),
    tag: await guildTagOf(database, account),
  });
  return {
    /** Those a player may share a run's room with, whom it lets in beside them: their company's members longest there
     *  first, or the player alone, then those it was found for with them. */
    companions: (account, room) => companionsOf(database, account, room, now()),
    /** Whether the server found or launched `room` for the account within FOUND_KEPT_MS (`finding.ts`). */
    launched: (account, room) => launchedFor(database, account, room, now()),
    guild: (account) => guildTold(database, account, now()),
    deposit: (account, amount, rid) => deposit(database, account, amount, rid, now()),
    deliver: (account, room, given, rid) => deliver(database, account, room, given, now(), rid),
    takeStores: (account, room, stuff, amount, rid) => takeStores(database, account, room, stuff, amount, now(), rid),
    soundHorn: (account, room, rid) => soundHorn(database, account, room, now(), rid),
    outpost: (room) => outpostFor(database, room),
    /** Notes that a session's player is in a room that keeps no character, at sea in which water, or with none that
     *  they left it; false when the token is no live session. */
    async present(token, room, water = null) {
      const account = await live(token);
      if (account === null) return false;
      await present(database, account, room, now(), water);
      return true;
    },
    /** The account a session's token is for, its character as last kept and the room that last held it, taken from
     *  no room that holds it; null when the token is no session, or one that lapsed. */
    async look(token) {
      const account = await live(token);
      if (account === null) return null;
      const kept = await database
        .prepare('SELECT body, room FROM characters WHERE account_id = ?1')
        .bind(account)
        .first<{ body: string | null; room: string | null }>();
      return { account, body: kept?.body ?? null, from: kept?.room ?? null, ...(await namesOf(account)) };
    },
    /** The account a session's token is for, its character held for `holder`; null when the token is no session, or
     *  one that lapsed. */
    async claim(token, holder) {
      const account = await live(token);
      if (account === null) return null;
      await database.prepare('INSERT OR IGNORE INTO characters (account_id) VALUES (?1)').bind(account).run();
      for (let waited = 0; ; waited += LOOK_MS) {
        const held = await take(account, holder, waited >= WAIT_MS);
        if (held) return { account, body: held.body, from: held.came_from, ...(await namesOf(account)) };
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
      if (saved.meta.changes !== 1) return false;
      // What the save added to the member's guild week goes to their guild; a failure there loses no save.
      await creditGuild(database, account, body).catch((error: unknown) => console.error('guild credit:', error));
      return true;
    },
    /** Lets a character go, saving it last if the room has it to give; false if another had already taken it. Let go
     *  with nothing (the room turned it away, or never gave it), it was never there: the room before still held it
     *  last. */
    async release(account, holder, body) {
      const statement =
        body === null || body.length > BODY_MOST
          ? database
              .prepare(
                `UPDATE characters SET holder = NULL, held_until = 0, room = came_from
                 WHERE account_id = ?1 AND holder = ?2`,
              )
              .bind(account, holder)
          : database
              .prepare(
                `UPDATE characters SET body = ?3, holder = NULL, held_until = 0, saved_at = ?4
                 WHERE account_id = ?1 AND holder = ?2`,
              )
              .bind(account, holder, body, now());
      if ((await statement.run()).meta.changes !== 1) return false;
      if (body !== null && body.length <= BODY_MOST)
        await creditGuild(database, account, body).catch((error: unknown) => console.error('guild credit:', error));
      return true;
    },
  };
}
