import type { Person, Roster } from '../network/accounts.ts';
import { nodeOfRoom } from './rooms.ts';

/**
 * What the Roster's three columns hold, after Destiny 1's: Game (the company, then the players in the same room),
 * Friends and Guild; each player playing first, then those away, greyed, by name. And what may be done with each, as
 * their place in the player's lists allows.
 */

/** A row: who, what is said of them, and what may be done. */
export interface Row {
  readonly key: string;
  readonly person: Person;
  readonly words: string;
  /** Away from the game, or only asked: greyed, with no emblem. */
  readonly dim: boolean;
  /** The company's leader, marked as Destiny marks theirs. */
  readonly leads: boolean;
  readonly actions: readonly Action[];
}

/** Something a row offers: its words, the Roster's ask it makes and with what, or a view it opens. */
export interface Action {
  readonly label: string;
  readonly path?: string;
  readonly body?: Readonly<Record<string, string | number>>;
  /** Held, as what cannot be undone is. */
  readonly held?: boolean;
  readonly warn?: boolean;
  readonly opens?: 'details' | 'report' | 'join' | 'travel';
}

/** The privacies, in the order the accounts number them. */
export const PRIVACIES = ['Public', 'Friends Only', 'Invite Only', 'Closed'] as const;
/** The most players a company holds: four, as an Elite Dungeon's run is for (`accounts/companies.ts`). */
export const COMPANY_MOST = 4;
/** How many rows a column shows a page. */
export const ROWS_A_PAGE = 14;
/** The fewest a page shows, where the screen is too short for fourteen. */
export const ROWS_LEAST = 6;

/** Where a player is, in words: a node's name, a patrol's dungeon, and its difficulty past Normal; at sea; or away. */
export function placeWords(place: string | null): string {
  if (place === null) return 'Away';
  if (place === 'sea') return 'At sea';
  const node = nodeOfRoom(place);
  if (!node) return 'Playing';
  const { id, seas, dungeon, run } = node;
  const city = id.endsWith('-social') ? id.slice(0, -'-social'.length) : id;
  const name = city.replace(
    /(^|-)([a-z])/g,
    (_whole, gap: string, first: string) => `${gap ? ' ' : ''}${first.toUpperCase()}`,
  );
  const tierName = `${seas[0]?.toUpperCase()}${seas.slice(1)}`;
  // An Elite Dungeon's run says which it is, the week's by its own tier.
  if (run !== null && dungeon === null)
    return [name, seas === 'normal' ? 'Elite Dungeon' : `${tierName} Dungeon of the week`].join(' · ');
  // "difficulty" keeps an Elite voyage apart from an Elite foe.
  const tier = seas === 'normal' ? [] : [`${tierName} difficulty`];
  return [name, ...(dungeon === null ? [] : ['Dungeon']), ...tier].join(' · ');
}

/** A name with its guild's tag, as Destiny shows one: `Ada [SWK]`. */
export const nameWithTag = (person: Person): string => (person.tag ? `${person.name} [${person.tag}]` : person.name);

const byName = (one: Person, other: Person) => one.name.localeCompare(other.name, undefined, { sensitivity: 'base' });
/** Playing first, then away; each by name. */
const ordered = (people: readonly Person[]) =>
  [...people].sort((one, other) => Number(one.place === null) - Number(other.place === null) || byName(one, other));

