// The Auto resolution: the scene drawn a tier smaller when its frames stay over the display's budget, and a tier larger
// again once they stay well under it. The frames are judged a window of 2 s at a time. The budget is the display's own
// frame interval, the lowest median interval of any window so far (a display shows no frame sooner, and the game's
// lightest moments, the loading veil and the menus, show it). With the GPU's clock each window is judged by the GPU's
// mean time a frame, and a tier is raised only if that time, grown by the larger tier's pixels, still fits well under:
// so a raise never brings the frames straight back over. Without the clock only the time between frames tells, which
// is the refresh's whether the GPU has room or not; a raise is then tried, and each one undone soon after waits twice
// as long before the next.

/** The scene's share of the canvas each way, largest first: Settings offers each, Auto steps between them, never
 *  below the last. */
export const SCALES = [1, 0.85, 0.75, 0.67, 0.5] as const;

/** Auto's numbers: the window, seconds; the seconds under before a raise at first, and the most it grows to; how soon
 *  a lowering undoes a raise, seconds; the shares of the budget the GPU's time may reach and must fit under at the
 *  tier above; the time between frames, as a share of the refresh's, that is over it and that meets it; and the
 *  refreshes a display may run at, milliseconds (360 to 50 frames a second). */
export const AUTO = {
  windowS: 2,
  upS: 10,
  upMostS: 160,
  undoneS: 8,
  gpuOver: 0.9,
  gpuUnder: 0.7,
  intervalOver: 1.25,
  intervalMet: 1.1,
  /** Without the clock, a step down is kept only if the frames come this much quicker for it; else the steps down
   *  wait heldS, twice as long after each that did not help, up to upMostS. */
  helped: 0.9,
  heldS: 30,
  refreshMs: [1000 / 360, 1000 / 50],
} as const;

/** The longest a frame counts toward a window, so a page hidden a while closes one window, not many. */
const LONGEST_MS = 100;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

export class AutoScale {
  /** The tier drawn now, an index into SCALES. */
  tier = 0;
  /** The display's frame interval, milliseconds, once a window has been heard. */
  refreshMs: number | null = null;
  private intervals: number[] = [];
  private gpu: number[] = [];
  private windowMs = 0;
  /** Seconds heard in all, by the windows. */
  private clock = 0;
  private underS = 0;
  private waitS: number = AUTO.upS;
  private raisedAt = -Infinity;
  /** Whether the window now heard follows a step, and is not judged: its targets are made again in it, and the GPU
   *  times that come back in it are partly the last tier's. */
  private settling = false;
  /** The interval before a step down taken without the clock, judged once that step has settled. */
  private trial: number | null = null;
  private heldUntil = -Infinity;
  private holdS: number = AUTO.heldS;

  /** Hears a frame `intervalMs` after the last and the GPU's totals for the frames whose times came back since (null
   *  without its clock); answers the tier to draw. */
  hear(intervalMs: number, gpuMs: readonly number[] | null): number {
    if (intervalMs <= 0) return this.tier;
    this.intervals.push(intervalMs);
    for (const took of gpuMs ?? []) this.gpu.push(took);
    this.windowMs += Math.min(intervalMs, LONGEST_MS);
    if (this.windowMs < AUTO.windowS * 1000) return this.tier;
    this.clock += this.windowMs / 1000;
    this.judge(this.windowMs / 1000);
    [this.intervals, this.gpu, this.windowMs] = [[], [], 0];
    return this.tier;
  }

  /** Steps the tier, if the window just heard, `seconds` long, asks it to. */
  private judge(seconds: number): void {
    const interval = median(this.intervals);
    const [fastest, slowest] = AUTO.refreshMs;
    const refresh = Math.min(slowest, Math.max(fastest, Math.min(this.refreshMs ?? Infinity, interval)));
    this.refreshMs = refresh;
    if (this.settling) {
      this.settling = false;
      return;
    }
    // The GPU's clock where its times came back for at least half the window's frames.
    const clocked = this.gpu.length * 2 >= this.intervals.length;
    const gpu = this.gpu.reduce((sum, took) => sum + took, 0) / Math.max(1, this.gpu.length);
    const grown = ((SCALES[this.tier - 1] ?? 1) / (SCALES[this.tier] ?? 1)) ** 2;
    const over = clocked ? gpu > AUTO.gpuOver * refresh : interval > AUTO.intervalOver * refresh;
    const under = clocked ? gpu * grown < AUTO.gpuUnder * refresh : interval <= AUTO.intervalMet * refresh;
    // Frames late for the CPU's sake come no quicker for fewer pixels: a step down that did not help is taken back.
    const tried = this.trial;
    this.trial = null;
    if (tried !== null && !clocked && interval > tried * AUTO.helped) {
      this.tier--;
      [this.heldUntil, this.settling] = [this.clock + this.holdS, true];
      this.holdS = Math.min(AUTO.upMostS, this.holdS * 2);
      return;
    }
    if (over) {
      this.underS = 0;
      if (this.tier === SCALES.length - 1 || (!clocked && this.clock < this.heldUntil)) return;
      this.tier++;
      this.settling = true;
      if (!clocked) this.trial = interval;
      if (this.clock - this.raisedAt < AUTO.undoneS) this.waitS = Math.min(AUTO.upMostS, this.waitS * 2);
    } else if (under && this.tier > 0) {
      this.underS += seconds;
      if (this.underS < this.waitS) return;
      this.tier--;
      [this.underS, this.raisedAt, this.settling] = [0, this.clock, true];
    } else this.underS = 0;
  }
}
