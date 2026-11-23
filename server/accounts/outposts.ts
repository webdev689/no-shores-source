/**
 * A guild's outposts (`outpostLaw.ts`): one raised at a site for its Aurem, its hall and banner standard standing at
 * once; structures placed and risen tier by tier, each costing the treasury its Aurem at once and then waiting on the
 * materials its members deliver; decoration set and taken up; the strongbox emptied into the treasury; and an outpost
 * abandoned. Its founder and admins build, at the outpost itself; any member collects there; only the founder abandons,
 * from anywhere. Whatever is taken back refunds half its Aurem. Each write holds only while the asker still has their
 * rank, read inside it.
 */

import { levelOf } from '../../client/src/game/guild/guildLaw.ts';
import {
  type Decor,
  RAISE_AUREM,
  type Standing,
  decorPrice,
  decorRefusal,
  kindOf,
  outpostsAllowed,
  placeRefusal,
  riseRefusal,
} from '../../client/src/game/guild/outpostLaw.ts';
import type { Db } from './database.ts';
import { type Answer, done, said } from './friends.ts';
import type { KeptGuild } from './guildFace.ts';
import { outpostRoom, plotOf, settled, strongboxRate } from './outpostStores.ts';
import { randomToken } from './secrets.ts';
import { type Moved, type Paid, move } from './treasury.ts';

/** The most a founder or admin holds of the guild's ranks. */
const ADMIN = 1;
const FOUNDER = 0;
/** A site's id, as a node's is. */
const SITE = /^[a-z0-9-]{1,48}$/;
/** The banner standard's cell before the hall, by the hall's turn: three cells out from its middle, its front's way. */
const STANDARD_AT: readonly (readonly [number, number])[] = [
  [7, 11],
  [4, 7],
  [8, 4],
  [11, 8],
];

/** The answer for a move the treasury refused, or one made now or already. */
const answered = (moved: Moved, refused: string): Answer => (moved === 'refused' ? said(409, refused) : done);
const aurem = (amount: number) => `${amount.toLocaleString('en-GB')} Aurem`;

/** Whether the account's character is held now by the guild's outpost room at a site: the player is there. */
async function there(database: Db, own: string, site: string, guild: string): Promise<boolean> {
  const row = await database
    .prepare('SELECT 1 AS yes FROM characters WHERE account_id = ?1 AND holder LIKE ?2')
    .bind(own, `${outpostRoom(site, guild)}:%`)
    .first<{ yes: number }>();
  return row !== null;
}

/** SQL that holds while the asker still has a rank at most `rank` in the guild, its parameters numbered from `from`
 *  (the account, then the guild). */
const ranked = (from: number, rank: number) =>
  `EXISTS (SELECT 1 FROM guild_members WHERE account_id = ?${from} AND guild_id = ?${from + 1} AND rank <= ${rank})`;

/** A paid write in one statement: its SQL, whose own parameters run from ?1, then the rank's and the move's guards. */
function paid(database: Db, sql: (guards: string) => string, values: readonly unknown[], who: readonly string[]): Paid {
  return (guard, binds) => {
    const from = values.length + 1;
    const guards = `${ranked(from, ADMIN)} AND ${guard(from + 2)}`;
    return database.prepare(sql(guards)).bind(...values, ...who, ...binds);
  };
}

/** Raises an outpost at a site, its hall at the plot's middle turned as asked and its standard before the hall. */
async function raise(database: Db, own: string, guild: KeptGuild, site: string, turn: number, now: number) {
  const held = await database
    .prepare('SELECT COUNT(*) AS count FROM outposts WHERE guild_id = ?1')
    .bind(guild.id)
    .first<{ count: number }>();
  const allowed = outpostsAllowed(levelOf(guild.xp));
  if ((held?.count ?? 0) >= allowed)
    return said(409, `At its level your guild holds ${allowed} ${allowed === 1 ? 'outpost' : 'outposts'}.`);
  const turned = ((Math.trunc(turn) % 4) + 4) % 4;
  const [standardX, standardY] = STANDARD_AT[turned] ?? [7, 11];
  const who = [own, guild.id];
  const structure = (id: number, kind: string, x: number, y: number): Paid =>
    paid(
      database,
      (guards) =>
        `INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) SELECT ?1, ?2, ?3, ?4, 1, ?5, ?6, ?7
         WHERE ${guards}`,
      [guild.id, site, id, kind, x, y, turned],
      who,
    );
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: 'raise', amount: -RAISE_AUREM, rid: randomToken(), now },
    [
      paid(
        database,
        (guards) =>
          `INSERT INTO outposts (guild_id, site, raised_at, spent, strongbox_at, stores_at) SELECT ?1, ?2, ?3, ?4, ?3, ?3
         WHERE ${guards}`,
        [guild.id, site, now, RAISE_AUREM],
        who,
      ),
      structure(1, 'hall', 6, 6),
      structure(2, 'standard', standardX, standardY),
    ],
  );
  return answered(moved, `Raising an outpost takes ${aurem(RAISE_AUREM)} from the treasury.`);
}

