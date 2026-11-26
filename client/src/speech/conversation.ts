// The run of lines the dialogue box plays, kept apart from the page so its pacing can be tested: which line stands,
// how far it is typed, and when it moves on: by a press, or by itself under Auto and in a fight (`pace.ts`).
import type { Cast, Line } from './cast.ts';
import { Typing } from './typing.ts';
import type { VoiceProfile } from './voice.ts';

/** How long a typed line stands before it moves on by itself: long enough to read a short line twice. */
export const AUTO_HOLD_S = 1.6;

export class Conversation {
  index = 0;
  typing: Typing;
  private heldS = 0;
  private readonly lines: readonly Line[];
  private readonly cast: Cast;
  private auto: boolean;

  constructor(lines: readonly Line[], cast: Cast, auto: boolean) {
    this.lines = lines;
    this.cast = cast;
    this.auto = auto;
    this.typing = this.typingOf(0);
  }

  get line(): Line | undefined {
    return this.lines[this.index];
  }

  get finished(): boolean {
    return this.index >= this.lines.length;
  }

  get voice(): VoiceProfile | undefined {
    const speaker = this.line && this.cast.speakers[this.line.who];
    return speaker && this.cast.voices[speaker.voice];
  }

  /** A bark is shouted, so each of its syllables is leant on. */
  get emphasis(): boolean {
    return this.line?.kind === 'bark';
  }

  /** Whether its lines are moved on by a press, not by themselves: the press is then theirs while one stands. */
  get takesPresses(): boolean {
    return !this.movesOnByItself && !this.finished;
  }

  /** A bark is shouted and gone: it moves on by itself, as the barks over heads do, under either pace. */
  private get movesOnByItself(): boolean {
    return this.auto || this.emphasis;
  }

  /** Whether a line stands typed whole, waiting for the press that moves it on. */
  get waits(): boolean {
    return this.takesPresses && this.typing.done;
  }

  /** A fight begun while its lines are said: from now they move on by themselves, as a scene said in a fight does. */
  fightBegins(): void {
    this.auto = true;
  }

  /** A press: finishes the typing, or moves to the next line. */
  advance(): void {
    if (this.finished) return;
    if (!this.typing.done) this.typing.finish();
    else this.next();
  }

  /** Types on by `seconds`, moving on by itself where it does; true when a syllable should sound now. */
  step(seconds: number): boolean {
    if (this.finished) return false;
    const voiced = this.typing.step(seconds);
    if (this.movesOnByItself && this.typing.done) {
      this.heldS += seconds;
      if (this.heldS >= AUTO_HOLD_S) this.next();
    }
    return voiced;
  }

  private next(): void {
    this.index += 1;
    this.heldS = 0;
    this.typing = this.typingOf(this.index);
  }

  private typingOf(index: number): Typing {
    const line = this.lines[index];
    const speaker = line && this.cast.speakers[line.who];
    return new Typing(line?.say ?? '', speaker ? this.cast.voices[speaker.voice].syllableS : 1);
  }
}
