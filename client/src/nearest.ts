// The few nearest of many, found each frame without sorting the many: the lamps lit round the eye, the marks shown
// over what a player can use.

/** The `most` nearest offered, nearest first and in the order offered where two are as near: each offered is weighed
 *  once against the few kept. Kept from frame to frame and cleared for each. */
export class Nearest {
  /** How far off each kept one is, and its number as offered. */
  readonly away: Float64Array;
  readonly order: Uint32Array;
  count = 0;
  private readonly most: number;

  constructor(most: number) {
    this.most = most;
    this.away = new Float64Array(most);
    this.order = new Uint32Array(most);
  }

  /** Keeps none. */
  clear(): this {
    this.count = 0;
    return this;
  }

  /** Weighs the one numbered `index`, `distance` off: kept while among the nearest, after any kept as near. */
  offer(index: number, distance: number): void {
    const { away, order, most } = this;
    if (this.count === most && !(distance < (away[most - 1] ?? Infinity))) return;
    let slot = Math.min(this.count, most - 1);
    for (; slot > 0 && distance < (away[slot - 1] ?? 0); slot--) {
      away[slot] = away[slot - 1] ?? 0;
      order[slot] = order[slot - 1] ?? 0;
    }
    away[slot] = distance;
    order[slot] = index;
    this.count = Math.min(this.count + 1, most);
  }
}
