// How a picture is fitted to its box, as Enhanced Plus fits its icons: its clear margin trimmed, then grown by whole
// pixels where that keeps most of the size the box allows, so its pixels stay square, and otherwise grown by whole
// pixels past the size and smoothed down to it once; never past four screen pixels to one of its own, and drawn at the
// screen's own pixel ratio, so it is crisp on any screen. One larger than its box (a weapon's large picture) is shrunk
// to it by an area average (`shrunk`).

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

/** How much longer than wide a picture is before it is laid on the diagonal: a blade, a staff, a gun. */
export const SLIVER = 2.5;

/** A long thin picture laid along its box's diagonal, as Destiny and Enhanced Plus lay weapons: grown by `grown` whole
 *  pixels, then turned by `turn` radians (a tall one clockwise, a wide one back) and scaled by `scale` of its own
 *  pixels into a square `room` device pixels a side; null for one that is not long and thin. */
export function diagonalFit(
  width: number,
  height: number,
  box: number,
  ratio = 1,
): { readonly room: number; readonly scale: number; readonly grown: number; readonly turn: number } | null {
  const [long, short] = [Math.max(width, height), Math.min(width, height)];
  if (!(short > 0) || !(box > 0) || long / short <= SLIVER) return null;
  const screen = Number.isFinite(ratio) && ratio > 0 ? Math.min(8, Math.max(0.5, ratio)) : 1;
  const room = Math.max(1, Math.floor(box * screen));
  // Turned, it spans (long + short) / sqrt 2 across each side; a margin keeps its ends off the frame.
  const scale = (room * 0.94 * Math.SQRT2) / (long + short);
  return { room, scale, grown: Math.max(1, Math.floor(scale)), turn: height > width ? Math.PI / 4 : -Math.PI / 4 };
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

/** For each of `to` new pixels along a line of `from` old ones, the old pixels it covers and the share of it each
 *  fills. */
function spans(from: number, to: number): (readonly [number, number])[][] {
  const step = from / to;
  return Array.from({ length: to }, (unused, place) => {
    const [start, end] = [place * step, (place + 1) * step];
    const covered: (readonly [number, number])[] = [];
    for (let old = Math.floor(start); old < Math.min(from, Math.ceil(end)); old++)
      covered.push([old, (Math.min(end, old + 1) - Math.max(start, old)) / step]);
    return covered;
  });
}

/** A picture's pixels shrunk to `toWidth` by `toHeight` by an exact area average: each new pixel the mean of the old
 *  ones it covers, each weighed by how much of it falls there and by its cover, and covered as much as they cover it.
 *  So a fine detail fades by its share of a pixel, never dropped, nor blurred over pixels it does not touch, and a
 *  clear ground darkens no edge. */
export function shrunk(
  width: number,
  height: number,
  pixels: ArrayLike<number>,
  toWidth: number,
  toHeight: number,
): Uint8ClampedArray<ArrayBuffer> {
  const [across, down] = [spans(width, toWidth), spans(height, toHeight)];
  // Each colour weighed by its cover, averaged across each row, then down each column.
  const rows = new Float64Array(toWidth * height * 4);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < toWidth; column++)
      for (const [old, share] of across[column] ?? []) {
        const [from, to] = [(row * width + old) * 4, (row * toWidth + column) * 4];
        const cover = ((pixels[from + 3] ?? 0) / 255) * share;
        for (let channel = 0; channel < 3; channel++) rows[to + channel] += (pixels[from + channel] ?? 0) * cover;
        rows[to + 3] += cover;
      }
  const out = new Uint8ClampedArray(toWidth * toHeight * 4);
  const sum = [0, 0, 0, 0];
  for (let row = 0; row < toHeight; row++)
    for (let column = 0; column < toWidth; column++) {
      sum.fill(0);
      for (const [old, share] of down[row] ?? [])
        for (let channel = 0; channel < 4; channel++)
          sum[channel] += (rows[(old * toWidth + column) * 4 + channel] ?? 0) * share;
      const [red = 0, green = 0, blue = 0, cover = 0] = sum;
      if (cover > 0) out.set([red / cover, green / cover, blue / cover, cover * 255], (row * toWidth + column) * 4);
    }
  return out;
}

/** A canvas of `own`'s pixels shrunk to `width` by `height` (`shrunk`); given a palette's `snap`, cut at half cover and
 *  snapped to it, so a picture that keeps to a palette still shows only its colours. */
export function shrunkCanvas(
  own: HTMLCanvasElement,
  width: number,
  height: number,
  snap?: (pixels: Uint8ClampedArray) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [width, height];
  const pixels = own.getContext('2d')?.getImageData(0, 0, own.width, own.height).data ?? [];
  const small = shrunk(own.width, own.height, pixels, width, height);
  if (snap) {
    for (let texel = 0; texel < small.length; texel += 4)
      if ((small[texel + 3] ?? 0) < 128) small.fill(0, texel, texel + 4);
      else small[texel + 3] = 255;
    snap(small);
  }
  canvas.getContext('2d')?.putImageData(new ImageData(small, width), 0, 0);
  return canvas;
}
