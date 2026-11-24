/**
 * The Roster as one player sees it, after Destiny 1's: their company, then the players in the same room; their friends
 * and those asking; their guild and its invites; and whom they block. And another player's details, as Destiny's
 * Inspect shows them: what they wear and where they are, if they are friends, in the company or the guild.
 */

import type { Db } from './database.ts';
import { friendsOf } from './friends.ts';
import { keptBanner } from './guildFace.ts';
import { RANKS, guildOf } from './guilds.ts';
import { levelOf } from '../../client/src/game/guild/guildLaw.ts';
import { INVITE_MS, PRIVACIES, keepPresent, companyOf, privacyOf } from './companies.ts';
import { PERSON, type Person, type PersonRow, accountNamed, blocks, shown } from './people.ts';

/** What a room kept of a character for others to see (the gear crate's `shown.rs`). */
export interface Shown {
  readonly level: number;
  readonly defense: number;
  readonly attack: number;
  readonly emblem: string;
  readonly worn: readonly {
    readonly slot: number;
    readonly kind: number;
    readonly rarity: number;
    readonly level: number;
    readonly name: number;
    readonly named?: string;
    readonly element: number;
    readonly attack: number;
    readonly defense: number;
    readonly gilded: boolean;
  }[];
  readonly prestige?: number;
  readonly art?: number;
  readonly art_level?: number;
}

/** The most players a room lists beside the company: a social space holds a few dozen. */
const NEARBY_MOST = 64;

/** A player shown without where they are, to one they have not let see it. */
const placeless = (row: PersonRow): Person => ({ ...shown(row), place: null });

/** People by their accounts' ids, in the order asked; `?2` is now. */
async function peopleOf(database: Db, ids: readonly string[], now: number): Promise<PersonRow[]> {
  if (ids.length === 0) return [];
  const { results } = await database
    .prepare(`${PERSON} WHERE accounts.id IN (SELECT value FROM json_each(?1))`)
    .bind(JSON.stringify(ids), now)
    .all<PersonRow>();
  return ids.flatMap((id) => results.filter((row) => row.id === id));
}

/** The Roster as its routes answer it. */
export type Roster = Awaited<ReturnType<typeof rosterOf>>;
/** Another player's details as its route answers them. */
export type Details = NonNullable<Awaited<ReturnType<typeof detailsOf>>>;

