// The typewriter under every spoken line, kept apart from the page so its timing can be tested: which characters
// show, and when a syllable sounds. A line on screen is a line heard, so the voice is driven by the typing itself.

/** How fast a line is typed. */
export const CHARACTERS_PER_SECOND = 28;
/** How long the typing holds on a full stop, a question or a cry inside a line, as a speaker draws breath. */
export const STOP_HOLD_S = 0.3;

const VOCAL = /[A-Za-z0-9]/;
const STOPS = '.!?';

/** One line being typed and voiced. */
export class Typing {
  /** How many characters show, a fraction while the next one is coming. */
  private shown = 0;
  private holdS = 0;
  /** The last stop already held, so each is held once. */
  private heldThrough = -1;
  private voiceClock = 0;
  private started = false;

  readonly text: string;
  private readonly syllableS: number;

  constructor(text: string, syllableS: number) {
    this.text = text;
    this.syllableS = syllableS;
  }

  get done(): boolean {
    return this.shown >= this.text.length;
  }

  /** The character being typed: a syllable sounds only when it is a letter or a digit. */
  get cursor(): number {
    return Math.min(Math.floor(this.shown), this.text.length - 1);
  }

  get visible(): string {
    return this.text.slice(0, Math.floor(this.shown));
  }

  /** The rest of the line, laid out unseen so the typed words never reflow. */
  get hidden(): string {
    return this.text.slice(Math.floor(this.shown));
  }

  finish(): void {
    this.shown = this.text.length;
  }

  /** Types on by `seconds`; true when a syllable should sound now. */
  step(seconds: number): boolean {
    if (this.done) return false;
    this.type(seconds);
    if (!this.started) {
      this.started = true;
      if (VOCAL.test(this.text.charAt(0))) return true;
    }
    if (this.done) return false;
    // A gap of spaces and marks is silent, and never stores up syllables to fire at once after it.
    this.voiceClock += seconds;
    if (this.voiceClock < this.syllableS) return false;
    if (!VOCAL.test(this.text.charAt(this.cursor))) {
      this.voiceClock = Math.min(this.voiceClock, this.syllableS);
      return false;
    }
    this.voiceClock -= this.syllableS;
    return true;
  }

  private type(seconds: number): void {
    let left = seconds;
    while (left > 0 && !this.done) {
      if (this.holdS > 0) {
        const held = Math.min(left, this.holdS);
        this.holdS -= held;
        left -= held;
        continue;
      }
      const target = Math.min(this.text.length, this.shown + left * CHARACTERS_PER_SECOND);
      const stop = this.nextStop();
      if (stop >= 0 && stop + 1 <= target) {
        left -= (stop + 1 - this.shown) / CHARACTERS_PER_SECOND;
        this.shown = stop + 1;
        this.heldThrough = stop;
        this.holdS = STOP_HOLD_S;
      } else {
        this.shown = target;
        left = 0;
      }
    }
  }

  /** The next stop to hold on: a full stop, question or cry followed by a space, so a line's last is never held. */
  private nextStop(): number {
    for (let place = this.heldThrough + 1; place < this.text.length - 1; place += 1) {
      if (STOPS.includes(this.text.charAt(place)) && this.text.charAt(place + 1) === ' ') return place;
    }
    return -1;
  }
}
