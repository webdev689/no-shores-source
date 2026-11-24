/**
 * A guild's outposts (`outpostLaw.ts`): one raised at a site for its Aurem, its hall and banner standard standing at
 * once; structures placed and risen tier by tier, each costing the treasury its Aurem at once and then waiting on the
 * materials its members deliver; decoration set and taken up; the strongbox emptied into the treasury; and an outpost
 * abandoned. Its founder and admins build, at the outpost itself; any member collects there; only the founder abandons,
 * from anywhere. Whatever is taken back refunds half its Aurem. Each write holds only while the asker still has their
 * rank and what it changes is as it was read, both inside it; a page may name its ask (`rid`), so one sent twice
 * moves its Aurem once.
 */

import { levelOf } from '../../client/src/game/guild/guildLaw.ts';
import {
  type Plot,
  RAISE_AUREM,
  TREASURY_MOST,
  decorCap,
  decorPrice,
  decorRefusal,
  hallTier,
  pieceOf,
  kindOf,
  outpostsAllowed,
  placeRefusal,
  riseRefusal,
} from '../../client/src/game/guild/outpostLaw.ts';
import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import type { KeptGuild } from './guildFace.ts';
import { fills, outpostRoom, plotOf, settled, settling, strongboxRate } from './outpostStores.ts';
import { randomToken } from './secrets.ts';
import { type Moved, type Paid, move } from './treasury.ts';

/** The most a founder or admin holds of the guild's ranks, and the most a member does. */
const ADMIN = 1;
const FOUNDER = 0;
const MEMBER = 2;
/** A site's id, as a node's is; and the id a page may give an ask, so the ask sent twice is made once. */
const SITE = /^[a-z0-9-]{1,48}$/;
const ASKED_ID = /^[a-z0-9-]{1,64}$/;
/** The banner standard's cell before the hall, by the hall's turn: three cells out from its middle, its front's way. */
const STANDARD_AT: readonly (readonly [number, number])[] = [
  [7, 11],
  [4, 7],
  [8, 4],
  [11, 8],
];

/** Said when what an ask would change changed before it was made. */
const STALE = 'That changed as you asked. Look again.';
/** The answer for a move the treasury refused or found stale, or one made now or already. */
const answered = (moved: Moved | 'stale', refused: string, stale = STALE): Answer =>
  moved === 'refused' ? said(409, refused) : moved === 'stale' ? said(409, stale) : done;
const aurem = (amount: number) => `${amount.toLocaleString('en-GB')} Aurem`;
const lacks = (amount: number, what: string) => `The treasury lacks the ${aurem(amount)} ${what} takes.`;

/** Whether the account's character is held now by the guild's outpost room at a site: the player is there. */
async function there(database: Db, own: string, site: string, guild: string, now: number): Promise<boolean> {
  const row = await database
    .prepare('SELECT 1 AS yes FROM characters WHERE account_id = ?1 AND holder LIKE ?2 AND held_until > ?3')
    .bind(own, `${outpostRoom(site, guild)}:%`, now)
    .first<{ yes: number }>();
  return row !== null;
}

/** SQL that holds while the asker still has a rank at most `rank` in the guild, its parameters numbered from `from`
 *  (the account, then the guild). */
const ranked = (from: number, rank: number) =>
  `EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?${from} AND guild_id = ?${from + 1} AND rank <= ${rank})`;

/** One ask's say: who asks, their guild, the site, its ledger id and the time. */
interface Asking {
  readonly own: string;
  readonly guild: KeptGuild;
  readonly site: string;
  readonly rid: string;
  readonly now: number;
}

/** A paid write in one statement: its SQL, whose own parameters run from ?1, then the rank's and the move's guards. */
function paid(database: Db, asking: Asking, sql: (guards: string) => string, values: readonly unknown[], rank = ADMIN) {
  const statement: Paid = (guard, binds) => {
    const from = values.length + 1;
    const guards = `${ranked(from, rank)} AND ${guard(from + 2)}`;
    return database.prepare(sql(guards)).bind(...values, asking.own, asking.guild.id, ...binds);
  };
  return statement;
}

/** The paid write that settles the strongbox and stores before a change to a structure of a kind that fills them. */
async function settleFirst(database: Db, asking: Asking, kind: string, plot: Plot): Promise<Paid[]> {
  const settle = fills(kind) ? await settling(database, asking.guild.id, asking.site, plot, asking.now) : null;
  return settle ? [paid(database, asking, settle.sql, settle.values)] : [];
}

/** SQL for where everything on a plot stands, its parameters the guild ?1 and site ?2: a new structure or piece judged
 *  against the plot as read goes in only while the plot is still laid out so, so two at once never overlap. */
