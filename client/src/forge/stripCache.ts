import type { Strip } from './compose.ts';

/** A strip that failed to arrive is asked for again only this long after, not on every frame that wants it. */
export const RETRY_AFTER_MS = 5000;

interface Held<Kept> {
  readonly loading: Promise<Kept | null>;
  bytes: number;
}

/**
 * Decoded strips kept by path, up to `budget` bytes: each a move's whole sheet, a megabyte or more, so a crowd's dresses
 * would hold gigabytes kept for ever. Past the budget, the least lately asked for are let go and fetched again if
 * asked; one still arriving is never let go, and one that failed is forgotten after a while so it is tried again.
 */
export class StripCache<Kept = Strip> {
  private readonly held = new Map<string, Held<Kept>>();
  private readonly budget: number;
  private readonly measure: (kept: Kept) => number;
  private bytes = 0;

  /** Kept up to `budget` bytes, each as `measure` counts it: a decoded strip's pixels unless told otherwise. */
  constructor(budget: number, measure: (kept: Kept) => number = (kept) => (kept as Strip).data.byteLength) {
    this.budget = budget;
    this.measure = measure;
  }

  /** The bytes of decoded strips kept now. */
  get kept(): number {
    return this.bytes;
  }

  /** Whether a strip at `path` is kept or on its way. */
  has(path: string): boolean {
    return this.held.has(path);
  }

  /** The strip at `path`, kept, or loaded by `load` and kept. */
  get(path: string, load: () => Promise<Kept | null>): Promise<Kept | null> {
    const kept = this.held.get(path);
    if (kept) {
      // Asked again, it is kept the longest of all.
      this.held.delete(path);
      this.held.set(path, kept);
      return kept.loading;
    }
    const entry: Held<Kept> = { loading: load(), bytes: 0 };
    this.held.set(path, entry);
    entry.loading.then(
      (strip) => {
        if (this.held.get(path) !== entry) return;
        entry.bytes = strip ? this.measure(strip) : 0;
        this.bytes += entry.bytes;
        this.trim();
      },
      () =>
        setTimeout(() => {
          if (this.held.get(path) === entry) this.held.delete(path);
        }, RETRY_AFTER_MS),
    );
    return entry.loading;
  }

  private trim(): void {
    for (const [path, entry] of this.held) {
      if (this.bytes <= this.budget) return;
      if (entry.bytes === 0) continue;
      this.held.delete(path);
      this.bytes -= entry.bytes;
    }
  }
}
