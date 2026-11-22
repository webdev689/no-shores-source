// A frame's work kept from stopping the frames: what one part of a frame throws is reported and the next frame is
// still drawn, so a failing part leaves the rest of the game running rather than a frozen picture.

/** How many different failures are reported; a part that fails every frame is reported the first time only. */
const MOST_REPORTED = 32;

/** Reported as an uncaught error is: in the thread's console with its stack, and to the page that started it. */
const reportedUncaught = (error: unknown): void => {
  if (typeof reportError === 'function') reportError(error);
  else console.error(error);
};

export class FrameGuard {
  private readonly told = new Set<string>();
  private readonly report: (error: unknown) => void;

  constructor(report: (error: unknown) => void = reportedUncaught) {
    this.report = report;
  }

  /** Runs `work`; what it throws goes no further, and is reported the first time it is seen. */
  run(work: () => void): void {
    try {
      work();
    } catch (error) {
      this.failed(error);
    }
  }

  private failed(error: unknown): void {
    const said = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (this.told.has(said) || this.told.size >= MOST_REPORTED) return;
    this.told.add(said);
    this.report(error);
  }
}
