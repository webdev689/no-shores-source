// Bars over figures never overlap. Each frame the nearest keeps its place over its figure, in front, and a farther one
// that would cover a bar already placed is lifted just above it. The picture stays still from frame to frame: the
// order changes only when a figure comes nearer by a clear margin, a lifted bar stays lifted until it stands clear by
// a margin too, and a bar eases to a new height rather than jumping to it.
import { UNDER_COMPASS } from './compass.ts';

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

/** The plates' sizes in CSS pixels, one for a foe's and a ship's alike: over a figure, its box (as tall as its emblem's
 *  square) and its bar's height; at the top of the screen, the boss bar's box at most `width` and `share` of the
 *  screen's width, its bar's height, and how far down it stands: under the compass. */
export const PLATES = {
  overhead: { width: 140, height: 26, bar: 8 },
  boss: { width: 640, share: 0.76, height: 48, bar: 16, top: UNDER_COMPASS },
} as const;

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
  /** How far down the highest plate's top may stand: under the compass, or under what stands under it. */
  top = UNDER_COMPASS;

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
      // Never over the compass at the top of the screen: a plate high in the view stands under its foot.
      const floor = this.top + spot.height;
      // In the pushes' own sums, so a bar pushed to a box's edge is clear of it: (foot + height) - height can round
      // short of foot, and a bar under a box would be pushed to the same place for ever.
      const covers = (box: Box, foot: number) =>
        Math.abs(spot.x - box.x) < halfWidth + box.halfWidth + GAP + slack &&
        foot > box.top - GAP &&
        foot < box.bottom + GAP + spot.height;
      // Each push sets the bar above one box for good, as it only ever rises, so this ends; one that would rise over
      // the compass goes under the boxes instead, each push only lowering it.
      let bottom = Math.max(spot.y, floor);
      for (let pushed = true; pushed;) {
        pushed = false;
        for (const box of placed.filter((each) => covers(each, bottom))) [bottom, pushed] = [box.top - GAP, true];
      }
      if (bottom < floor) {
        bottom = floor;
        for (let pushed = true; pushed;) {
          pushed = false;
          for (const box of placed.filter((each) => covers(each, bottom)))
            [bottom, pushed] = [box.bottom + GAP + spot.height, true];
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
