// A passage zone's room opened on a room door, for a page playing alone. The door's `openPassage` (calling room-wasm's
// `room_open_passage`) is the server's to add to server/roomDoor.ts, as its other openings are.
import type { RoomDoor } from '../../../server/roomDoor.ts';

/** A door that may open a passage zone's room from its ask. */
type PassageCapable = RoomDoor & { readonly openPassage?: (ask: string) => boolean };

/** Opens the passage zone's room `ask` names on `door`: whether it opened. A door with no way to open one throws.
 *  shortcut: reads `openPassage` off the door when it has one; drop the check once server/roomDoor.ts carries it. */
export function openPassageOn(door: PassageCapable, ask: string): boolean {
  if (!door.openPassage) throw new Error('this build’s room door cannot open a passage yet');
  return door.openPassage(ask);
}

/** The ask a passage zone's room is opened by, as room-wasm's `open_passage` reads it. */
export function passageAsk(island: string, week: number, zone: number, company: boolean, minute: number): string {
  return JSON.stringify({ island, week, zone, route: company ? 'company' : 'public', minute });
}
