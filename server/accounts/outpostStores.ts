/**
 * What fills an outpost by time, and what its room asks of the accounts. The strongbox fills each whole hour by its
 * Counting House's tier and holds two days of it; the stores fill each whole day from the Island Camp and the Dockyard
 * and hold three days of each. Neither is written by time alone: the strongbox is written when emptied, the stores when
 * taken from, and both when a structure that fills them changes. A room asks on a player's behalf what only the
 * accounts can do: put Aurem into the treasury, deliver materials to a structure being built, take from the stores (so
 * many a member a game day), sound the War Horn (once a guild a week), and read the plot its outpost stands as. Its
 * errands count in the account's outpost limit, as the page's asks do.
 */

import { weekOf } from '../../client/src/game/guild/guildLaw.ts';
import {
  type Plot,
  STORES_HOLD_DAYS,
  STORES_TAKE_A_DAY,
  STRONGBOX_HOURS,
  type Stuff,
  amountOf,
  kindOf,
} from '../../client/src/game/guild/outpostLaw.ts';
import type { Db, Statement } from './database.ts';
import { within } from './http.ts';
import { type Moved, move, treasuryOf } from './treasury.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The game's day, turning at 09:00 UTC as its week does (the rules' `gear::clock`). */
const dayOf = (now: number) => Math.floor((now - 9 * HOUR_MS) / DAY_MS);
/** How many outpost asks and errands one account makes an hour: the page's and its rooms' alike. */
export const OUTPOST_LIMIT = { most: 600, window: 60 * 60_000 } as const;
/** Whether one more outpost ask or errand of the account passes its limit; counts it either way. */
export const outpostAllowed = (database: Db, account: string, now: number) =>
  within(database, `outpost:${account}`, OUTPOST_LIMIT, now);

/** A guild's key, as its outposts' rooms are named: its id's 32 hexadecimal digits, so no two guilds share one. */
export const guildKey = (guild: string) => guild.replaceAll('-', '').toLowerCase();
/** The room a guild's outpost at a site plays in. */
export const outpostRoom = (site: string, guild: string) => `node-${site}--guild-${guildKey(guild)}`;
/** The site and guild key an outpost room's name holds, or null for another room. */
export function outpostOf(room: string): { site: string; key: string } | null {
  const found = /^node-([a-z0-9-]{1,48})--guild-([0-9a-f]{32})$/.exec(room);
  return found ? { site: found[1] ?? '', key: found[2] ?? '' } : null;
}

/** A plot as kept, each structure with the Aurem spent on it and the materials delivered toward its tier being built,
 *  each piece of decoration with what it cost. */
export async function plotOf(database: Db, guild: string, site: string) {
  const { results: structures } = await database
    .prepare(
      `SELECT id, kind, tier, building, x, y, turn, spent, delivered FROM outpost_structures
       WHERE guild_id = ?1 AND site = ?2 ORDER BY id`,
    )
    .bind(guild, site)
    .all<Plot['structures'][number] & { spent: number; delivered: string }>();
  const { results: decor } = await database
    .prepare('SELECT id, piece, x, y, turn, paid FROM outpost_decor WHERE guild_id = ?1 AND site = ?2 ORDER BY id')
    .bind(guild, site)
    .all<Plot['decor'][number] & { paid: number }>();
  return {
    structures: structures.map((row) => ({
      ...row,
      delivered: JSON.parse(row.delivered) as Readonly<Partial<Record<Stuff, number>>>,
    })),
    decor: decor.map((row) => ({ ...row })),
  };
}

/** A store filled by whole periods of `period` ms since `since`, `rate` a period, holding `most` at most. */
export function settled(
  amount: number,
  since: number,
  rate: number,
  now: number,
  period = HOUR_MS,
  most = rate * STRONGBOX_HOURS,
) {
  if (rate <= 0) return { amount, at: now };
  const periods = Math.max(0, Math.floor((now - since) / period));
  const filled = amount + periods * rate;
  return filled >= most
    ? { amount: Math.max(amount, most), at: now }
    : { amount: filled, at: since + periods * period };
}

/** What an outpost's built structures of an effect give at their tiers. */
function rateOf(plot: Plot, kind: 'income' | 'stores', stuff?: 'island' | 'ship'): number {
  return plot.structures
    .filter((standing) => {
      const effect = kindOf(standing.kind)?.effect;
      return effect?.kind === kind && (!stuff || ('stuff' in effect && effect.stuff === stuff));
    })
    .reduce((sum, standing) => sum + amountOf(standing), 0);
}

/** The Aurem an outpost's strongbox gains an hour. */
export const strongboxRate = (plot: Plot) => rateOf(plot, 'income');

/** An outpost's stores filled to now: each material by whole days, three days of it at most; `toNow`, the part of a
 *  day since the last whole one paid too, as a settling before a rate changes pays it. */
export function storesNow(
  plot: Plot,
  stores: Readonly<Partial<Record<Stuff, number>>>,
  since: number,
  now: number,
  toNow = false,
) {
  const days = Math.max(0, Math.floor((now - since) / DAY_MS));
  const rates: Readonly<Record<Stuff, number>> = {
    island: rateOf(plot, 'stores', 'island'),
    timber: rateOf(plot, 'stores', 'ship'),
    canvas: rateOf(plot, 'stores', 'ship'),
    iron: rateOf(plot, 'stores', 'ship'),
    heartwood: 0,
  };
  const filled: Partial<Record<Stuff, number>> = {};
  for (const [stuff, rate] of Object.entries(rates) as [Stuff, number][]) {
    const kept = stores[stuff] ?? 0;
    const part = toNow ? Math.floor((rate * (now - since - days * DAY_MS)) / DAY_MS) : 0;
    filled[stuff] = Math.min(Math.max(kept, rate * STORES_HOLD_DAYS), kept + days * rate + part);
  }
  // Nothing filling keeps no part of a day, so a store that starts filling counts from then.
  const filling = !toNow && Object.values(rates).some((rate) => rate > 0);
  return { stores: filled, at: filling ? since + days * DAY_MS : now };
}

/** Whether a structure of this kind fills the strongbox or the stores. */
export const fills = (kind: string) => ['income', 'stores'].includes(kindOf(kind)?.effect.kind ?? '');

/** The write that settles an outpost's strongbox and stores to now at the rates its plot gives before a change to a
 *  structure that fills them, made in the same write as that change, so the new rate counts only from then; it holds
 *  only while both are as read, and while `guards` (SQL after its own ten parameters) holds. Null for no outpost. */
export async function settling(database: Db, guild: string, site: string, plot: Plot, now: number) {
  const row = await database
    .prepare('SELECT strongbox, strongbox_at, stores, stores_at FROM outposts WHERE guild_id = ?1 AND site = ?2')
    .bind(guild, site)
    .first<{ strongbox: number; strongbox_at: number; stores: string; stores_at: number }>();
  if (!row) return null;
  // Settled to now, the part of a period at the rate before, so the new rate, or a store just beginning to fill
  // beside one that already does, counts only from now and never from a period another rate began.
  const rate = strongboxRate(plot);
  const whole = settled(row.strongbox, row.strongbox_at, rate, now);
  const part = Math.floor((rate * (now - whole.at)) / HOUR_MS);
  const box = { amount: Math.max(whole.amount, Math.min(rate * STRONGBOX_HOURS, whole.amount + part)), at: now };
  const stores = storesNow(plot, JSON.parse(row.stores), row.stores_at, now, true);
  return {
    sql: (guards: string) =>
      `UPDATE outposts SET strongbox = ?3, strongbox_at = ?4, stores = ?5, stores_at = ?6 WHERE guild_id = ?1
       AND site = ?2 AND strongbox = ?7 AND strongbox_at = ?8 AND stores = ?9 AND stores_at = ?10 AND ${guards}`,
    values: [
      guild,
      site,
      box.amount,
      box.at,
      JSON.stringify(stores.stores),
      stores.at,
      row.strongbox,
      row.strongbox_at,
      row.stores,
      row.stores_at,
    ],
  };
}

/** The guild and rank of an account, with the guild's id. */
async function memberOf(database: Db, account: string) {
  return database
    .prepare('SELECT guild_id, rank FROM guild_members WHERE account_id = ?1')
    .bind(account)
    .first<{ guild_id: string; rank: number }>();
}

/** The answer kept for a room's errand under its id, or null for none kept: asked again, it is answered the same. */
async function keptAnswer(database: Db, rid: string | undefined): Promise<number | null> {
  if (rid === undefined) return null;
  const row = await database
    .prepare('SELECT answer FROM outpost_errands WHERE rid = ?1')
    .bind(rid)
    .first<{ answer: number }>();
  return row?.answer ?? null;
}

/** An errand's write with its answer kept under the room's id for it: the work's statements, then the answer, written
 *  only when the work's last statement changed a row. Answers a day old go first. */
function withAnswer(database: Db, rid: string | undefined, now: number, work: Statement[], answer: number) {
  if (rid === undefined) return work;
  return [
    database.prepare('DELETE FROM outpost_errands WHERE at < ?1').bind(now - DAY_MS),
    ...work,
    database
      .prepare('INSERT INTO outpost_errands (rid, answer, at) SELECT ?1, ?2, ?3 WHERE changes() = 1')
      .bind(rid, answer, now),
  ];
}

/** An errand's answer from its write: `answer` when its work's last statement changed a row (its kept answer, last in a
 *  write with one, is written only then). When it changed nothing, the same errand may have been made meanwhile under
 *  the same id, so its kept answer is read again before `otherwise`. */
async function answerOf(
  database: Db,
  rid: string | undefined,
  written: readonly { readonly meta: { readonly changes: number } }[],
  answer: number,
  otherwise: () => number | Promise<number> = () => 0,
) {
  if (written.at(-1)?.meta.changes === 1) return answer;
  return (await keptAnswer(database, rid)) ?? otherwise();
}

/** Puts a member's Aurem into the treasury of the guild whose outpost room took it from them, once for the room's id,
 *  which begins with the room's name; refused when they are no longer of that guild. */
export async function deposit(database: Db, account: string, amount: number, rid: string, now: number): Promise<Moved> {
  // A room names its errands by its own name first, so the outpost's guild is read from the id: a player who changed
  // guilds since the room last heard puts nothing into the other.
  const outpost = outpostOf(rid.split(':')[0] ?? '');
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key) return 'refused';
  if (!Number.isInteger(amount) || amount <= 0) return 'refused';
  const ledgerId = `room:${rid}`;
  // One asked again once moved is answered so even past the limit, so the room never gives back what was kept.
  const kept = await database
    .prepare('SELECT 1 AS yes FROM guild_ledger WHERE guild_id = ?1 AND rid = ?2')
    .bind(member.guild_id, ledgerId)
    .first<{ yes: number }>();
  if (kept) return 'already';
  if (!(await outpostAllowed(database, account, now))) return 'refused';
  const moved = await move(database, member.guild_id, { account, kind: 'deposit', amount, rid: ledgerId, now });
  return moved === 'stale' ? 'refused' : moved;
}