const LAYOUT = `(SELECT COALESCE(group_concat(spot, ';'), '') FROM (
  SELECT 's' || id || ':' || kind || ':' || x || ':' || y || ':' || turn AS spot FROM outpost_structures
  WHERE guild_id = ?1 AND site = ?2
  UNION ALL SELECT 'd' || id || ':' || piece || ':' || CAST(x * 4 AS INTEGER) || ':' || CAST(y * 4 AS INTEGER)
  FROM outpost_decor WHERE guild_id = ?1 AND site = ?2 ORDER BY 1))`;

/** A plot's layout as `LAYOUT` reads it, read before the plot itself, so a change between the two reads stales it. */
async function layoutOf(database: Db, guild: string, site: string) {
  const row = await database.prepare(`SELECT ${LAYOUT} AS laid`).bind(guild, site).first<{ laid: string }>();
  return row?.laid ?? '';
}

/** Moves Aurem for an ask with the writes it pays for. */
const moveFor = (database: Db, asking: Asking, kind: string, amount: number, writes: readonly Paid[]) =>
  move(database, asking.guild.id, { account: asking.own, kind, amount, rid: asking.rid, now: asking.now }, writes);

/** Raises an outpost at a site, its hall at the plot's middle turned as asked and its standard before the hall; the
 *  guild's count of outposts is read inside the write, so two raised at once never pass what its level allows. */
async function raise(database: Db, asking: Asking, turn: number) {
  const { guild, site, now } = asking;
  const allowed = outpostsAllowed(levelOf(guild.xp));
  const most = `At its level your guild holds ${allowed} ${allowed === 1 ? 'outpost' : 'outposts'}.`;
  const held = await database
    .prepare('SELECT COUNT(*) AS count FROM outposts WHERE guild_id = ?1')
    .bind(guild.id)
    .first<{ count: number }>();
  if ((held?.count ?? 0) >= allowed) return said(409, most);
  const turned = ((Math.trunc(turn) % 4) + 4) % 4;
  const [standardX, standardY] = STANDARD_AT[turned] ?? [7, 11];
  const structure = (id: number, kind: string, x: number, y: number) =>
    paid(
      database,
      asking,
      (guards) =>
        `INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) SELECT ?1, ?2, ?3, ?4, 1, ?5, ?6, ?7
         WHERE ${guards}`,
      [guild.id, site, id, kind, x, y, turned],
    );
  const moved = await moveFor(database, asking, 'raise', -RAISE_AUREM, [
    paid(
      database,
      asking,
      (guards) =>
        `INSERT INTO outposts (guild_id, site, raised_at, spent, strongbox_at, stores_at) SELECT ?1, ?2, ?3, ?4, ?3, ?3
         WHERE NOT EXISTS (SELECT 1 FROM outposts WHERE guild_id = ?1 AND site = ?2)
         AND (SELECT COUNT(*) FROM outposts WHERE guild_id = ?1) < ?5 AND ${guards}`,
      [guild.id, site, now, RAISE_AUREM, allowed],
    ),
    structure(1, 'hall', 6, 6),
    structure(2, 'standard', standardX, standardY),
  ]);
  return answered(moved, lacks(RAISE_AUREM, 'raising an outpost'), most);
}

/** Places a new structure, paying its first tier's Aurem; one whose first tier needs no materials stands at once. Its
 *  id and how many of its kind stand are read inside the write. */
async function place(database: Db, asking: Asking, given: Record<string, unknown>) {
  const { guild, site } = asking;
  const laid = await layoutOf(database, guild.id, site);
  const plot = await plotOf(database, guild.id, site);
  const spot = { x: Number(given['x']), y: Number(given['y']), turn: Number(given['turn']) };
  const kind = String(given['kind'] ?? '');
  const refusal = placeRefusal(plot, kind, spot, levelOf(guild.xp));
  if (refusal) return said(400, refusal);
  const found = kindOf(kind);
  const first = found?.tiers[0];
  if (!found || !first) return said(400, 'There is no such structure to build.');
  const ready = Object.keys(first.materials).length === 0;
  const moved = await moveFor(database, asking, `${ready ? 'build' : 'begin'} ${kind}`, -first.aurem, [
    ...(ready ? await settleFirst(database, asking, kind, plot) : []),
    paid(
      database,
      asking,
      (guards) =>
        `INSERT INTO outpost_structures (guild_id, site, id, kind, tier, building, x, y, turn, spent)
         SELECT ?1, ?2, COALESCE((SELECT MAX(id) FROM outpost_structures WHERE guild_id = ?1 AND site = ?2), 0) + 1,
         ?3, ?4, ?5, ?6, ?7, ?8, ?9
         WHERE (SELECT COUNT(*) FROM outpost_structures WHERE guild_id = ?1 AND site = ?2 AND kind = ?3) < ?10 AND ${LAYOUT} = ?11
         AND ${guards}`,
      [guild.id, site, kind, ready ? 1 : 0, ready ? 0 : 1, spot.x, spot.y, spot.turn, first.aurem, found.most, laid],
    ),
  ]);
  return answered(moved, lacks(first.aurem, `the ${found.name}`));
}

