// Where the fight's display lays its corner pieces, from the size of the view it stands over: the vitals at the top
// left, left of the compass, and the Arts and the weapons at the bottom left. A view too narrow to hold the vitals
// beside the compass (the Test Ground's, between its panels) stands the compass's column under them instead, so the
// two never meet. A view 1500 by 900 or larger takes every piece a step larger; one past 1440p stands them, and the
// compass's column with the boss bar and the target's plate, at twice their first size, as the rest doubles there.
import { COMPASS } from '../plus/compass.ts';
import { CORNER, tipOf, VITAL_SIZES } from '../plus/barFrame.ts';

/** The least view that takes the larger step, and the least that doubles the first. */
export const WIDE = { width: 1500, height: 900 } as const;
export const DOUBLE = { width: 2400, height: 1300 } as const;

/** A bar's length: this share of the view's width, never under `least` nor over `most`, and kept `clear` of the
 *  compass. */
export const VITAL_LENGTH = { share: 0.26, least: 150, most: 600, clear: 16 } as const;

/** The Arts' and the weapons' row at each step: how many CSS pixels a cell of the Anima's diamond and of a Tenet's
 *  ring takes, and the gap between two. */
export const ARMS_SIZES = {
  base: { cell: 2, gap: 8 },
  wide: { cell: 3, gap: 12 },
} as const;
/** The Anima's diamond and a Tenet's ring, in cells. */
export const DIAMOND_CELLS = 34;
export const RING_CELLS = 22;

/** The display's layout for a view: whether it takes the larger step, how many times its first size it is zoomed
 *  (2 past 1440p), the bars' length at that zoom, and whether the compass's column stands under the vitals (and how far
 *  down, in the view's own pixels) rather than beside them. */
export interface HudLayout {
  readonly wide: boolean;
  readonly zoom: number;
  readonly length: number;
  readonly stacked: boolean;
  readonly compassTop: number;
}

/** The compass's width in a view `width` wide, its column zoomed `zoom` times, in the view's own pixels. */
export const compassWidth = (width: number, zoom = 1): number => Math.min(COMPASS.width * zoom, COMPASS.share * width);

/** How far down the vitals reach, the buffs' row under them, at a step, at their own size. */
export function vitalsDepth(wide: boolean): number {
  const sizes = wide ? VITAL_SIZES.wide : VITAL_SIZES.base;
  return CORNER.top + sizes.health + sizes.stamina + sizes.poise + sizes.gap * 3 + sizes.buffs;
}

/** The layout for a view `width` by `height` CSS pixels. */
export function hudLayout(width: number, height: number): HudLayout {
  const zoom = width >= DOUBLE.width && height >= DOUBLE.height ? 2 : 1;
  const wide = zoom === 1 && width >= WIDE.width && height >= WIDE.height;
  const { share, least, most, clear } = VITAL_LENGTH;
  // What stands beside the compass is measured in the view's pixels, the compass at its zoom, then laid at the zoom.
  const beside = (width - compassWidth(width, zoom)) / 2 - (CORNER.side + clear) * zoom;
  const wanted = width * share;
  if (beside >= least * zoom) {
    const length = Math.round(Math.min(wanted, beside, most * zoom) / zoom);
    return { wide, zoom, length, stacked: false, compassTop: COMPASS.top * zoom };
  }
  const length = Math.round(Math.min(Math.max(least, width / 2), width - CORNER.side * 2, most) / zoom);
  return { wide, zoom, length, stacked: true, compassTop: vitalsDepth(wide) * zoom };
}

/** A bar's length for a vital whose most is `most`, beside health's `healthMost` at `length`: as a souls-like
 *  display draws them, a bar is as long as what it holds, never shorter than its two points. */
export function barLength(length: number, most: number, healthMost: number, height: number): number {
  const share = healthMost > 0 ? Math.min(1, most / healthMost) : 1;
  return Math.max(tipOf(height) * 2 + 8, Math.round(length * share));
}
