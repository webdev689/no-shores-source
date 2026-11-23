import { AccountLink, type Kept, LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';

/**
 * Where the game's rooms are, from its page's `?room=`: none without it (the game plays offline, judging the edge
 * itself); a whole `ws://` or `wss://` address names a server (`?room=ws://127.0.0.1:8787` under `npm run server`),
 * anything else the deployed rooms. The answer names each room's address: `node-<id>` for a node, `sea` for the sea.
 */
export function roomsFrom(given: string | null): ((name: string) => string) | null {
  if (given === null) return null;
  const server = /^wss?:\/\//.test(given) ? given.replace(/\/room(\/.*)?$/, '').replace(/\/+$/, '') : LIVE_ROOMS;
  return (name) => `${server}/room/${name}`;
}

/** Whether an address is this machine's own, where only its player runs servers. */
const LOOPBACK = /^(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/;

/** Where the game's accounts are, from its page's `?room=` and `?accounts=`. The deployed rooms keep characters on the
 *  deployed accounts; a room server on this machine keeps them on accounts named on this machine
 *  (`?accounts=http://127.0.0.1:8788` under `npm run accounts`). A session goes nowhere else, so a crafted link
 *  cannot send it to another's room or accounts: offline, or with a room server or accounts elsewhere, none are kept. */
export function accountsFrom(rooms: string | null, given: string | null): string | null {
  if (rooms === null) return null;
  const named = /^wss?:\/\//.test(rooms);
  if (named && !LOOPBACK.test(rooms)) return null;
  if (given !== null && LOOPBACK.test(given)) return given;
  return named ? null : LIVE_ACCOUNTS;
}

/** The page's account, from its address: the link to the accounts its `?room=` and `?accounts=` name (null for none),
 *  and a way to the session's token the rooms keep the player's character by, as it stands once the player is signed
 *  in or made a guest. A Discord sign-in comes back with a code in the address's fragment, which is taken and cleared
 *  at once; the tab's own nonce (in `passing`) redeems it. */
export function accountOf(
  page: Location,
  kept: Kept,
  passing: Kept,
): { link: AccountLink | null; session: () => Promise<string | null> } {
  const asking = new URLSearchParams(page.search);
  const where = accountsFrom(asking.get('room'), asking.get('accounts'));
  if (where === null) return { link: null, session: () => Promise.resolve(null) };
  const link = new AccountLink(where, kept, undefined, passing);
  if (link.takeFrom(page.hash)) history.replaceState(null, '', `${page.pathname}${page.search}`);
  // The token is read as each room connects, so a sign-in made after startup (at the story's helm) is the one used.
  const first = link.session();
  return { link, session: () => first.then(() => link.token) };
}

/** A node's room's name: a patrol, mission, dungeon or boss at a voyage's harder difficulty is its own room
 *  (`node-<id>--elite`); a social space is one for everyone, whatever the difficulty; an outpost site is the room of
 *  the player's guild's outpost there (`node-<id>--guild-<key>`), or the wild site for one in no guild. */
export function nodeRoom(
  node: { readonly id: string; readonly kind: string },
  difficulty: Difficulty,
  guild: string | null = null,
): string {
  if (node.kind === 'outpost') return guild ? `node-${node.id}--guild-${guild}` : `node-${node.id}`;
  return node.kind === 'social' || difficulty === 'normal' ? `node-${node.id}` : `node-${node.id}--${difficulty}`;
}

/** The sea's room a voyage at `difficulty` sails in: `sea` at Normal, else `sea--elite` or `sea--abyss`. */
export function seaRoomName(difficulty: Difficulty): string {
  return difficulty === 'normal' ? 'sea' : `sea--${difficulty}`;
}

/** A patrol's dungeon's room's name before any run: `node-<id>--dungeon-<number>`, the one shared room at Normal, or
 *  `node-<id>--elite--dungeon-<number>`, whose runs (`runOf`) are its rooms at Elite and Abyss. */
export function dungeonRoom(patrol: { readonly id: string }, difficulty: Difficulty, number: number): string {
  const seas = difficulty === 'normal' ? '' : `--${difficulty}`;
  return `node-${patrol.id}${seas}--dungeon-${number}`;
}

/** Other names for Elite and Abyss, which a place the accounts kept may still carry. */
const OLD_NAMES: Readonly<Record<string, Difficulty>> = { rough: 'elite', storm: 'abyss' };

/** The node and difficulty a node's room is for (`node-<id>`, `node-<id>--elite`, a guild's outpost's
 *  `node-<id>--guild-<key>` at Normal), the patrol's dungeon it is
 *  (`--dungeon-<number>` after those, never a node's own name), a playlist's run's foes' level (`--playlist-<level>`),
 *  and its run's instance (`--run-<instance>` last); null for any other room. */
export function nodeOfRoom(room: string): {
  readonly id: string;
  readonly seas: Difficulty;
  readonly dungeon: number | null;
  readonly run: string | null;
  readonly playlist: number | null;
} | null {
  const found =
    /^node-([a-z0-9-]+?)(?:--(elite|abyss|rough|storm)|--guild-[0-9a-f]{32})?(?:--dungeon-([0-2]))?(?:--playlist-([1-9][0-9]?)|--(sea))?(?:--run-([a-z0-9]{8}))?$/.exec(
      room,
    );
  if (!found?.[1]) return null;
  const named = found[2];
  const dungeon = found[3] === undefined ? null : Number(found[3]);
  const seas = named === undefined ? 'normal' : (OLD_NAMES[named] ?? (named as Difficulty));
  const playlist = found[4] === undefined ? null : Number(found[4]);
  // A run started from the Playlist is an Elite Dungeon's alone, at Elite or Abyss, as the rooms read it.
  const marked = playlist !== null || found[5] !== undefined;
  if (marked && (dungeon !== null || found[6] === undefined || seas === 'normal')) return null;
  return { id: found[1], seas, dungeon, run: found[6] ?? null, playlist };
}

// A run's instance is drawn as the server's Find a Company draws one, and a run started at sea read, by one rule.
export { runInstance, startedAtSea } from '../../../server/roomNames.ts';

/** A run's room: the dungeon's room's name, then its instance. */
export function runOf(base: string, instance: string): string {
  return `${base}--run-${instance}`;
}

/** The run of `base` a company member is in, of the places the company's members play in; null for none. */
export function sharedRun(base: string, places: readonly (string | null)[]): string | null {
  const ofBase = (place: string | null): place is string =>
    place !== null && place.startsWith(`${base}--run-`) && /^[a-z0-9]{8}$/.test(place.slice(`${base}--run-`.length));
  return places.find(ofBase) ?? null;
}

/** Where the page's company's members play, from a fresh Roster: none alone, offline, or when the accounts do not
 *  answer. */
export async function companyPlaces(link: AccountLink | null): Promise<string[]> {
  const roster = await link?.roster().catch(() => null);
  if (!roster || typeof roster === 'string') return [];
  return (roster.company?.members ?? []).flatMap((member) => (member.place === null ? [] : [member.place]));
}