/** Delivers a member's materials to a structure being built at the outpost their room is: answers how many it used, the
 *  rest for the room to give back; the last delivered stands the structure risen. Asked again under the room's id for
 *  it (`rid`), it answers as it did the first time and delivers nothing more. */
export async function deliver(
  database: Db,
  account: string,
  room: string,
  given: { id: number; stuff: Stuff; amount: number },
  now: number,
  rid?: string,
) {
  const kept = await keptAnswer(database, rid);
  if (kept !== null) return kept;
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key) return 0;
  if (!(await outpostAllowed(database, account, now))) return 0;
  const row = await database
    .prepare(
      `SELECT kind, tier, building, delivered FROM outpost_structures WHERE guild_id = ?1 AND site = ?2 AND id = ?3`,
    )
    .bind(member.guild_id, outpost.site, given.id)
    .first<{ kind: string; tier: number; building: number; delivered: string }>();
  const needs = row && row.building > 0 ? kindOf(row.kind)?.tiers[row.building - 1]?.materials : undefined;
  if (!row || !needs) return 0;
  const delivered = JSON.parse(row.delivered) as Partial<Record<Stuff, number>>;
  const used = Math.max(0, Math.min(given.amount, (needs[given.stuff] ?? 0) - (delivered[given.stuff] ?? 0)));
  if (used === 0) return 0;
  const after = { ...delivered, [given.stuff]: (delivered[given.stuff] ?? 0) + used };
  const whole = (Object.entries(needs) as [Stuff, number][]).every(([stuff, needed]) => (after[stuff] ?? 0) >= needed);
  const settle =
    whole && fills(row.kind)
      ? await settling(
          database,
          member.guild_id,
          outpost.site,
          await plotOf(database, member.guild_id, outpost.site),
          now,
        )
      : null;
  const update = database
    .prepare(
      `UPDATE outpost_structures SET delivered = ?4, tier = CASE WHEN ?5 THEN building ELSE tier END,
       building = CASE WHEN ?5 THEN 0 ELSE building END WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND delivered = ?6
       AND building = ?7${settle ? ' AND changes() = 1' : ''}`,
    )
    .bind(
      member.guild_id,
      outpost.site,
      given.id,
      whole ? '{}' : JSON.stringify(after),
      whole ? 1 : 0,
      row.delivered,
      row.building,
    );
  const work = settle ? [database.prepare(settle.sql('1')).bind(...settle.values), update] : [update];
  return answerOf(database, rid, await database.batch(withAnswer(database, rid, now, work, used)), used);
}

