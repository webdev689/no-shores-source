// What a join's request says to the rooms' host (`worker.ts`): the room it asks for, the entrance it stands at, and
// the hash a session's token is known by at sea.

import { canonicalRoom } from './roomNames.ts';

/** A session token's SHA-256, in hex: what the sea knows a ship played unkept by, never the token itself. */
export async function sessionHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A room's name from its address, `/room/<name>`: lowercase letters, digits and hyphens, spelled as the room's one
 *  name (`canonicalRoom`). */
export function roomName(request: Request): string | null {
  const name = /^\/room\/([a-z0-9-]{1,64})$/.exec(new URL(request.url).pathname)?.[1];
  return name === undefined ? null : canonicalRoom(name);
}

/** The entrance a join into a patrol's room asks to stand at, `?entrance=<number>`: as a player comes out of that
 *  entrance's dungeon. Null for none, or a number that is not one. */
export function entranceOf(request: Request): number | null {
  const asked = new URL(request.url).searchParams.get('entrance');
  return asked !== null && /^[0-9]$/.test(asked) ? Number(asked) : null;
}