/** Begins a structure's next tier, paying its Aurem; one needing no materials stands risen at once. */
async function rise(database: Db, asking: Asking, id: number) {
  const { guild, site } = asking;
  const plot = await plotOf(database, guild.id, site);
  const standing = plot.structures.find((each) => each.id === id);
  if (!standing) return said(404, 'That structure is gone.');
  const refusal = riseRefusal(plot, standing, levelOf(guild.xp));
  if (refusal) return said(409, refusal);
  const tier = kindOf(standing.kind)?.tiers[standing.tier];
  if (!tier) return said(409, 'It stands at its highest tier.');
  const ready = Object.keys(tier.materials).length === 0;
  const moved = await moveFor(database, asking, `raise ${standing.kind}`, -tier.aurem, [
    ...(ready ? await settleFirst(database, asking, standing.kind, plot) : []),
    paid(
      database,
      asking,
      (guards) =>
        `UPDATE outpost_structures SET tier = tier + ?4, building = ?5, spent = spent + ?6
         WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND tier = ?7 AND building = 0 AND ${guards}`,
      [guild.id, site, id, ready ? 1 : 0, ready ? 0 : standing.tier + 1, tier.aurem, standing.tier],
    ),
  ]);
  return answered(moved, lacks(tier.aurem, 'that tier'));
}

/** Takes a structure or a piece of decoration down, half its Aurem back to the treasury; the hall stands for good. It
 *  goes only while it cost what was read, so the half given back is what it cost. */
async function takeDown(database: Db, asking: Asking, what: 'structure' | 'decor', id: number) {
  const { guild, site } = asking;
  const plot = await plotOf(database, guild.id, site);
  const structure = what === 'structure' ? plot.structures.find((each) => each.id === id) : undefined;
  const decor = what === 'decor' ? plot.decor.find((each) => each.id === id) : undefined;
  if (!structure && !decor) return said(404, 'That is gone already.');
  if (structure?.kind === 'hall') return said(409, 'The hall stands while the outpost does.');
  const [table, cost, spent] = structure
    ? ['outpost_structures', 'spent', structure.spent]
    : ['outpost_decor', 'paid', decor?.paid ?? 0];
  const moved = await moveFor(
    database,
    asking,
    `take down ${structure?.kind ?? decor?.piece ?? ''}`,
    Math.floor(spent / 2),
    [
      ...(structure ? await settleFirst(database, asking, structure.kind, plot) : []),
      paid(
        database,
        asking,
        (guards) => `DELETE FROM ${table} WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND ${cost} = ?4 AND ${guards}`,
        [guild.id, site, id, spent],
      ),
    ],
  );
  return answered(moved, 'The treasury cannot hold what it would give back.');
}

/** Sets a piece of decoration on the plot, paying its price; its id, and how many the hall holds, read inside the
 *  write. */
async function decorate(database: Db, asking: Asking, given: Record<string, unknown>) {
  const { guild, site } = asking;
  const laid = await layoutOf(database, guild.id, site);
  const plot = await plotOf(database, guild.id, site);
  const decor = {
    piece: String(given['piece'] ?? ''),
    x: Number(given['x']),
    y: Number(given['y']),
    turn: Number(given['turn']),
  };
  const refusal = decorRefusal(plot, decor);
  if (refusal) return said(400, refusal);
  const price = decorPrice(decor.piece);
  const moved = await moveFor(database, asking, `decorate ${decor.piece}`, -price, [
    paid(
      database,
      asking,
      (guards) =>
        `INSERT INTO outpost_decor (guild_id, site, id, piece, x, y, turn, paid)
         SELECT ?1, ?2, COALESCE((SELECT MAX(id) FROM outpost_decor WHERE guild_id = ?1 AND site = ?2), 0) + 1,
         ?3, ?4, ?5, ?6, ?7 WHERE (SELECT COUNT(*) FROM outpost_decor WHERE guild_id = ?1 AND site = ?2) < ?8 AND ${LAYOUT} = ?9
         AND ${guards}`,
      [guild.id, site, decor.piece, decor.x, decor.y, decor.turn, price, decorCap(hallTier(plot)), laid],
    ),
  ]);
  return answered(moved, lacks(price, `the ${pieceOf(decor.piece)?.name ?? 'piece'}`));
}

