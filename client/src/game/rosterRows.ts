import type { Person, Roster } from '../network/accounts.ts';

/**
 * What the Roster's three columns hold, after Destiny 1's: Game (the party, then the players in the same room),
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
  /** The party's leader, marked as Destiny marks theirs. */
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
  readonly opens?: 'details' | 'report' | 'join';
}

/** The privacies, in the order the accounts number them. */
export const PRIVACIES = ['Public', 'Friends Only', 'Invite Only', 'Closed'] as const;
/** How many players a party holds. */
export const PARTY_MOST = 3;
/** How many rows a column shows a page. */
export const ROWS_A_PAGE = 14;

/** Where a player is, in words: a node's name, and its seas past calm; at sea; or away. */
export function placeWords(place: string | null): string {
  if (place === null) return 'Away';
  if (place === 'sea') return 'At sea';
  const node = /^node-([a-z0-9-]+?)(?:--(rough|storm))?$/.exec(place);
  if (!node) return 'Playing';
  const [, id = '', seas] = node;
  const city = id.endsWith('-social') ? id.slice(0, -'-social'.length) : id;
  const name = city.replace(
    /(^|-)([a-z])/g,
    (_whole, gap: string, first: string) => `${gap ? ' ' : ''}${first.toUpperCase()}`,
  );
  return seas ? `${name} · ${seas[0]?.toUpperCase()}${seas.slice(1)} seas` : name;
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
    if (roster.party) own.push({ label: 'Leave party', path: 'party/leave' });
    if (roster.guild) own.push({ label: 'Leave guild', path: 'guild/leave', held: true, warn: true });
    return own;
  }
  const actions: Action[] = [{ label: 'Details', opens: 'details' }];
  const party = roster.party?.members ?? [];
  const inParty = party.some((each) => each.name === name);
  const leading = !roster.party || roster.party.leader === own;
  if (roster.invites.some((each) => each.name === name))
    actions.push({ label: 'Accept party invite', path: 'party/accept', body: named, opens: 'join' });
  if (inParty && leading) {
    actions.push({ label: 'Make party leader', path: 'party/lead', body: named });
    actions.push({ label: 'Remove from party', path: 'party/kick', body: named, held: true, warn: true });
  }
  if (!inParty && person.place !== null) {
    actions.push({ label: 'Join party', path: 'party/join', body: named, opens: 'join' });
    if (leading && Math.max(1, party.length) < PARTY_MOST)
      actions.push({ label: 'Invite to party', path: 'party/invite', body: named });
  }
  if (roster.invites.some((each) => each.name === name))
    actions.push({ label: 'Decline party invite', path: 'party/decline', body: named });
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
  leads: roster.party?.leader === person.name,
  actions: actionsFor(roster, person),
});

/** The Game column: invites to a party, the party (its leader first, or the player alone, who leads their own), then
 *  those in the same room. */
export function gameRows(roster: Roster): Row[] {
  const self = roster.me;
  const party = roster.party ? roster.party.members : self ? [self] : [];
  return [
    ...roster.invites.map((person) =>
      row(roster, person, 'Invites you to their party', false, `invite-${person.name}`),
    ),
    ...party.map((person) => ({
      ...row(roster, person, placeWords(person.place), person.place === null, `game-${person.name}`),
      leads: roster.party ? roster.party.leader === person.name : person.name === self?.name,
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
export const pagesOf = (rows: readonly unknown[]): number => Math.max(1, Math.ceil(rows.length / ROWS_A_PAGE));
