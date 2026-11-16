/** Where the deployed rooms are (the Server note in the bible): a room is `${LIVE_ROOMS}/room/<name>`. */
export const LIVE_ROOMS = 'wss://overlook-rooms.mackcothran.workers.dev';

/** A room's address from what a page was given: a whole `ws://` or `wss://` address as it is, or a room's name on the
 *  deployed rooms; null when it is neither. A name is letters, digits and hyphens, as the server takes them. */
export function roomAddress(given: string): string | null {
  if (/^wss?:\/\//.test(given)) return given;
  const name = given.trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(name) ? `${LIVE_ROOMS}/room/${name}` : null;
}
