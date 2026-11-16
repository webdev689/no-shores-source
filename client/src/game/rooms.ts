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
