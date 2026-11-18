// How a picture is fitted to its box, as Enhanced Plus fits its icons: its clear margin trimmed, then grown by whole
// pixels where that keeps most of the size the box allows, so its pixels stay square, and otherwise grown by whole
// pixels past the size and smoothed down to it once; never past four screen pixels to one of its own, and drawn at the
// screen's own pixel ratio, so it is crisp on any screen.

/** The most screen pixels one of a picture's pixels grows to, before the screen's ratio: an icon's. A picture shown
 *  large (the figure, an item's page) may grow further. */
const CAP = 4;
export const LARGE_CAP = 7;
/** The share of the fitted size a whole-number scale must keep to be taken instead. */
const SNAP = 0.75;

/** A picture fitted to a box: grown by whole pixels to `grown` times its size, then, when `smooth`, resampled once to
 *  `width` by `height` device pixels; shown at `shownWidth` by `shownHeight` CSS pixels. */
export interface Fit {
  readonly grown: number;
  readonly width: number;
  readonly height: number;
  readonly smooth: boolean;
  readonly shownWidth: number;
  readonly shownHeight: number;
}

/** Fits a picture of `width` by `height` of its own pixels to a box `box` CSS pixels a side, on a screen of `ratio`
 *  device pixels to a CSS pixel, never past `cap` to one; null for a picture or a box with no size. */
export function fitIcon(width: number, height: number, box: number, ratio = 1, cap = CAP): Fit | null {
  if (!(width > 0) || !(height > 0) || !(box > 0)) return null;
  const screen = Number.isFinite(ratio) && ratio > 0 ? Math.min(8, Math.max(0.5, ratio)) : 1;
  const room = Math.max(1, Math.floor(box * screen));
  const scale = Math.min(room / Math.max(width, height), cap * screen);
  const whole = Math.floor(scale + 1e-9);
  if (whole >= 1 && whole / scale >= SNAP) {
    const [grownWidth, grownHeight] = [width * whole, height * whole];
    return {
      grown: whole,
      width: grownWidth,
      height: grownHeight,
      smooth: false,
      shownWidth: grownWidth / screen,
      shownHeight: grownHeight / screen,
    };
  }
  const [fittedWidth, fittedHeight] = [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
  return {
    grown: scale > 1 ? Math.ceil(scale) : 1,
    width: fittedWidth,
    height: fittedHeight,
    smooth: true,
    shownWidth: fittedWidth / screen,
    shownHeight: fittedHeight / screen,
  };
}

/** Where a picture's drawn pixels lie, as [west, north, width, height]; null when none is drawn. */
export function drawnBounds(
  width: number,
  height: number,
  pixels: ArrayLike<number>,
): readonly [number, number, number, number] | null {
  let [west, north, east, south] = [width, height, -1, -1];
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if ((pixels[(row * width + column) * 4 + 3] ?? 0) === 0) continue;
      west = Math.min(west, column);
      east = Math.max(east, column);
      north = Math.min(north, row);
      south = Math.max(south, row);
    }
  return east < 0 ? null : [west, north, east - west + 1, south - north + 1];
}