/** Places a new structure, paying its first tier's Aurem; one whose first tier needs no materials stands at once. */
async function place(
  database: Db,
  own: string,
  guild: KeptGuild,
  site: string,
  given: Record<string, unknown>,
  now: number,
) {
  const plot = await plotOf(database, guild.id, site);
  const spot = { x: Number(given['x']), y: Number(given['y']), turn: Number(given['turn']) };
  const kind = String(given['kind'] ?? '');
  const refusal = placeRefusal(plot, kind, spot, levelOf(guild.xp));
  if (refusal) return said(400, refusal);
  const found = kindOf(kind);
  const first = found?.tiers[0];
  if (!found || !first) return said(400, 'There is no such structure to build.');
  const ready = Object.keys(first.materials).length === 0;
  const id = Math.max(0, ...plot.structures.map((standing) => standing.id)) + 1;
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: `build ${kind}`, amount: -first.aurem, rid: randomToken(), now },
    [
      paid(
        database,
        (guards) =>
          `INSERT INTO outpost_structures (guild_id, site, id, kind, tier, building, x, y, turn, spent)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 WHERE ${guards}`,
        [guild.id, site, id, kind, ready ? 1 : 0, ready ? 0 : 1, spot.x, spot.y, spot.turn, first.aurem],
        [own, guild.id],
      ),
    ],
  );
  return answered(moved, `The ${found.name} takes ${aurem(first.aurem)} from the treasury.`);
}

/** Begins a structure's next tier, paying its Aurem; one needing no materials stands risen at once. */
async function rise(database: Db, own: string, guild: KeptGuild, site: string, id: number, now: number) {
  const plot = await plotOf(database, guild.id, site);
  const standing = plot.structures.find((each) => each.id === id);
  if (!standing) return said(404, 'That structure is gone.');
  const refusal = riseRefusal(plot, standing, levelOf(guild.xp));
  if (refusal) return said(409, refusal);
  const tier = kindOf(standing.kind)?.tiers[standing.tier];
  if (!tier) return said(409, 'It stands at its highest tier.');
  const ready = Object.keys(tier.materials).length === 0;
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: `raise ${standing.kind}`, amount: -tier.aurem, rid: randomToken(), now },
    [
      paid(
        database,
        (guards) =>
          `UPDATE outpost_structures SET tier = tier + ?4, building = ?5, spent = spent + ?6
         WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND tier = ?7 AND building = 0 AND ${guards}`,
        [guild.id, site, id, ready ? 1 : 0, ready ? 0 : standing.tier + 1, tier.aurem, standing.tier],
        [own, guild.id],
      ),
    ],
  );
  return answered(moved, `That tier takes ${aurem(tier.aurem)} from the treasury.`);
}

/** Takes a structure or a piece of decoration down, half its Aurem back to the treasury; the hall stands for good. */
async function takeDown(
  database: Db,
  own: string,
  guild: KeptGuild,
  site: string,
  what: 'structure' | 'decor',
  id: number,
  now: number,
) {
  const plot = await plotOf(database, guild.id, site);
  const table = what === 'structure' ? 'outpost_structures' : 'outpost_decor';
  const found: (Standing & { spent?: number }) | (Decor & { paid?: number }) | undefined =
    what === 'structure' ? plot.structures.find((each) => each.id === id) : plot.decor.find((each) => each.id === id);
  if (!found) return said(404, 'That is gone already.');
  if ('kind' in found && found.kind === 'hall') return said(409, 'The hall stands while the outpost does.');
  const spent = 'kind' in found ? (found.spent ?? 0) : (found.paid ?? 0);
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: `take down ${what}`, amount: Math.floor(spent / 2), rid: randomToken(), now },
    [
      paid(
        database,
        (guards) => `DELETE FROM ${table} WHERE guild_id = ?1 AND site = ?2 AND id = ?3 AND ${guards}`,
        [guild.id, site, id],
        [own, guild.id],
      ),
    ],
  );
  return answered(moved, 'The treasury cannot hold what it would give back.');
}

