// What is on, as the rules draw it (`gear::activities`, through room-wasm's `room_activities`): the same in every room
// and page, read by the minute.
import { type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';

/** The week's Elite or Abyss Dungeon: its place, and its modifiers' keys ("burn-shadow", "brawler", ...). */
export interface OfTheWeek {
  readonly place: string;
  readonly modifiers: readonly string[];
}

/** What is on at a minute: the day's and the week's numbers, the minutes to the next of each, each island's dungeon
 *  of the day, the day's modifier, and the week's two. */
export interface Activities {
  readonly day: number;
  readonly week: number;
  readonly untilDay: number;
  readonly untilWeek: number;
  readonly ofTheDay: readonly { readonly continent: string; readonly patrol: string; readonly number: number }[];
  readonly dayModifier: string;
  readonly weekElite: OfTheWeek;
  readonly weekAbyss: OfTheWeek;
}

/** Each room module's door, kept. */
const doors = new WeakMap<WebAssembly.Module, RoomDoor>();

/** What is on at a Unix minute, by the room module's own rules. */
export function activitiesAt(module: WebAssembly.Module, minute: number): Activities {
  const door = doors.get(module) ?? startRoomDoor(module);
  doors.set(module, door);
  return JSON.parse(door.activities(minute)) as Activities;
}

/** The run an Elite Dungeon's entrance opens at a difficulty: the week's Elite or Abyss where this place is it, else
 *  the Elite Dungeon at Normal; and what it is called. */
export function eliteRun(
  place: string,
  seas: Difficulty,
  drawn: Activities,
): { readonly seas: Difficulty; readonly words: string } {
  if (seas === 'elite' && drawn.weekElite.place === place) return { seas, words: 'Elite Dungeon of the week' };
  if (seas === 'abyss' && drawn.weekAbyss.place === place) return { seas, words: 'Abyss Dungeon of the week' };
  return { seas: 'normal', words: 'Elite Dungeon' };
}