/** Takes up to `amount` of a material from the stores of the outpost a member's room is, within what they may take a
 *  day; answers how many they took, for their room to give them. Asked again under the room's id for it, it answers as
 *  it did and takes nothing more. */
export async function takeStores(
  database: Db,
  account: string,
  room: string,
  stuff: Stuff,
  amount: number,
  now: number,
  rid?: string,
) {
  const kept = await keptAnswer(database, rid);
  if (kept !== null) return kept;
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key) return 0;
  if (!(await outpostAllowed(database, account, now))) return 0;
  const row = await database
    .prepare('SELECT stores, stores_at FROM outposts WHERE guild_id = ?1 AND site = ?2')
    .bind(member.guild_id, outpost.site)
    .first<{ stores: string; stores_at: number }>();
  if (!row) return 0;
  const filled = storesNow(
    await plotOf(database, member.guild_id, outpost.site),
    JSON.parse(row.stores),
    row.stores_at,
    now,
  );
  const day = dayOf(now);
  const taken = await database
    .prepare('SELECT taken FROM outpost_takes WHERE account_id = ?1 AND day = ?2 AND stuff = ?3')
    .bind(account, day, stuff)
    .first<{ taken: number }>();
  const give = Math.max(0, Math.min(amount, filled.stores[stuff] ?? 0, STORES_TAKE_A_DAY - (taken?.taken ?? 0)));
  if (give === 0) return 0;
  const after = JSON.stringify({ ...filled.stores, [stuff]: (filled.stores[stuff] ?? 0) - give });
  const work = [
    database.prepare('DELETE FROM outpost_takes WHERE account_id = ?1 AND day < ?2').bind(account, day),
    database
      .prepare(
        'UPDATE outposts SET stores = ?3, stores_at = ?4 WHERE guild_id = ?1 AND site = ?2 AND stores = ?5 AND stores_at = ?6',
      )
      .bind(member.guild_id, outpost.site, after, filled.at, row.stores, row.stores_at),
    database
      .prepare(
        `INSERT INTO outpost_takes (account_id, day, stuff, taken) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1
         ON CONFLICT (account_id, day, stuff) DO UPDATE SET taken = taken + excluded.taken`,
      )
      .bind(account, day, stuff, give),
  ];
  return answerOf(database, rid, await database.batch(withAnswer(database, rid, now, work, give)), give);
}

