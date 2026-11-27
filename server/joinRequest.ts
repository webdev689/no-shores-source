// What a join's request says to the rooms' host (`worker.ts`): the room it asks for, the entrance it stands at, and
// the hash a session's token is known by at sea.

import { healthAnswer } from './health.ts';
import {
  canonicalRoom,
  isleRoom,
  nodeRoom,
  passageRoom,
  regionDungeonRoom,
  seaDungeonRoom,
  seaRoom,
  TEST_GROUND,
} from './roomNames.ts';

/** A session token's SHA-256, in hex: what the sea knows a ship played unkept by, never the token itself. */
export async function sessionHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A room's name from its address, `/room/<name>`: lowercase letters, digits and hyphens, spelled as the room's one
 *  name (`canonicalRoom`), and one the rooms open (`opens`); null for any other. */
export function roomName(request: Request): string | null {
  const name = /^\/room\/([a-z0-9-]{1,64})$/.exec(new URL(request.url).pathname)?.[1];
  return name === undefined || !opens(canonicalRoom(name)) ? null : canonicalRoom(name);
}

/** Whether a name is spelled as a room the host opens (`RoomHost.openRoom`): the sea, a node's, a sea island's or its
 *  dungeon's, a region's dungeon's run, a passage zone's, a fleet's or the Test Ground's. Each object holds a room's WebAssembly, so a name of
 *  none is refused before an object is made for it. */
function opens(name: string): boolean {
  if (name.startsWith('fleet-') || name.startsWith(TEST_GROUND)) return true;
  if (seaRoom(name) !== null || passageRoom(name) !== null || seaDungeonRoom(name) !== null) return true;
  if (regionDungeonRoom(name) !== null) return true;
  if (name.startsWith('isle-')) return isleRoom(name.slice('isle-'.length)) !== null;
  return name.startsWith('node-') && nodeRoom(name.slice('node-'.length)) !== null;
}

/** The room a request to the rooms' Worker joins, or its answer when it joins none: `/health`'s, 404 for a name no
 *  room has, and 426 for a room asked for without a WebSocket. */
export function joinedRoom(request: Request): string | Response {
  const name = roomName(request);
  if (!name) return healthAnswer(request) ?? new Response('Not found', { status: 404 });
  if (request.headers.get('Upgrade') !== 'websocket')
    return new Response('A room is joined by WebSocket', { status: 426 });
  return name;
}

/** The entrance a join into a patrol's room asks to stand at, `?entrance=<number>`: as a player comes out of that
 *  entrance's dungeon. Null for none, or a number that is not one. */
export function entranceOf(request: Request): number | null {
  const asked = new URL(request.url).searchParams.get('entrance');
  return asked !== null && /^[0-9]$/.test(asked) ? Number(asked) : null;
}
