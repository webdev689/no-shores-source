// A cutscene's moments: things that happen once at given seconds into it (a line spoken, a sound, a flash). Stepping
// runs every moment whose time has come, in time order, each exactly once, however long the frames are.

export type Cue = readonly [number, () => void];

export class Cues {
  private readonly cues: Cue[];
  private next = 0;

  constructor(cues: readonly Cue[]) {
    this.cues = [...cues].sort((first, second) => first[0] - second[0]);
  }

  /** Runs every moment at or before `time` not yet run. */
  step(time: number): void {
    while (this.next < this.cues.length) {
      const cue = this.cues[this.next];
      if (!cue || cue[0] > time) return;
      this.next++;
      cue[1]();
    }
  }

  /** Runs every moment left, as a skipped cutscene still leaves the world as its end would. */
  finish(): void {
    this.step(Infinity);
  }

  get done(): boolean {
    return this.next >= this.cues.length;
  }
}

/** A held key that skips: held this long it fires, its share shown meanwhile; let go, it starts again. */
export class HoldToSkip {
  readonly seconds: number;
  private held = 0;

  constructor(seconds = 1) {
    this.seconds = seconds;
  }

  /** Steps the hold by a frame; true once it has been held long enough. */
  step(seconds: number, holding: boolean): boolean {
    this.held = holding ? this.held + seconds : 0;
    return this.held >= this.seconds;
  }

  get share(): number {
    return Math.min(1, this.held / this.seconds);
  }
}
