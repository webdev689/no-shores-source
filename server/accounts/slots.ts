/**
 * An account's four characters ([[Each Account Keeps Four Characters, Chosen on a Screen After Destiny 1's]]). The
 * one in play is the `characters` row, so all that reads the account's character reads it; the other three wait in
 * `benched`, each under its slot. The vault and Aurem are the account's (`vaults`), shared by all four, and never move
 * as a character is switched or deleted. Switching or deleting the one in play waits until no room holds it.
 */

import type { Db } from './database.ts';
import { type Developers, isDeveloper } from './developers.ts';
import { type AccountRow, HEADERS, bodyOf, json, refused } from './http.ts';
import { countFromJoining } from './guildWeeks.ts';
import { lastPlaceOf } from './lastPlace.ts';

/** How many characters an account keeps. */
export const SLOTS = 4;
/** The longest look kept, as JSON. */
export const LOOK_MOST = 512;
/** Why a switch or a deletion of the character in play waits. */
export const STILL_IN_A_ROOM = 'Your character is still in a room. Try again in a moment.';

/** One slot as the character screen shows it; null for an empty one. */
export type Slot = {
  readonly slot: number;
  readonly shown: unknown;
  readonly pledge: number | null;
  readonly look: unknown;
  readonly place: ReturnType<typeof lastPlaceOf>;
  readonly prologue: boolean;
  readonly saved: number;
} | null;

interface SlotRow {
  slot: number;
  playing: number;
  kept: number;
  look: string | null;
  saved_at: number;
  shown: string | null;
  pledge: number | null;
  last: string | null;
  prologue: number | null;
}

/** The character in play's row, made if the account has none yet. */
async function playingOf(database: Db, account: string) {
  await database.prepare('INSERT OR IGNORE INTO characters (account_id) VALUES (?1)').bind(account).run();
  const row = await database
    .prepare('SELECT slot, holder, held_until FROM characters WHERE account_id = ?1')
    .bind(account)
    .first<{ slot: number; holder: string | null; held_until: number }>();
  return row ?? { slot: 0, holder: null, held_until: 0 };
}

const held = (row: { holder: string | null; held_until: number }, now: number) =>
  row.holder !== null && row.held_until >= now;

/** What `GET /v1/characters` answers: the slot in play, whether the account is a developer's, its Aurem, and the four
 *  slots. A body no room could read shows as a character with nothing kept. */
async function slotsOf(database: Db, bot: Developers | null, account: string) {
  const { slot: playing } = await playingOf(database, account);
  const rows = await database
    .prepare(
      `SELECT slot, playing, body IS NOT NULL AS kept, look, saved_at, CASE json_type(b, '$.shown') WHEN 'object' THEN json_extract(b, '$.shown') END AS shown,
       json_extract(b, '$.allegiance.pledge') AS pledge, json_extract(b, '$.last') AS last,
       json_extract(b, '$.story.prologue') AS prologue
       FROM (SELECT slot, 1 AS playing, body, look, saved_at, CASE WHEN json_valid(body) THEN body END AS b
             FROM characters WHERE account_id = ?1
             UNION ALL SELECT slot, 0, body, look, saved_at, CASE WHEN json_valid(body) THEN body END
             FROM benched WHERE account_id = ?1)`,
    )
    .bind(account)
    .all<SlotRow>();
  const slots: Slot[] = Array.from({ length: SLOTS }, () => null);
  for (const row of rows.results)
    if ((row.kept || row.look !== null) && row.slot >= 0 && row.slot < SLOTS)
      slots[row.slot] = {
        slot: row.slot,
        shown: row.shown === null ? null : (JSON.parse(row.shown) as unknown),
        pledge: row.pledge,
        look: row.look === null ? null : (JSON.parse(row.look) as unknown),
        place: row.last === null ? null : lastPlaceOf(`{"last":${row.last}}`),
        prologue: row.prologue === 1,
        saved: row.saved_at,
      };
  // Until a room first saves the vault apart, the character in play still holds the account's Aurem.
  const aurem = await database
    .prepare(
      `SELECT COALESCE(
         (SELECT json_extract(CASE WHEN json_valid(body) THEN body END, '$.aurem') FROM vaults WHERE account_id = ?1),
         (SELECT json_extract(CASE WHEN json_valid(body) THEN body END, '$.materials.aurem')
          FROM characters WHERE account_id = ?1 AND NOT EXISTS (SELECT 1 FROM vaults WHERE account_id = ?1)),
         0) AS aurem`,
    )
    .bind(account)
    .first<{ aurem: number }>();
  return {
    playing,
    developer: await isDeveloper(database, bot, account),
    aurem: aurem?.aurem ?? 0,
    slots,
  };
}

/** The slot a request names, 0 to 3; null for any other. */
async function slotAsked(request: Request): Promise<number | null> {
  const slot = (await bodyOf(request))?.['slot'];
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < SLOTS ? slot : null;
}

/** A look as the page keeps it (`client/src/game/prologue/look.ts`): a body, a race, a tone from 0 to 1 and hair (a
 *  style and a colour, or none); null for anything else or anything longer than `LOOK_MOST`. Which races, styles and
 *  colours there are is the page's to judge, as it draws them. */
export function lookOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { body, race, tone, hair } = value as Record<string, unknown>;
  if (body !== 'male' && body !== 'female') return null;
  if (typeof race !== 'string' || typeof tone !== 'number' || !(tone >= 0 && tone <= 1)) return null;
  if (hair !== null) {
    if (typeof hair !== 'object' || Array.isArray(hair)) return null;
    const { style, colour } = hair as Record<string, unknown>;
    if (typeof style !== 'string' || typeof colour !== 'string') return null;
  }
  const kept = JSON.stringify(value);
  return kept.length <= LOOK_MOST ? kept : null;
}