/** Sets a piece of decoration on the plot, paying its price. */
async function decorate(
  database: Db,
  own: string,
  guild: KeptGuild,
  site: string,
  given: Record<string, unknown>,
  now: number,
) {
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
  const id = Math.max(0, ...plot.decor.map((each) => each.id)) + 1;
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: `decorate ${decor.piece}`, amount: -price, rid: randomToken(), now },
    [
      paid(
        database,
        (guards) =>
          `INSERT INTO outpost_decor (guild_id, site, id, piece, x, y, turn, paid) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         WHERE ${guards}`,
        [guild.id, site, id, decor.piece, decor.x, decor.y, decor.turn, price],
        [own, guild.id],
      ),
    ],
  );
  return answered(moved, `That takes ${aurem(price)} from the treasury.`);
}

/** Empties an outpost's strongbox into the treasury, as much as the treasury holds. */
async function collect(database: Db, own: string, guild: KeptGuild, site: string, now: number) {
  const row = await database
    .prepare('SELECT strongbox, strongbox_at FROM outposts WHERE guild_id = ?1 AND site = ?2')
    .bind(guild.id, site)
    .first<{ strongbox: number; strongbox_at: number }>();
  if (!row) return said(404, 'Your guild holds no outpost there.');
  const box = settled(row.strongbox, row.strongbox_at, strongboxRate(await plotOf(database, guild.id, site)), now);
  if (box.amount <= 0) return said(409, 'The strongbox is empty.');
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: 'strongbox', amount: box.amount, rid: randomToken(), now },
    [
      (guard, binds) =>
        database
          .prepare(
            `UPDATE outposts SET strongbox = 0, strongbox_at = ?3 WHERE guild_id = ?1 AND site = ?2 AND strongbox_at = ?4
           AND ${guard(5)}`,
          )
          .bind(guild.id, site, box.at, row.strongbox_at, ...binds),
    ],
  );
  return answered(moved, 'The treasury is full.');
}

/** Abandons an outpost, half the Aurem spent on it, its structures and its decoration back to the treasury. */
async function abandon(database: Db, own: string, guild: KeptGuild, site: string, now: number) {
  const row = await database
    .prepare(
      `SELECT outposts.spent + COALESCE((SELECT SUM(spent) FROM outpost_structures WHERE guild_id = ?1 AND site = ?2), 0)
       + COALESCE((SELECT SUM(paid) FROM outpost_decor WHERE guild_id = ?1 AND site = ?2), 0) AS spent
       FROM outposts WHERE guild_id = ?1 AND site = ?2`,
    )
    .bind(guild.id, site)
    .first<{ spent: number }>();
  if (!row) return said(404, 'Your guild holds no outpost there.');
  const moved = await move(
    database,
    guild.id,
    { account: own, kind: 'abandon', amount: Math.floor(row.spent / 2), rid: randomToken(), now },
    [
      (guard, binds) =>
        database
          .prepare(`DELETE FROM outposts WHERE guild_id = ?1 AND site = ?2 AND ${ranked(3, FOUNDER)} AND ${guard(5)}`)
          .bind(guild.id, site, own, guild.id, ...binds),
    ],
  );
  return answered(moved, 'The treasury cannot hold what it would give back.');
}

/** What a member asks of their guild's outposts (`outpost/<ask>`): the founder and admins build at the outpost, any
 *  member collects there, and only the founder abandons one. */
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
  if (asked === 'abandon')
    return guild.rank === FOUNDER
      ? abandon(database, own, guild, site, now)
      : said(403, 'Only the founder can abandon an outpost.');
  if (!(await there(database, own, site, guild.id))) return said(409, 'Go to that outpost to do that.');
  if (asked === 'collect') return collect(database, own, guild, site, now);
  if (guild.rank > ADMIN) return said(403, 'Only the founder and admins can build.');
  const raised = (await plotOf(database, guild.id, site)).structures.length > 0;
  if (asked === 'raise')
    return raised
      ? said(409, 'Your guild holds this outpost already.')
      : raise(database, own, guild, site, Number(given['turn'] ?? 0), now);
  if (!raised) return said(404, 'Raise the outpost first.');
  const id = Number(given['id']);
  switch (asked) {
    case 'place':
      return place(database, own, guild, site, given, now);
    case 'rise':
      return rise(database, own, guild, site, id, now);
    case 'remove':
      return takeDown(database, own, guild, site, 'structure', id, now);
    case 'decorate':
      return decorate(database, own, guild, site, given, now);
    case 'undecorate':
      return takeDown(database, own, guild, site, 'decor', id, now);
    default:
      return said(404, 'No such page.');
  }
}