/** The Roster of account `own`, who has a username. */
export async function rosterOf(database: Db, own: string, now: number) {
  await keepPresent(database, own, now);
  const [self] = await peopleOf(database, [own], now);
  const company = await companyOf(database, own);
  // The privacy that applies is the leader's; a member's own applies once they lead.
  const privacy = await privacyOf(database, company?.leader ?? own);
  const members = company
    ? await peopleOf(database, [company.leader, ...company.members.filter((id) => id !== company.leader)], now)
    : [];
  const { results: invites } = await database
    .prepare(
      `${PERSON} JOIN company_invites ON company_invites.from_id = accounts.id WHERE company_invites.to_id = ?1 AND company_invites.created_at >= ?3`,
    )
    .bind(own, now, now - INVITE_MS)
    .all<PersonRow>();
  // The players in the same room, beside the company: those with a name, less those they block; guests are counted.
  // Found from the characters the room holds and the players it last saw, never by reading every account.
  const room = self?.place ?? null;
  const inRoom = room
    ? (
        await database
          .prepare(
            `WITH here (id) AS (SELECT account_id FROM characters
             WHERE holder >= ?3 || ':' AND holder < ?3 || ';' AND held_until > ?2
             UNION SELECT account_id FROM presence WHERE room = ?3 AND until > ?2)
             ${PERSON} WHERE accounts.id IN (SELECT id FROM here) AND accounts.id != ?1
             AND accounts.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?1) LIMIT ${NEARBY_MOST}`,
          )
          .bind(own, now, room)
          .all<PersonRow>()
      ).results
    : [];
  const nearby = inRoom.filter((row) => row.name !== null && !company?.members.includes(row.id));
  const { results: befriended } = await database
    .prepare(
      `SELECT people.*, friends.accepted, friends.asker_id = ?1 AS mine FROM (${PERSON}) AS people
       JOIN friends ON (friends.asker_id = ?1 AND friends.asked_id = people.id)
       OR (friends.asked_id = ?1 AND friends.asker_id = people.id)`,
    )
    .bind(own, now)
    .all<PersonRow & { accepted: number; mine: number }>();
  const guild = await guildOf(database, own);
  const { results: guildMembers } = guild
    ? await database
        .prepare(
          `SELECT people.*, ranked.rank FROM (${PERSON}) AS people
           JOIN guild_members AS ranked ON ranked.account_id = people.id WHERE ranked.guild_id = ?1`,
        )
        .bind(guild.id, now)
        .all<PersonRow & { rank: number }>()
    : { results: [] };
  const { results: invited } = guild
    ? await database
        .prepare(`${PERSON} JOIN guild_invites AS asked ON asked.account_id = accounts.id WHERE asked.guild_id = ?1`)
        .bind(guild.id, now)
        .all<PersonRow>()
    : { results: [] };
  const { results: guildInvites } = await database
    .prepare(
      `SELECT guilds.name, guilds.tag, inviter.username AS from_name FROM guild_invites
       JOIN guilds ON guilds.id = guild_invites.guild_id JOIN accounts AS inviter ON inviter.id = guild_invites.from_id
       WHERE guild_invites.account_id = ?1 ORDER BY guild_invites.created_at DESC`,
    )
    .bind(own)
    .all<{ name: string; tag: string; from_name: string }>();
  const { results: blocked } = await database
    .prepare(
      'SELECT accounts.username AS name FROM blocks JOIN accounts ON accounts.id = blocks.blocked_id WHERE blocker_id = ?1 ORDER BY accounts.username_key',
    )
    .bind(own)
    .all<{ name: string }>();
  const { results: muted } = await database
    .prepare(
      'SELECT accounts.username AS name FROM mutes JOIN accounts ON accounts.id = mutes.muted_id WHERE muter_id = ?1 ORDER BY accounts.username_key',
    )
    .bind(own)
    .all<{ name: string }>();
  return {
    me: self ? shown(self) : null,
    privacy: PRIVACIES[privacy],
    company: company ? { leader: members[0]?.name ?? null, members: members.map(shown) } : null,
    invites: invites.map(shown),
    nearby: nearby.map(shown),
    guests: inRoom.filter((row) => row.name === null).length,
    friends: befriended.filter((row) => row.accepted).map(shown),
    asking: befriended.filter((row) => !row.accepted && !row.mine).map(shown),
    asked: befriended.filter((row) => !row.accepted && row.mine).map(placeless),
    guild: guild
      ? {
          name: guild.name,
          tag: guild.tag,
          motto: guild.motto,
          description: guild.description,
          banner: keptBanner(guild.banner, guild.name),
          level: levelOf(guild.xp),
          rank: RANKS[guild.rank],
          members: guildMembers.map((row) => ({ ...shown(row), rank: RANKS[row.rank] ?? 'Member' })),
          invited: invited.map(placeless),
        }
      : null,
    guildInvites: guildInvites.map((row) => ({ name: row.name, tag: row.tag, from: row.from_name })),
    blocked: blocked.map((row) => row.name),
    muted: muted.map((row) => row.name),
  };
}

/** Another player's details as account `own` may see them: what they wear always; where they are only to their
 *  friends, company and guild. One who blocks the asker shows them only what a stranger sees, so it tells no one they
 *  are blocked. A name no one holds is not found. */
export async function detailsOf(database: Db, own: string, name: string, now: number) {
  const them = await accountNamed(database, name);
  if (!them) return null;
  const [person] = await peopleOf(database, [them.id], now);
  if (!person) return null;
  const kept = await database
    .prepare("SELECT json_extract(body, '$.shown') AS shown FROM characters WHERE account_id = ?1")
    .bind(them.id)
    .first<{ shown: string | null }>();
  const guild = await guildOf(database, them.id);
  const close =
    them.id === own ||
    (!(await blocks(database, them.id, own)) &&
      ((await companyOf(database, own))?.members.includes(them.id) ||
        (guild !== null && (await guildOf(database, own))?.id === guild.id) ||
        (await friendsOf(database, own, now)).friends.some((each) => each.name === them.username)));
  const seen: Person = shown(person);
  return {
    ...seen,
    place: close ? seen.place : null,
    playing: seen.place !== null,
    guild: guild
      ? {
          name: guild.name,
          tag: guild.tag,
          motto: guild.motto,
          description: guild.description,
          banner: keptBanner(guild.banner, guild.name),
          level: levelOf(guild.xp),
          rank: RANKS[guild.rank],
        }
      : null,
    shown: kept?.shown ? (JSON.parse(kept.shown) as Shown) : null,
  };
}
