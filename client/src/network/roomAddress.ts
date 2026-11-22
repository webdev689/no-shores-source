import { TEST_GROUND } from '../../../server/roomNames.ts';

/** Where the deployed rooms are: a room is `${LIVE_ROOMS}/room/<name>`. */
export const LIVE_ROOMS = 'wss://overlook-rooms.mackcothran.workers.dev';

/** A Test Ground room's address from what a page was given: a whole `ws://` or `wss://` address as it is, or a name,
 *  that Test Ground room on the deployed rooms (`test-<name>`); null when it is neither. A name is letters, digits and
 *  hyphens, as the server takes them, and fits a room's 64 characters with its start. */
export function roomAddress(given: string): string | null {
  if (/^wss?:\/\//.test(given)) return given;
  const name = given.trim().toLowerCase();
  const most = 64 - TEST_GROUND.length;
  return new RegExp(`^[a-z0-9-]{1,${most}}$`).test(name) ? `${LIVE_ROOMS}/room/${TEST_GROUND}${name}` : null;
}

/** The longest a fleet's own name may be: a room's name is at most 64 characters, `fleet-` and the name. */
const FLEET_NAME_MOST = 58;

/** A fleet room's address from what the World Editor was given: none without it; a whole address naming a room, as
 *  it is; a server's address alone, its fleet room `fleet-editor`; a name, that fleet on the deployed rooms. */
export function fleetAddress(given: string | null): string | null {
  if (given === null) return null;
  if (/^wss?:\/\/[^/]+\/room\/[a-z0-9-]{1,64}$/.test(given)) return given;
  if (/^wss?:\/\/[^/]+\/?$/.test(given)) return `${given.replace(/\/+$/, '')}/room/fleet-editor`;
  const name = given.trim().toLowerCase();
  const fits = new RegExp(`^[a-z0-9-]{1,${FLEET_NAME_MOST}}$`).test(name);
  return fits ? `${LIVE_ROOMS}/room/fleet-${name}` : null;
}