/** What may be done with a player, as the Roster knows them. */
export function actionsFor(roster: Roster, person: Person): Action[] {
  const name = person.name;
  const own = roster.me?.name ?? '';
  const named = { name };
  if (name === own) {
    const own: Action[] = [{ label: 'Details', opens: 'details' }];
    if (roster.company) own.push({ label: 'Leave company', path: 'company/leave' });
    if (roster.guild) own.push({ label: 'Leave guild', path: 'guild/leave', held: true, warn: true });
    return own;
  }
  const actions: Action[] = [{ label: 'Details', opens: 'details' }];
  const company = roster.company?.members ?? [];
  const inCompany = company.some((each) => each.name === name);
  const leading = !roster.company || roster.company.leader === own;
  if (roster.invites.some((each) => each.name === name))
    actions.push({ label: 'Accept company invite', path: 'company/accept', body: named, opens: 'join' });
  // A member playing elsewhere is gone to without asking the Roster anything: they are in the company already.
  if (inCompany && person.place !== null && person.place !== roster.me?.place)
    actions.push({ label: 'Go to them', opens: 'travel' });
  if (inCompany && leading) {
    actions.push({ label: 'Make company leader', path: 'company/lead', body: named });
    actions.push({ label: 'Remove from company', path: 'company/kick', body: named, held: true, warn: true });
  }
  if (!inCompany && person.place !== null) {
    actions.push({ label: 'Join company', path: 'company/join', body: named, opens: 'join' });
    if (leading && Math.max(1, company.length) < COMPANY_MOST)
      actions.push({ label: 'Invite to company', path: 'company/invite', body: named });
  }
  if (roster.invites.some((each) => each.name === name))
    actions.push({ label: 'Decline company invite', path: 'company/decline', body: named });
  if (roster.friends.some((each) => each.name === name))
    actions.push({ label: 'Remove friend', path: 'friend/remove', body: named, held: true, warn: true });
  else if (roster.asking.some((each) => each.name === name)) {
    actions.push({ label: 'Accept friend', path: 'friend/accept', body: named });
    actions.push({ label: 'Decline friend', path: 'friend/remove', body: named });
  } else if (roster.asked.some((each) => each.name === name))
    actions.push({ label: 'Cancel friend ask', path: 'friend/remove', body: named });
  else actions.push({ label: 'Add friend', path: 'friend/ask', body: named });
  const guild = roster.guild;
  const theirs = guild?.members.find((each) => each.name === name);
  const myRank = guild?.rank ?? null;
  if (guild && !theirs && myRank !== 'Member') {
    if (guild.invited.some((each) => each.name === name))
      actions.push({ label: 'Cancel guild invite', path: 'guild/uninvite', body: named });
    else if (person.tag === null) actions.push({ label: 'Invite to guild', path: 'guild/invite', body: named });
  }
  if (theirs && myRank === 'Founder') {
    if (theirs.rank === 'Member') actions.push({ label: 'Make admin', path: 'guild/promote', body: named });
    if (theirs.rank === 'Admin') {
      actions.push({ label: 'Make member', path: 'guild/demote', body: named });
      actions.push({ label: 'Make founder', path: 'guild/founder', body: named, held: true, warn: true });
    }
  }
  const below = theirs && (myRank === 'Founder' || (myRank === 'Admin' && theirs.rank === 'Member'));
  if (below) actions.push({ label: 'Remove from guild', path: 'guild/remove', body: named, held: true, warn: true });
  actions.push({ label: 'Block', path: 'block', body: named, held: true, warn: true });
  actions.push({ label: 'Report', opens: 'report' });
  return actions;
}

const row = (roster: Roster, person: Person, words: string, dim: boolean, key: string): Row => ({
  key,
  person,
  words,
  dim,
  leads: roster.company?.leader === person.name,
  actions: actionsFor(roster, person),
});

/** The Game column: invites to a company, the company (its leader first, or the player alone, who leads their own), then
 *  those in the same room. */
export function gameRows(roster: Roster): Row[] {
  const self = roster.me;
  const company = roster.company ? roster.company.members : self ? [self] : [];
  return [
    ...roster.invites.map((person) =>
      row(roster, person, 'Invites you to their company', false, `invite-${person.name}`),
    ),
    ...company.map((person) => ({
      ...row(roster, person, placeWords(person.place), person.place === null, `game-${person.name}`),
      leads: roster.company ? roster.company.leader === person.name : person.name === self?.name,
    })),
    ...ordered(roster.nearby).map((person) => row(roster, person, 'Nearby', false, `game-${person.name}`)),
  ];
}

/** The Friends column: those asking first, then friends playing, those asked, and friends away. */
export function friendRows(roster: Roster): Row[] {
  const friends = ordered(roster.friends);
  const playing = friends.filter((person) => person.place !== null);
  const away = friends.filter((person) => person.place === null);
  return [
    ...roster.asking.map((person) => row(roster, person, 'Wants to be friends', false, `friend-${person.name}`)),
    ...playing.map((person) => row(roster, person, placeWords(person.place), false, `friend-${person.name}`)),
    ...roster.asked.map((person) => row(roster, person, 'Asked to be friends', true, `friend-${person.name}`)),
    ...away.map((person) => row(roster, person, 'Away', true, `friend-${person.name}`)),
  ];
}

/** The Guild column: its members playing, then away, each with their rank; then those invited. */
export function guildRows(roster: Roster): Row[] {
  const guild = roster.guild;
  if (!guild) return [];
  return [
    ...ordered(guild.members).map((person) => {
      const rank = guild.members.find((each) => each.name === person.name)?.rank ?? 'Member';
      const words = person.place === null ? `${rank} · Away` : `${rank} · ${placeWords(person.place)}`;
      return row(roster, person, words, person.place === null, `guild-${person.name}`);
    }),
    ...guild.invited.map((person) => row(roster, person, 'Invited to the guild', true, `guild-${person.name}`)),
  ];
}

/** How many pages a column's rows fill, at least one. */
export const pagesOf = (rows: readonly unknown[], perPage = ROWS_A_PAGE): number =>
  Math.max(1, Math.ceil(rows.length / perPage));