/** Sounds the War Horn of the outpost a member's room is, once a guild a week, by its founder or an admin: answers its
 *  tier (1 to 3) when it sounds, 0 when it has sounded this week, -1 when the asker is not the founder or an admin of
 *  the outpost's guild, -2 when no horn stands there at a tier. Asked again under the room's id for it, it answers as
 *  it did. */
export async function soundHorn(database: Db, account: string, room: string, now: number, rid?: string) {
  const kept = await keptAnswer(database, rid);
  if (kept !== null) return kept;
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  const ranked = (asker: typeof member) =>
    outpost !== null && asker !== null && guildKey(asker.guild_id) === outpost.key && asker.rank <= 1;
  if (!outpost || !member || !ranked(member)) return -1;
  if (!(await outpostAllowed(database, account, now))) return 0;
  const horn = (await plotOf(database, member.guild_id, outpost.site)).structures.find(
    (standing) => standing.kind === 'horn',
  );
  if (!horn || horn.tier < 1) return -2;
  // It sounds only while the asker is still the guild's founder or an admin, inside the write.
  const sound = database
    .prepare(
      `UPDATE guilds SET horn_week = ?2 WHERE id = ?1 AND horn_week <> ?2
       AND EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?3 AND guild_id = ?1 AND rank <= 1)`,
    )
    .bind(member.guild_id, weekOf(now), account);
  const written = await database.batch(withAnswer(database, rid, now, [sound], horn.tier));
  return answerOf(database, rid, written, horn.tier, async () => (ranked(await memberOf(database, account)) ? 0 : -1));
}

