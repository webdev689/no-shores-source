import type { Gear } from '../../../generated/messages/ts/overlook/wire/gear.ts';

/** Their day's and week's record, as kept with their character (`Gear`'s comment says each field): the day it is for
 *  and the tiers of the dungeon of the day cleared then (0 Normal, 1 Elite, 2 Abyss); the week it is for, whether
 *  they cleared each of the week's two, and whether they hold the Abyss boon; and each playlist's, the Elite's then
 *  the Abyss's: its daily reward taken that day, and its clears counted that week, to three. The page judges each by
 *  its own day. */
export interface ActivityRecord {
  readonly day: number;
  readonly cleared: readonly number[];
  readonly week: number;
  readonly elite: boolean;
  readonly abyss: boolean;
  readonly boon: boolean;
  readonly playlistTaken?: readonly [boolean, boolean];
  readonly playlistClears?: readonly [number, number];
}

/** The record a gear message carries. */
export function activityOf(gear: Gear): ActivityRecord {
  return {
    day: gear.activityDay(),
    cleared: Array.from(gear.clearedArray() ?? []),
    week: gear.activityWeek(),
    elite: gear.weekElite(),
    abyss: gear.weekAbyss(),
    boon: gear.boon(),
    playlistTaken: [gear.elitePlaylistTaken(), gear.abyssPlaylistTaken()],
    playlistClears: [gear.elitePlaylistClears(), gear.abyssPlaylistClears()],
  };
}
