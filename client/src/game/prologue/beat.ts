// One beat of the story, as the director runs it: each frame it is handed the time and the controls and answers what
// to show, until it says it is done. A cutscene's beat may be skipped by holding Space; it then runs its remaining
// moments at once so the world is left as its end would leave it.
import type { InputFrame } from '../../player/input.ts';
import type { Hearing } from '../audio/music/directorLaw.ts';
import type { StoryFrame } from './stage.ts';

/** A frame's time and input, as a beat is handed them. */
export interface Tick {
  readonly seconds: number;
  /** The story's clock, seconds since it began. */
  readonly clock: number;
  readonly controls: InputFrame;
  readonly size: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
}

export interface Beat {
  readonly name: BeatName;
  /** Whether holding Space may cut it short: cutscenes, never play. */
  readonly skippable: boolean;
  /** What to show this frame, or null while it waits behind the screen's black. A beat whose work has failed (a load,
   *  a room, a fight's rules) throws it here, and the director goes on to the next beat. */
  frame(tick: Tick): StoryFrame | null;
  /** Ends a skippable beat at once, its moments run. The director frames it once more after, so the picture shows
   *  where the skip left it: that frame must start nothing new. */
  skip?(): void;
  readonly done: boolean;
  /** A key down or up; true when the beat takes it. */
  key?(key: string, down: boolean): boolean;
  /** Lets go of what the beat holds (a room, a fight, its fires). */
  leave?(): void;
  /** What its moment asks of the music this frame (music.ts); a beat that asks nothing lets what plays ring out. */
  music?(): Hearing;
  /** Whether the beat holds its world still: its time, the sea, the fires, the birds and the words all stopped, the
   *  music playing on. */
  readonly still?: boolean;
  /** Whether it begins from black: the director holds the black after the beat before (SCENE) until it is `ready`,
   *  draws its first frames under it, and fades it in. Such a beat lays no fade in of its own. */
  readonly fromBlack?: boolean;
  /** Whether what it shows has come (the wreck's mesh, the beach); none said, it is ready. */
  readonly ready?: boolean;
}

/** A change of scene through black, seconds: the fade out a beat ends with, the least the black holds between, and
 *  the fade in. */
export const SCENE = { outS: 2, blackS: 1, inS: 2.5 } as const;

/** The story's beats in order, as the owner set them: each name is where a page under development may start
 *  (`?prologue=<name>`). */
export const BEATS = [
  'intro',
  'storm',
  'creation',
  'sighted',
  'battle',
  'calm',
  'ram',
  'wake',
  'wreck',
  'overboard',
  'deep',
  'shore',
] as const;
export type BeatName = (typeof BEATS)[number];

/** A beat name read from a page's address, or null. */
export function beatNamed(name: string | null): BeatName | null {
  return BEATS.find((beat) => beat === name) ?? null;
}

/** Where the story starts: at its first beat, or for a player who has played it, at the title, where Begin goes
 *  straight into the game. */
export const PROLOGUE_KEY = 'noshores.prologue';

export function prologuePlayed(kept: Pick<Storage, 'getItem'>): boolean {
  try {
    return kept.getItem(PROLOGUE_KEY) === 'played';
  } catch {
    return false;
  }
}

export function keepProloguePlayed(kept: Pick<Storage, 'setItem'>): void {
  try {
    kept.setItem(PROLOGUE_KEY, 'played');
  } catch {
    // A browser that keeps nothing plays the story again next time.
  }
}
