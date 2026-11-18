// Bars over figures never overlap. Each frame the nearest keeps its place over its figure, in front, and a farther one
// that would cover a bar already placed is lifted just above it. The picture stays still from frame to frame: the
// order changes only when a figure comes nearer by a clear margin, a lifted bar stays lifted until it stands clear by
// a margin too, and a bar eases to a new height rather than jumping to it.

/** A bar to lay: its key, where it stands over its figure (its middle's x and its foot's y, in CSS pixels), its size,
 *  and how far its figure is from the eye. */
export interface BarSpot {
  readonly key: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** A bar as laid: how far above its spot it is drawn, in CSS pixels, and its place front to back, 0 in front. */
export interface LaidBar {
  readonly lift: number;
  readonly front: number;
}

/** The space kept between two bars, in CSS pixels. */
const GAP = 2;
/** How much further clear, across, a lifted bar must stand before it comes down, in CSS pixels. */
const SLACK = 10;
/** How much nearer, as a share of the depth, a figure must come before its bar goes in front of another's. */
const NEARER = 0.06;
/** How fast a bar eases to a new height: the share left after a second is e to the minus this. */
const EASE = 14;

/** The laid boxes so far, nearest first. */
interface Box {
  readonly x: number;
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
}

/** The layout of one scene's bars, kept from frame to frame. */
export class BarLayout {
  /** Last frame's keys, nearest first. */
  private order: number[] = [];
  /** Each bar's lift as drawn last frame. */
  private readonly lifts = new Map<number, number>();
  /** The bars whose own place was covered last frame, so they were lifted. */
  private lifted = new Set<number>();

  /** Lays this frame's bars, `seconds` after the last; `Infinity` sets each at its height at once. */
  lay(spots: readonly BarSpot[], seconds: number): Map<number, LaidBar> {
    const byKey = new Map(spots.map((spot) => [spot.key, spot]));
    const order = this.order.filter((key) => byKey.has(key));
    const kept = new Set(order);
    const fresh = spots.filter((spot) => !kept.has(spot.key)).sort((first, second) => first.depth - second.depth);
    order.push(...fresh.map((spot) => spot.key));
    const depthOf = (key: number | undefined) => (key === undefined ? 0 : (byKey.get(key)?.depth ?? 0));
    // Neighbours change places only for a clear margin, so the order is last frame's wherever two are close.
    for (let swapped = true; swapped;) {
      swapped = false;
      for (let index = 1; index < order.length; index++) {
        const [ahead, behind] = [order[index - 1], order[index]];
        if (ahead === undefined || behind === undefined) continue;
        if (depthOf(behind) >= depthOf(ahead) * (1 - NEARER)) continue;
        [order[index - 1], order[index]] = [behind, ahead];
        swapped = true;
      }
    }
    const placed: Box[] = [];
    const laid = new Map<number, LaidBar>();
    const lifted = new Set<number>();
    const ease = Math.exp(-EASE * Math.max(0, seconds));
    order.forEach((key, front) => {
      const spot = byKey.get(key);
      if (!spot) return;
      const slack = this.lifted.has(key) ? SLACK : 0;
      const halfWidth = spot.width / 2;
      let bottom = spot.y;
      // Each push sets the bar above one box for good, as it only ever rises, so this ends.
      for (let pushed = true; pushed;) {
        pushed = false;
        for (const box of placed) {
          const across = Math.abs(spot.x - box.x) < halfWidth + box.halfWidth + GAP + slack;
          const upright = bottom > box.top - GAP && bottom - spot.height < box.bottom + GAP;
          if (!across || !upright) continue;
          bottom = box.top - GAP;
          pushed = true;
        }
      }
      const target = spot.y - bottom;
      if (target > 0) lifted.add(key);
      const shown = this.lifts.get(key);
      const lift = shown === undefined ? target : target + (shown - target) * ease;
      this.lifts.set(key, lift);
      // The bar is boxed where it is drawn, so a farther one clears it as it eases.
      const drawnBottom = Math.min(bottom, spot.y - lift);
      placed.push({ x: spot.x, halfWidth, top: drawnBottom - spot.height, bottom: Math.max(bottom, spot.y - lift) });
      laid.set(key, { lift, front });
    });
    for (const key of this.lifts.keys()) if (!byKey.has(key)) this.lifts.delete(key);
    this.order = order;
    this.lifted = lifted;
    return laid;
  }
}
