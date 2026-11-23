/**
 * What fills an outpost by time, and what its room asks of the accounts. The strongbox fills each whole hour by its
 * Counting House's tier and holds two days of it; the stores fill each whole day from the Island Camp and the Dockyard
 * and hold three days of each; neither is written until it is settled, as it is read or emptied. A room asks on a
 * player's behalf what only the accounts can do: put Aurem into the treasury, deliver materials to a structure being
 * built, take from the stores (so many a member a day), sound the War Horn (once a guild a week), and read the plot
 * its outpost stands as.
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
import type { Db } from './database.ts';
import { type Moved, move, treasuryOf } from './treasury.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A guild's short key, as its outposts' rooms are named: its id's first eight hexadecimal digits. */
export const guildKey = (guild: string) => guild.replaceAll('-', '').slice(0, 8).toLowerCase();
/** The room a guild's outpost at a site plays in. */
export const outpostRoom = (site: string, guild: string) => `node-${site}--guild-${guildKey(guild)}`;
/** The site and guild key an outpost room's name holds, or null for another room. */
export function outpostOf(room: string): { site: string; key: string } | null {
  const found = /^node-([a-z0-9-]{1,48})--guild-([0-9a-f]{8})$/.exec(room);
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

/** An outpost's stores filled to now: each material by whole days, three days of it at most. */
export function storesNow(plot: Plot, stores: Readonly<Partial<Record<Stuff, number>>>, since: number, now: number) {
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
    filled[stuff] = Math.min(Math.max(kept, rate * STORES_HOLD_DAYS), kept + days * rate);
  }
  return { stores: filled, at: since + days * DAY_MS };
}

/** The guild and rank of an account, with the guild's id. */
async function memberOf(database: Db, account: string) {
  return database
    .prepare('SELECT guild_id, rank FROM guild_members WHERE account_id = ?1')
    .bind(account)
    .first<{ guild_id: string; rank: number }>();
}

/** Puts a member's Aurem into their guild's treasury, as their room took it from them, once for the room's id. */
export async function deposit(database: Db, account: string, amount: number, rid: string, now: number): Promise<Moved> {
  const member = await memberOf(database, account);
  if (!member || !Number.isInteger(amount) || amount <= 0) return 'refused';
  return move(database, member.guild_id, { account, kind: 'deposit', amount, rid: `room:${rid}`, now });
}

/** Delivers a member's materials to a structure being built at the outpost their room is: answers how many it used, the
 *  rest for the room to give back; the last delivered stands the structure risen. */
export async function deliver(
  database: Db,
  account: string,
  room: string,
  given: { id: number; stuff: Stuff; amount: number },
) {
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key) return 0;
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
  const written = await database
    .prepare(
      `UPDATE outpost_structures SET delivered = ?4, tier = CASE WHEN ?5 THEN building ELSE tier END,
       building = CASE WHEN ?5 THEN 0 ELSE building END WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND delivered = ?6
       AND building = ?7`,
    )
    .bind(
      member.guild_id,
      outpost.site,
      given.id,
      whole ? '{}' : JSON.stringify(after),
      whole ? 1 : 0,
      row.delivered,
      row.building,
    )
    .run();
  return written.meta.changes === 1 ? used : 0;
}

/** Takes up to `amount` of a material from the stores of the outpost a member's room is, within what they may take a
 *  day; answers how many they took, for their room to give them. */
export async function takeStores(
  database: Db,
  account: string,
  room: string,
  stuff: Stuff,
  amount: number,
  now: number,
) {
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key) return 0;
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
  const day = Math.floor(now / DAY_MS);
  const taken = await database
    .prepare('SELECT taken FROM outpost_takes WHERE account_id = ?1 AND day = ?2 AND stuff = ?3')
    .bind(account, day, stuff)
    .first<{ taken: number }>();
  const give = Math.max(0, Math.min(amount, filled.stores[stuff] ?? 0, STORES_TAKE_A_DAY - (taken?.taken ?? 0)));
  if (give === 0) return 0;
  const after = JSON.stringify({ ...filled.stores, [stuff]: (filled.stores[stuff] ?? 0) - give });
  const [written] = await database.batch([
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
  ]);
  return written?.meta.changes === 1 ? give : 0;
}

/** Sounds the War Horn of the outpost a member's room is, once a guild a week, by its founder or an admin: answers its
 *  tier, or 0 when it may not sound. */
export async function soundHorn(database: Db, account: string, room: string, now: number): Promise<number> {
  const outpost = outpostOf(room);
  const member = await memberOf(database, account);
  if (!outpost || !member || guildKey(member.guild_id) !== outpost.key || member.rank > 1) return 0;
  const horn = (await plotOf(database, member.guild_id, outpost.site)).structures.find(
    (standing) => standing.kind === 'horn',
  );
  if (!horn || horn.tier < 1) return 0;
  const week = weekOf(now);
  const written = await database
    .prepare('UPDATE guilds SET horn_week = ?2 WHERE id = ?1 AND horn_week <> ?2')
    .bind(member.guild_id, week)
    .run();
  return written.meta.changes === 1 ? horn.tier : 0;
}

/** The plot an outpost room stands, with its guild's banner and the guild's id, or null for none raised there. */
export async function outpostFor(database: Db, room: string) {
  const outpost = outpostOf(room);
  if (!outpost) return null;
  const guild = await database
    .prepare("SELECT id, name, banner FROM guilds WHERE lower(replace(id, '-', '')) LIKE ?1")
    .bind(`${outpost.key}%`)
    .first<{ id: string; name: string; banner: string }>();
  if (!guild) return null;
  const plot = await plotOf(database, guild.id, outpost.site);
  return { guild: guild.id, name: guild.name, banner: guild.banner, site: outpost.site, plot };
}

/** A member's guild's outposts as the Guild tab shows them: the treasury and its latest lines, how many outposts the
 *  guild's level allows, the site the player stands at in their guild's room (null elsewhere), and each outpost with
 *  its plot, its strongbox and stores filled to now, its room, and whether the player stands at it. */
export async function outpostsRead(database: Db, account: string, guild: string, allowed: number, now: number) {
  const { treasury, ledger } = await treasuryOf(database, guild);
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
  // The site whose guild room holds the player's character, raised there or not: where they may raise one.
  const standing = outpostOf(holder?.holder?.split(':')[0] ?? '');
  return {
    treasury,
    ledger,
    allowed,
    at: standing && standing.key === guildKey(guild) ? standing.site : null,
    outposts,
  };
}
