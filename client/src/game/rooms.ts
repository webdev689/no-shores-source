import { AccountLink, type Kept, LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';

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

/** Where the game's accounts are, from its page's `?room=` and `?accounts=`: a whole `http://` or `https://` address
 *  given names them (`?accounts=http://127.0.0.1:8788` under `npm run accounts`); the deployed rooms keep characters
 *  on the deployed accounts; offline, or on a room server named without accounts, none are kept. */
export function accountsFrom(rooms: string | null, given: string | null): string | null {
  if (given !== null && /^https?:\/\//.test(given)) return given;
  return rooms === null || /^wss?:\/\//.test(rooms) ? null : LIVE_ACCOUNTS;
}

/** The page's account, from its address: the link to the accounts its `?room=` and `?accounts=` name (null for none),
 *  and the session's token the rooms keep the player's character by, once the player is signed in or made a guest. A
 *  Discord sign-in comes back with its session in the address's fragment, which is taken and cleared at once. */
export function accountOf(page: Location, kept: Kept): { link: AccountLink | null; session: Promise<string | null> } {
  const asking = new URLSearchParams(page.search);
  const where = accountsFrom(asking.get('room'), asking.get('accounts'));
  if (where === null) return { link: null, session: Promise.resolve(null) };
  const link = new AccountLink(where, kept);
  if (link.takeFrom(page.hash)) history.replaceState(null, '', `${page.pathname}${page.search}`);
  return { link, session: link.session().then(() => link.token) };
}
