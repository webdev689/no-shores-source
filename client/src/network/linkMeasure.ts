// How a link to a room is doing, as the page measures it: its lag, the time from an input sent to the first snapshot
// that shows the room took it (a round trip, and up to a tick the room waited to step it), smoothed, with how much it
// strays; and its loss, the share of snapshots that came too late or could not be made whole, as a datagram's would.

/** How much of each new lag is taken into the smoothed one, as TCP smooths its round trip (RFC 6298). */
const TAKEN = 1 / 8;
/** The most inputs kept waiting for their answer: 4 s of ticks. */
const KEPT = 240;

export interface Measured {
  /** The smoothed time from an input to the snapshot that shows it taken, and how much it strays, milliseconds. */
  readonly lagMs: number;
  readonly strayMs: number;
  /** The share of snapshots heard that were passed over, 0 to 1. */
  readonly lost: number;
}

export class LinkMeasure {
  private readonly sentAt = new Map<number, number>();
  private lag: number | null = null;
  private stray = 0;
  private heard = 0;
  private passed = 0;

  /** Input `sequence` sent at `now` (milliseconds). */
  sent(sequence: number, now: number): void {
    this.sentAt.set(sequence, now);
    if (this.sentAt.size > KEPT) this.sentAt.delete(this.sentAt.keys().next().value ?? 0);
  }

  /** A snapshot heard at `now`, showing the room took the player's input `acknowledged`; `kept` false when it had to be
   *  passed over. */
  snapshot(acknowledged: number, kept: boolean, now: number): void {
    this.heard += 1;
    if (!kept) this.passed += 1;
    const sent = this.sentAt.get(acknowledged);
    if (sent === undefined) return;
    for (const sequence of this.sentAt.keys()) if (sequence <= acknowledged) this.sentAt.delete(sequence);
    const lag = now - sent;
    if (this.lag === null) [this.lag, this.stray] = [lag, lag / 2];
    else {
      this.stray += TAKEN * (Math.abs(lag - this.lag) - this.stray);
      this.lag += TAKEN * (lag - this.lag);
    }
  }

  /** Starts again, as a new welcome does. */
  clear(): void {
    this.sentAt.clear();
    [this.lag, this.stray, this.heard, this.passed] = [null, 0, 0, 0];
  }

  get measured(): Measured {
    return { lagMs: this.lag ?? 0, strayMs: this.stray, lost: this.heard > 0 ? this.passed / this.heard : 0 };
  }
}