/** Makes `slot` the one in play: the one in play now goes to the bench under its slot (unless it is empty), and the
 *  chosen one comes off it, or a new character for an empty slot. Each statement holds only while nothing changed
 *  under it, so a room that claims it meanwhile changes nothing. */
async function play(database: Db, account: string, from: number, slot: number, now: number) {
  // ?1 the account, ?2 the slot in play now, ?3 now, ?4 the slot chosen. The holder goes, so a room whose hold lapsed
  // saves nothing over the character chosen.
  const free = 'account_id = ?1 AND slot = ?2 AND (holder IS NULL OR held_until < ?3)';
  const benched = (column: string) => `(SELECT ${column} FROM benched WHERE account_id = ?1 AND slot = ?4)`;
  await database.batch([
    ...vaultParted(database, account, now),
    database
      .prepare(
        `INSERT INTO benched (account_id, slot, body, look, room, came_from, saved_at)
         SELECT account_id, slot, body, look, room, came_from, saved_at FROM characters
         WHERE ${free} AND (body IS NOT NULL OR look IS NOT NULL)`,
      )
      .bind(account, from, now),
    database
      .prepare(
        `UPDATE characters SET slot = ?4, body = ${benched('body')}, look = ${benched('look')},
         room = ${benched('room')}, came_from = ${benched('came_from')}, saved_at = COALESCE(${benched('saved_at')}, 0),
         holder = NULL, held_until = 0 WHERE ${free}`,
      )
      .bind(account, from, now, slot),
    database
      .prepare(
        `DELETE FROM benched WHERE account_id = ?1 AND slot = ?2
         AND EXISTS (SELECT 1 FROM characters WHERE account_id = ?1 AND slot = ?2)`,
      )
      .bind(account, slot),
  ]);
  // The guild's week counts from the chosen character's own record on, so a switch back credits nothing twice.
  await countFromJoining(database, account);
}

/** For a character in play kept before the vault was the account's, with no vault kept apart yet: its vault and Aurem
 *  parted out into the account's (as `gear::shared` parts them), so switching or deleting it loses nothing. The
 *  character is stripped only if its vault was made by the first statement now (`saved_at` = -now marks it). */
function vaultParted(database: Db, account: string, now: number) {
  const kept = (path: string, filter: string) =>
    `json((SELECT json_group_array(json(json_extract(value, '$[0]'))) FROM json_each(body, '${path}') WHERE ${filter}))`;
  const left = (path: string, filter: string) =>
    `json((SELECT json_group_object(key, json(value)) FROM json_each(body, '${path}') WHERE NOT (${filter})))`;
  const [items, vestiges] = ["json_extract(value, '$[1]') IS 'Vault'", "json_extract(value, '$[1]') IS 1"];
  const free = 'account_id = ?1 AND json_valid(body) AND (holder IS NULL OR held_until < ?2)';
  return [
    database
      .prepare(
        `INSERT INTO vaults (account_id, body, saved_at)
         SELECT account_id, json_object('items', ${kept('$.items', items)}, 'vestiges', ${kept('$.vestiges', vestiges)},
           'aurem', COALESCE(json_extract(body, '$.materials.aurem'), 0)), -?2
         FROM characters WHERE ${free} AND NOT EXISTS (SELECT 1 FROM vaults WHERE account_id = ?1)`,
      )
      .bind(account, now),
    database
      .prepare(
        `UPDATE characters SET body = json_set(body, '$.items', ${left('$.items', items)},
           '$.vestiges', ${left('$.vestiges', vestiges)}, '$.materials.aurem', 0)
         WHERE ${free} AND EXISTS (SELECT 1 FROM vaults WHERE account_id = ?1 AND saved_at = -?2)`,
      )
      .bind(account, now),
  ];
}

/** Answers `GET /v1/characters`, `POST /v1/characters/play`, `POST /v1/characters/delete` and
 *  `PUT /v1/characters/look` for `account`. */
export async function slotsAsk(
  request: Request,
  database: Db,
  bot: Developers | null,
  account: AccountRow,
  route: string,
  now: number,
): Promise<Response> {
  if (route === 'PUT /v1/characters/look') {
    const look = lookOf((await bodyOf(request))?.['look']);
    if (look === null) return refused(400, 'That is no look the game knows.');
    await playingOf(database, account.id);
    await database.prepare('UPDATE characters SET look = ?2 WHERE account_id = ?1').bind(account.id, look).run();
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (route !== 'GET /v1/characters') {
    const slot = await slotAsked(request);
    if (slot === null) return refused(400, `A slot is 0 to ${SLOTS - 1}.`);
    const playing = await playingOf(database, account.id);
    const inPlay = slot === playing.slot;
    if (route === 'POST /v1/characters/delete' && !inPlay)
      await database.prepare('DELETE FROM benched WHERE account_id = ?1 AND slot = ?2').bind(account.id, slot).run();
    else if (route === 'POST /v1/characters/delete' || !inPlay) {
      if (held(playing, now)) return refused(409, STILL_IN_A_ROOM);
      if (route === 'POST /v1/characters/play') await play(database, account.id, playing.slot, slot, now);
      else
        await database.batch([
          ...vaultParted(database, account.id, now),
          database
            .prepare(
              `UPDATE characters SET body = NULL, look = NULL, room = NULL, came_from = NULL, holder = NULL,
               held_until = 0 WHERE account_id = ?1 AND slot = ?2 AND (holder IS NULL OR held_until < ?3)`,
            )
            .bind(account.id, slot, now),
        ]);
    }
  }
  return json(await slotsOf(database, bot, account.id));
}
