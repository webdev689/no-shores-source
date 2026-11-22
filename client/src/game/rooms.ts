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
 *  (`node-<id>--elite`); a social space is one for everyone, whatever the difficulty. */
export function nodeRoom(node: { readonly id: string; readonly kind: string }, difficulty: Difficulty): string {
  return node.kind === 'social' || difficulty === 'normal' ? `node-${node.id}` : `node-${node.id}--${difficulty}`;
}

/** The sea's room a voyage at `difficulty` sails in: `sea` at Normal, else `sea--elite` or `sea--abyss`. */
export function seaRoomName(difficulty: Difficulty): string {
  return difficulty === 'normal' ? 'sea' : `sea--${difficulty}`;
}

/** A patrol's dungeon's room's name: one for each dungeon at each difficulty (`node-<id>--dungeon-<number>`,
 *  `node-<id>--elite--dungeon-<number>`). */
export function dungeonRoom(patrol: { readonly id: string }, difficulty: Difficulty, number: number): string {
  const seas = difficulty === 'normal' ? '' : `--${difficulty}`;
  return `node-${patrol.id}${seas}--dungeon-${number}`;
}

/** Other names for Elite and Abyss, which a place the accounts kept may still carry. */
const OLD_NAMES: Readonly<Record<string, Difficulty>> = { rough: 'elite', storm: 'abyss' };

/** The node and difficulty a node's room is for (`node-<id>`, `node-<id>--elite`), and the patrol's dungeon it is
 *  (`--dungeon-<number>` after those, never a node's own name); null for any other room. */
export function nodeOfRoom(
  room: string,
): { readonly id: string; readonly seas: Difficulty; readonly dungeon: number | null } | null {
  const found = /^node-([a-z0-9-]+?)(?:--(elite|abyss|rough|storm))?(?:--dungeon-([0-2]))?$/.exec(room);
  if (!found?.[1]) return null;
  const named = found[2];
  const dungeon = found[3] === undefined ? null : Number(found[3]);
  return { id: found[1], seas: named === undefined ? 'normal' : (OLD_NAMES[named] ?? (named as Difficulty)), dungeon };
}
