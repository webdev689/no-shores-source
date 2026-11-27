/**
 * Each account's character, held by one player in one room at a time. A room claims it with the player's session
 * when they join, saves it while they play, and lets it go when they leave. A hold lapses once its room stops saving,
 * and a claim waits a moment for another room to let go (a player moving between rooms leaves one as they join the
 * next) before taking it anyway, so the room that held it learns from its next save that the player went elsewhere.
 * Each claim says which room held the character before, so the room judges where it came from.
 */

import { companionsOf, forgetRun, launchedFor } from './companies.ts';
import { type Db, SESSION_IDLE_MS } from './database.ts';
import { type Developers, isDeveloper } from './developers.ts';
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

/** A claim answered: the account, its character in play as last kept (null before a room first keeps one), the
 *  account's vault and Aurem (`gear::shared`, null before a room first saves them apart), the room that held it before
 *  (null before any did), and its username and its guild's tag, which others read over the player's head (null for a
 *  guest, and for one in no guild). */
export interface Claimed {
  readonly account: string;
  readonly body: string | null;
  readonly vault: string | null;
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
  /** `vault` is none from a room older than the account's vault, which never parts one out of its body. */
  save(account: string, holder: string, body: string, vault?: string): Promise<boolean>;
  release(account: string, holder: string, body: string | null, vault?: string | null): Promise<boolean>;
  present(token: string, room: string | null, water?: string | null): Promise<boolean>;
  companions(account: string, room: string): Promise<string[]>;
  launched(account: string, room: string, within?: number): Promise<boolean>;
  /** Forgets whom a run was found or launched for (`forgetRun`): a Breach's run its gate shut again. */
  forgetRun(room: string): Promise<boolean>;
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
  /** The account a session's token is for and its username, when it is a developer's (`developers.ts`); null
   *  otherwise, or when the token is no session. */
  developer(token: string): Promise<{ account: string; name: string | null } | null>;
}

/** The characters on a database, with a clock, a way to wait and the bot that says who is a developer. */
export function characters(
  database: Db,
  now: () => number,
  wait: (millis: number) => Promise<void>,
  bot: Developers | null = null,
): Characters {
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
    vault:
      (await database.prepare('SELECT body FROM vaults WHERE account_id = ?1').bind(account).first<{ body: string }>())
        ?.body ?? null,
    name: await usernameOf(database, account),
    tag: await guildTagOf(database, account),
  });
  // The account's vault, saved beside its character only while `holder` still holds it (the vault's statement goes
  // first in each batch, as a release lets the holder go).
  const vaultSaved = (account: string, holder: string, vault: string) =>
    database
      .prepare(
        `INSERT INTO vaults (account_id, body, saved_at) SELECT ?1, ?2, ?3
         WHERE EXISTS (SELECT 1 FROM characters WHERE account_id = ?1 AND holder = ?4)
         ON CONFLICT (account_id) DO UPDATE SET body = excluded.body, saved_at = excluded.saved_at`,
      )
      .bind(account, vault, now(), holder);
  return {
    /** Those a player may share a run's room with, whom it lets in beside them: their company's members longest there
     *  first, or the player alone, then those it was found for with them. */
    companions: (account, room) => companionsOf(database, account, room, now()),
    /** Whether the server found or launched `room` for the account within FOUND_KEPT_MS, or `within` (`finding.ts`). */
    launched: (account, room, within) => launchedFor(database, account, room, now(), within),
    forgetRun: (room) => forgetRun(database, room),
    guild: (account) => guildTold(database, account, now()),
    deposit: (account, amount, rid) => deposit(database, account, amount, rid, now()),
    deliver: (account, room, given, rid) => deliver(database, account, room, given, now(), rid),
    takeStores: (account, room, stuff, amount, rid) => takeStores(database, account, room, stuff, amount, now(), rid),
    soundHorn: (account, room, rid) => soundHorn(database, account, room, now(), rid),
    outpost: (room) => outpostFor(database, room),
    async developer(token) {
      const account = await live(token);
      if (account === null || !(await isDeveloper(database, bot, account))) return null;
      return { account, name: await usernameOf(database, account) };
    },
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
    /** Saves a character its holder still holds, with the account's vault, and holds it longer; false once another
     *  has taken it, which saves neither. */
    async save(account, holder, body, vault) {
      if (body.length > BODY_MOST || (vault !== undefined && vault.length > BODY_MOST)) return false;
      const update = database
        .prepare(
          'UPDATE characters SET body = ?1, held_until = ?2, saved_at = ?3 WHERE account_id = ?4 AND holder = ?5',
        )
        .bind(body, now() + HOLD_MS, now(), account, holder);
      // A room older than the account's vault saves its body alone, the vault still in it, as it always did.
      const saved =
        vault === undefined
          ? await update.run()
          : (await database.batch([vaultSaved(account, holder, vault), update]))[1];
      if (saved?.meta.changes !== 1) return false;
      // What the save added to the member's guild week goes to their guild; a failure there loses no save.
      await creditGuild(database, account, body).catch((error: unknown) => console.error('guild credit:', error));
      return true;
    },
    /** Lets a character go, saving it last if the room has it to give; false if another had already taken it. Let go
     *  with nothing (the room turned it away, or never gave it), it was never there: the room before still held it
     *  last. */
    async release(account, holder, body, vault) {
      const parted = typeof vault === 'string';
      const kept = body !== null && body.length <= BODY_MOST && (!parted || vault.length <= BODY_MOST);
      const statement = !kept
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
      const released =
        kept && parted
          ? (await database.batch([vaultSaved(account, holder, vault), statement]))[1]
          : await statement.run();
      if (released?.meta.changes !== 1) return false;
      if (kept)
        await creditGuild(database, account, body).catch((error: unknown) => console.error('guild credit:', error));
      return true;
    },
  };
}
