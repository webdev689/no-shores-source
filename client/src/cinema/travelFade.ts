// A travel by the held map as the picture shows it: the picture fades to black from the helm, the travel asked as the
// fade begins; waits black while the room moves the ship and the page loads the new waters round it; and fades in on
// the usual view over the ship. The view changes only at black.
import { smooth } from './rail.ts';

/** Each step's seconds: the fade out, the least the black waits and the most it waits on the waters, the fade in, and
 *  the last of the fade out the veil's words stand in (the veil's own fade, hud.ts `VEIL_S`). */
export const TRAVEL_FADE = {
  fadeS: 1,
  blackLeastS: 0.5,
  blackMostS: 15,
  liftS: 1,
  wordsS: 0.7,
} as const;

export type TravelFadeStep = 'fade' | 'black' | 'lift' | 'done';

const NEXT: Readonly<Record<TravelFadeStep, TravelFadeStep>> = {
  fade: 'black',
  black: 'lift',
  lift: 'done',
  done: 'done',
};

export class TravelFade {
  step: TravelFadeStep = 'fade';
  /** Seconds into the step. */
  private time = 0;
  private asked = false;
  /** Whether the room has answered the travel, and why it refused it (null taken). */
  answered = false;
  refused: string | null = null;
  readonly words: string;
  private readonly ask: () => void;

  /** Travels to the water named `water`, `ask` asking the room for the travel as the fade begins. */
  constructor(water: string, ask: () => void) {
    this.words = `Sailing for ${water}`;
    this.ask = ask;
  }

  /** Ends it at once, the picture open: a fight met cuts it short, whatever it showed. */
  cut(): void {
    [this.step, this.answered] = ['done', true];
  }

  /** The room's answer to the travel: taken (null), or why it refused it. */
  answer(refused: string | null): void {
    [this.answered, this.refused] = [true, refused];
  }

  /** `seconds` on, `ready` whether the new waters round the ship have loaded. */
  advance(seconds: number, ready: boolean): void {
    if (!this.asked && this.step === 'fade') {
      this.asked = true;
      this.ask();
    }
    this.time += seconds;
    for (;;) {
      const over = this.time - this.length(ready);
      if (over < 0 || this.step === 'done') return;
      // The black waited on the room and the waters past its least: none of that wait is carried on.
      this.time = this.step === 'black' ? Math.min(over, seconds) : over;
      this.step = NEXT[this.step];
    }
  }

  /** The step's length; the black's until the room has answered and the waters are ready. */
  private length(ready: boolean): number {
    const loaded = ready || this.refused !== null || this.time >= TRAVEL_FADE.blackMostS;
    if (this.step === 'black') return this.answered && loaded ? TRAVEL_FADE.blackLeastS : Infinity;
    if (this.step === 'fade') return TRAVEL_FADE.fadeS;
    return this.step === 'lift' ? TRAVEL_FADE.liftS : Infinity;
  }

  /** How dark the picture is: 0 open, 1 black. */
  get dark(): number {
    if (this.step === 'fade') return smooth(this.time / TRAVEL_FADE.fadeS);
    if (this.step === 'black') return 1;
    return this.step === 'lift' ? 1 - smooth(this.time / TRAVEL_FADE.liftS) : 0;
  }

  /** The veil's words while the picture is black or nearly: where the ship sails for. */
  get veil(): string | null {
    const black =
      this.step === 'black' || (this.step === 'fade' && this.time >= TRAVEL_FADE.fadeS - TRAVEL_FADE.wordsS);
    return black ? this.words : null;
  }

  /** Whether the player has the ship again. */
  get control(): boolean {
    return this.step === 'done';
  }

  /** How much of the picture is the helm's view: all of it as it fades out and while black, none as it fades in on
   *  the usual view. */
  get helmShare(): number {
    return this.step === 'fade' || this.step === 'black' ? 1 : 0;
  }
}
