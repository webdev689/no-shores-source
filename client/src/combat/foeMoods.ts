// A foe's mood over its head as it changes, as Bungie makes a group's turns obvious: fear as its leader's fall breaks
// it, anger as it starts to rage, each popped once through the sink the game hands in (the speech's emotes, with their
// sounds), standing clear over its plate, and hidden where its head is off the screen or out of sight.
import type { FighterView } from '../rules/fighters.ts';

/** How a foe holds up, as the room sends it. */
export const MOOD = { steady: 0, broken: 1, raging: 2 } as const;

/** The emotes a foe's mood pops, by the speech's names. */
export type MoodEmote = 'fear' | 'anger';

/** The emote a foe's change of mood pops, from `was` (undefined for a foe not seen before) to `mood`: fear on
 *  breaking, anger on raging, nothing for anything else. */
export function moodEmote(was: number | undefined, mood: number): MoodEmote | null {
  if (mood === was) return null;
  if (mood === MOOD.broken) return 'fear';
  return mood === MOOD.raging ? 'anger' : null;
}

/** What shows the emotes, the speech's overheads in the game: popping one over a head answers how many seconds it
 *  shows; each frame, every head's point. */
export interface EmoteSink {
  emote(head: string, kind: MoodEmote): number;
  frame(seconds: number, heads: ReadonlyMap<string, readonly [number, number] | null>): void;
}

/** A foe as the moods read it: its number, its view and how it holds up (none for steady). */
export interface MoodedFoe {
  readonly id: number;
  readonly view: FighterView;
  readonly mood?: number;
}

/** Each foe's mood from frame to frame, and the emotes it pops while they show, through a sink made as the first
 *  pops, so a fight in which no foe breaks lays nothing on the page. */
export class FoeMoods {
  private readonly make: () => EmoteSink;
  private sink: EmoteSink | null = null;
  private readonly moods = new Map<number, number>();
  /** The seconds each popped emote still shows, by foe. */
  private readonly showing = new Map<number, number>();

  constructor(make: () => EmoteSink) {
    this.make = make;
  }

  /** One frame `seconds` on: an emote popped over each living foe whose mood changed, and every one showing placed at
   *  its foe's head on the screen (`head`, in CSS pixels; null off the screen or out of sight). */
  update(
    foes: readonly MoodedFoe[],
    head: (view: FighterView) => readonly [number, number] | null,
    seconds: number,
  ): void {
    const heads = new Map<string, readonly [number, number] | null>();
    const present = new Set<number>();
    for (const foe of foes) {
      present.add(foe.id);
      const mood = foe.mood ?? MOOD.steady;
      const kind = moodEmote(this.moods.get(foe.id), mood);
      this.moods.set(foe.id, mood);
      if (kind && foe.view.action.kind !== 'dead') {
        this.sink ??= this.make();
        this.showing.set(foe.id, this.sink.emote(keyOf(foe.id), kind));
      }
      const left = this.showing.get(foe.id);
      if (left === undefined) continue;
      heads.set(keyOf(foe.id), head(foe.view));
      if (left - seconds <= 0) this.showing.delete(foe.id);
      else this.showing.set(foe.id, left - seconds);
    }
    for (const id of this.moods.keys()) if (!present.has(id)) this.moods.delete(id);
    for (const id of this.showing.keys()) if (!present.has(id)) this.showing.delete(id);
    this.sink?.frame(seconds, heads);
  }
}

function keyOf(id: number): string {
  return `foe-${id}`;
}