/** The plot an outpost room stands, with its guild's banner and the guild's id, or null for none raised there. */
export async function outpostFor(database: Db, room: string) {
  const outpost = outpostOf(room);
  if (!outpost) return null;
  const key = outpost.key;
  // A guild's id is a UUID: its key is its digits, so the id is found again by its primary key.
  const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20)}`;
  const guild = await database
    .prepare(
      `SELECT guilds.id, guilds.name, guilds.banner FROM guilds JOIN outposts ON outposts.guild_id = guilds.id
       WHERE guilds.id = ?1 AND outposts.site = ?2`,
    )
    .bind(id, outpost.site)
    .first<{ id: string; name: string; banner: string }>();
  if (!guild) return null;
  const plot = await plotOf(database, guild.id, outpost.site);
  return { guild: guild.id, name: guild.name, banner: guild.banner, site: outpost.site, plot };
}

/** A member's guild's outposts as the Guild tab shows them: the treasury and its latest lines, how many outposts the
 *  guild's level allows, the site the player stands at in their guild's room (null elsewhere), whether the guild's War
 *  Horn sounded this week (`hornSounded`), what the player took today, and each outpost with
 *  its plot, its strongbox and stores filled to now, its room, and whether the player stands at it. */
export async function outpostsRead(database: Db, account: string, guild: string, allowed: number, now: number) {
  const { treasury, ledger } = await treasuryOf(database, guild);
  const horn = await database
    .prepare('SELECT horn_week FROM guilds WHERE id = ?1')
    .bind(guild)
    .first<{ horn_week: number }>();
  const { results } = await database
    .prepare(
      'SELECT site, raised_at, strongbox, strongbox_at, stores, stores_at FROM outposts WHERE guild_id = ?1 ORDER BY raised_at',
    )
    .bind(guild)
    .all<{
      site: string;
      raised_at: number;
      strongbox: number;
      strongbox_at: number;
      stores: string;
      stores_at: number;
    }>();
  const holder = await database
    .prepare('SELECT holder FROM characters WHERE account_id = ?1')
    .bind(account)
    .first<{ holder: string | null }>();
  const outposts = [];
  for (const row of results) {
    const plot = await plotOf(database, guild, row.site);
    const room = outpostRoom(row.site, guild);
    outposts.push({
      site: row.site,
      room,
      raisedAt: row.raised_at,
      plot,
      strongbox: settled(row.strongbox, row.strongbox_at, strongboxRate(plot), now).amount,
      stores: storesNow(plot, JSON.parse(row.stores), row.stores_at, now).stores,
      here: holder?.holder?.startsWith(`${room}:`) ?? false,
    });
  }
  const { results: takes } = await database
    .prepare('SELECT stuff, taken FROM outpost_takes WHERE account_id = ?1 AND day = ?2')
    .bind(account, dayOf(now))
    .all<{ stuff: Stuff; taken: number }>();
  // The site whose guild room holds the player's character, raised there or not: where they may raise one.
  const standing = outpostOf(holder?.holder?.split(':')[0] ?? '');
  return {
    treasury,
    ledger,
    allowed,
    taken: Object.fromEntries(takes.map((take) => [take.stuff, take.taken])) as Partial<Record<Stuff, number>>,
    at: standing && standing.key === guildKey(guild) ? standing.site : null,
    hornSounded: horn?.horn_week === weekOf(now),
    outposts,
  };
}
