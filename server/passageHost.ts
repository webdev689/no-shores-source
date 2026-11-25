/**
 * What a room host does for the passages: opens a passage zone's room from its name (`passageAsk`), and lays an
 * island's week's web with the room's own module, which a passage zone's room and its island's patrol zone judge each
 * kept character's arrival by (`arrival.ts`).
 */

import type { PassageWeb, Passages } from './arrival.ts';
import { passageAsk } from './roomNames.ts';
import type { RoomDoor } from './roomDoor.ts';

/** An island's passages' web for a week as the room's module lays it; null for an island with none. */
export function webOf(room: Pick<RoomDoor, 'passageWeb'>, island: string, week: number): PassageWeb | null {
  const text = room.passageWeb(island, week);
  return text === '' ? null : (JSON.parse(text) as PassageWeb);
}

/** What a kept character's passage arrivals are judged by: its body, and the webs the room's module lays. */
export function passagesOf(room: Pick<RoomDoor, 'passageWeb'>, body: string | null): Passages {
  return { body, web: (island, week) => webOf(room, island, week) };
}

/** Opens the passage zone's room `name` at Unix minute `minute`: '' when it opened, else why it did not. */
export function openPassageRoom(room: Pick<RoomDoor, 'openPassage'>, name: string, minute: number): string {
  const asked = passageAsk(name, minute);
  if ('why' in asked) return asked.why;
  return room.openPassage(asked.ask) ? '' : 'No such passage.';
}
