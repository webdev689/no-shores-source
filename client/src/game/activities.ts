// What is on, as the rules draw it (`gear::activities`, through room-wasm's `room_activities`): the same in every room
// and page, read by the minute.
import { type RoomDoor, startRoomDoor } from '../../../server/roomDoor.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';

/** A modifier as the player reads it: its name, and what it does. */
export interface ModifierShown {
  readonly name: string;
  readonly words: string;
}

/** The week's Elite or Abyss Dungeon: its place, its modifiers' keys ("burn-shadow", "brawler", ...), the level its
 *  foes stand at and the level that opens it. */
export interface WeekOn {
  readonly place: string;
  readonly modifiers: readonly string[];
  readonly level: number;
  readonly opens: number;
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
  readonly weekElite: WeekOn;
  readonly weekAbyss: WeekOn;
  /** Each island's band at Normal, Elite and Abyss, by continent, raised as its foes are. */
  readonly bands: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /** The revives an Abyss run's company shares. */
  readonly revives: number;
  /** The name and words of each modifier on, by its key. */
  readonly modifiers: Readonly<Record<string, ModifierShown>>;
}

/** Why each place is shut to a character (null where it is open): the dungeon of the day at each tier, an Elite
 *  Dungeon, the week's two, and the seas at each tier. */
export interface Gates {
  readonly day: readonly (string | null)[];
  readonly eliteDungeon: string | null;
  readonly weekElite: string | null;
  readonly weekAbyss: string | null;
  readonly seas: readonly (string | null)[];
}

/** Each room module's door, kept. */
const doors = new WeakMap<WebAssembly.Module, RoomDoor>();

/** The room module's door, started once. */
function doorOf(module: WebAssembly.Module): RoomDoor {
  const door = doors.get(module) ?? startRoomDoor(module);
  doors.set(module, door);
  return door;
}

/** What is on at a Unix minute, by the room module's own rules. */
export function activitiesAt(module: WebAssembly.Module, minute: number): Activities {
  return JSON.parse(doorOf(module).activities(minute)) as Activities;
}

/** Why each place is shut to a character of `level` (null where it is open), as the room module's gates judge. */
export function gatesAt(module: WebAssembly.Module, level: number, prologue: boolean): Gates {
  return JSON.parse(doorOf(module).gates(level, prologue)) as Gates;
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