/** Empties an outpost's strongbox into the treasury, as much as the treasury holds, the rest kept in the box. */
async function collect(database: Db, asking: Asking) {
  const { guild, site, now } = asking;
  const row = await database
    .prepare(
      `SELECT strongbox, strongbox_at, (SELECT treasury FROM guilds WHERE id = ?1) AS treasury FROM outposts
       WHERE guild_id = ?1 AND site = ?2`,
    )
    .bind(guild.id, site)
    .first<{ strongbox: number; strongbox_at: number; treasury: number }>();
  if (!row) return said(404, 'Your guild holds no outpost there.');
  const box = settled(row.strongbox, row.strongbox_at, strongboxRate(await plotOf(database, guild.id, site)), now);
  if (box.amount <= 0) return said(409, 'The strongbox is empty.');
  const fits = Math.min(box.amount, TREASURY_MOST - row.treasury);
  if (fits <= 0) return said(409, 'The treasury is full.');
  const moved = await moveFor(database, asking, 'strongbox', fits, [
    paid(
      database,
      asking,
      (guards) =>
        `UPDATE outposts SET strongbox = ?3, strongbox_at = ?4 WHERE guild_id = ?1 AND site = ?2 AND strongbox = ?5
         AND strongbox_at = ?6 AND ${guards}`,
      [guild.id, site, box.amount - fits, box.at, row.strongbox, row.strongbox_at],
      MEMBER,
    ),
  ]);
  return answered(moved, 'The treasury is full.');
}

/** Abandons an outpost, half the Aurem spent on it, its structures and its decoration back to the treasury: only while
 *  all of it cost what was read. */
async function abandon(database: Db, asking: Asking) {
  const { guild, site } = asking;
  const spentSql = `outposts.spent + COALESCE((SELECT SUM(spent) FROM outpost_structures WHERE guild_id = ?1 AND
    site = ?2), 0) + COALESCE((SELECT SUM(paid) FROM outpost_decor WHERE guild_id = ?1 AND site = ?2), 0)`;
  const row = await database
    .prepare(`SELECT ${spentSql} AS spent FROM outposts WHERE guild_id = ?1 AND site = ?2`)
    .bind(guild.id, site)
    .first<{ spent: number }>();
  if (!row) return said(404, 'Your guild holds no outpost there.');
  const moved = await moveFor(database, asking, 'abandon', Math.floor(row.spent / 2), [
    paid(
      database,
      asking,
      (guards) => `DELETE FROM outposts WHERE guild_id = ?1 AND site = ?2 AND ${spentSql} = ?3 AND ${guards}`,
      [guild.id, site, row.spent],
      FOUNDER,
    ),
  ]);
  return answered(moved, 'The treasury cannot hold what it would give back.');
}

/** Whether the guild's ledger holds a line under this id: an ask made already. */
async function made(database: Db, guild: string, rid: string) {
  const row = await database
    .prepare('SELECT 1 AS yes FROM guild_ledger WHERE guild_id = ?1 AND rid = ?2')
    .bind(guild, rid)
    .first<{ yes: number }>();
  return row !== null;
}

/** What a member asks of their guild's outposts (`outpost/<ask>`): the founder and admins build at the outpost, any
 *  member collects there, and only the founder abandons one. An ask the page named that was made already answers as
 *  it did. */
export async function outpostAsk(
  database: Db,
  own: string,
  guild: KeptGuild,
  asked: string,
  given: Record<string, unknown>,
  now: number,
): Promise<Answer> {
  const site = String(given['site'] ?? '');
  if (!SITE.test(site)) return said(400, 'There is no outpost site by that name.');
  const named = given['rid'];
  if (named !== undefined && (typeof named !== 'string' || !ASKED_ID.test(named)))
    return said(400, 'That ask is not one the page makes.');
  const rid = named === undefined ? randomToken() : `page:${own}:${named}`;
  if (named !== undefined && (await made(database, guild.id, rid))) return done;
  const asking: Asking = { own, guild, site, rid, now };
  if (asked === 'abandon')
    return guild.rank === FOUNDER ? abandon(database, asking) : said(403, 'Only the founder can abandon an outpost.');
  if (!(await there(database, own, site, guild.id, now))) return said(409, 'Go to that outpost to do that.');
  if (asked === 'collect') return collect(database, asking);
  if (guild.rank > ADMIN) return said(403, 'Only the founder and admins can build.');
  const raised = (await plotOf(database, guild.id, site)).structures.length > 0;
  if (asked === 'raise')
    return raised
      ? said(409, 'Your guild holds this outpost already.')
      : raise(database, asking, Number(given['turn'] ?? 0));
  if (!raised) return said(404, 'Raise the outpost first.');
  const id = Number(given['id']);
  switch (asked) {
    case 'place':
      return place(database, asking, given);
    case 'rise':
      return rise(database, asking, id);
    case 'remove':
      return takeDown(database, asking, 'structure', id);
    case 'decorate':
      return decorate(database, asking, given);
    case 'undecorate':
      return takeDown(database, asking, 'decor', id);
    default:
      return said(404, 'No such page.');
  }
}
