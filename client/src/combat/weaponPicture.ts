// A weapon's forge picture laid along the HUD's weapon row, as Destiny draws a weapon in hand: its long axis turned
// level, the end that stood highest (a blade's point, a gun's muzzle) to the right, and fitted to its box by whole
// pixels where it can be. A quarter turn keeps every pixel square; a picture held slantwise is turned its own way and
// smoothed once, as the gear screens lay a weapon on its tile's diagonal. One not long and thin (a shield with its
// blade) stands as it is, and one the forge drew level stays so. One larger than its box is shrunk to it by an area
// average.
import { drawnBounds, shrunkCanvas } from '../player/iconFit.ts';
import type { Picture } from '../player/picture.ts';

/** How much longer than wide (in the spread of its pixels) a picture is before it is turned level. */
export const LONG = 6;
/** A turn within this of a quarter turn is taken as the quarter, which keeps the pixels square. */
const SNAP = Math.PI / 9;
/** The most screen pixels one of a picture's pixels grows to, before the screen's ratio. */
const CAP = 4;
/** The share of the fitted size a whole-number scale must keep to be taken instead. */
const WHOLE_KEEPS = 0.75;

/** The turn, in radians clockwise, that lays a picture's drawn pixels level with the end that stood highest to the
 *  right: 0 for one not long and thin, a quarter turn for one within 20 degrees of standing upright. */
export function lengthwise(width: number, height: number, pixels: ArrayLike<number>): number {
  let [count, sumX, sumY] = [0, 0, 0];
  const drawn: number[] = [];
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if ((pixels[(row * width + column) * 4 + 3] ?? 0) === 0) continue;
      drawn.push(column, row);
      [count, sumX, sumY] = [count + 1, sumX + column, sumY + row];
    }
  if (count < 2) return 0;
  const [meanX, meanY] = [sumX / count, sumY / count];
  let [spreadX, spreadY, spreadXY] = [0, 0, 0];
  for (let place = 0; place < drawn.length; place += 2) {
    const [x, y] = [(drawn[place] ?? 0) - meanX, (drawn[place + 1] ?? 0) - meanY];
    [spreadX, spreadY, spreadXY] = [spreadX + x * x, spreadY + y * y, spreadXY + x * y];
  }
  const middle = (spreadX + spreadY) / 2;
  const reach = Math.hypot((spreadX - spreadY) / 2, spreadXY);
  if (middle + reach < LONG * Math.max(middle - reach, 1e-9)) return 0;
  // The long axis, pointed place the end that stood highest (y grows down the picture).
  let axis = Math.atan2(2 * spreadXY, spreadX - spreadY) / 2;
  if (Math.sin(axis) > 1e-9 || (Math.abs(Math.sin(axis)) <= 1e-9 && Math.cos(axis) < 0)) axis += Math.PI;
  const turn = Math.atan2(-Math.sin(axis), Math.cos(axis));
  const quarter = Math.round(turn / (Math.PI / 2)) * (Math.PI / 2);
  // Adding 0 makes a turn of -0 plain 0.
  return (Math.abs(turn - quarter) <= SNAP ? quarter : turn) + 0;
}

/** Whether `turn` is a whole number of quarter turns, which keeps pixels square. */
const square = (turn: number): boolean => Math.abs(turn / (Math.PI / 2) - Math.round(turn / (Math.PI / 2))) < 1e-6;

/** Where a picture's drawn pixels stand once turned by `turn` about its corner: the least of each turned axis and the
 *  span along each, so a slantwise weapon is fitted by the band it fills, not by its picture's whole square. */
export function turnedBounds(
  width: number,
  height: number,
  pixels: ArrayLike<number>,
  turn: number,
): readonly [number, number, number, number] {
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  let [leastU, leastV, mostU, mostV] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if ((pixels[(row * width + column) * 4 + 3] ?? 0) === 0) continue;
      for (const [x, y] of [
        [column, row],
        [column + 1, row],
        [column, row + 1],
        [column + 1, row + 1],
      ] as const) {
        const [along, across] = [x * cos - y * sin, x * sin + y * cos];
        [leastU, mostU, leastV, mostV] = [
          Math.min(leastU, along),
          Math.max(mostU, along),
          Math.min(leastV, across),
          Math.max(mostV, across),
        ];
      }
    }
  return mostU < leastU ? [0, 0, 0, 0] : [leastU, leastV, mostU - leastU, mostV - leastV];
}

/** How far a picture `across` by `down` (turned) grows into a box `boxWidth` by `boxHeight` device pixels: by whole
 *  pixels where that keeps most of the size and its turn is square, else smoothly; never past `CAP` to one. */
export function weaponScale(
  across: number,
  down: number,
  boxWidth: number,
  boxHeight: number,
  ratio: number,
  squareTurn: boolean,
): { readonly scale: number; readonly crisp: boolean } {
  const scale = Math.min(boxWidth / across, boxHeight / down, CAP * ratio);
  const whole = Math.floor(scale + 1e-9);
  const crisp = squareTurn && whole >= 1 && whole / scale >= WHOLE_KEEPS;
  return { scale: crisp ? whole : scale, crisp };
}

/** The picture drawn into a canvas `boxWidth` by `boxHeight` CSS pixels at most, laid level, at the screen's ratio. */
export function weaponCanvas(
  picture: Picture,
  boxWidth: number,
  boxHeight: number,
  screen = devicePixelRatio,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'weapon-picture';
  canvas.ariaHidden = 'true';
  const bounds = drawnBounds(picture.width, picture.height, picture.pixels);
  if (!bounds) return canvas;
  const [west, north, width, height] = bounds;
  const own = document.createElement('canvas');
  [own.width, own.height] = [width, height];
  const image = new ImageData(new Uint8ClampedArray(picture.pixels), picture.width);
  own.getContext('2d')?.putImageData(image, -west, -north, west, north, width, height);
  const turn = picture.level ? 0 : lengthwise(picture.width, picture.height, picture.pixels);
  const ratio = screen > 0 ? screen : 1;
  const trimmed = own.getContext('2d')?.getImageData(0, 0, width, height).data ?? [];
  const [leastU, leastV, across, down] = turnedBounds(width, height, trimmed, turn);
  const { scale, crisp } = weaponScale(across, down, boxWidth * ratio, boxHeight * ratio, ratio, square(turn));
  // Grown by whole pixels first, so a smooth step after never blurs a pixel into its neighbour; shrunk, it is drawn
  // as the area average leaves it.
  const shrinks = scale < 1;
  const grownBy = Math.max(1, crisp ? scale : Math.ceil(scale));
  const [grownWidth, grownHeight] = shrinks
    ? [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
    : [width * grownBy, height * grownBy];
  const grown = shrinks ? shrunkCanvas(own, grownWidth, grownHeight, picture.snap) : document.createElement('canvas');
  const growing = shrinks ? null : grown.getContext('2d');
  if (growing) {
    [grown.width, grown.height] = [grownWidth, grownHeight];
    growing.imageSmoothingEnabled = false;
    growing.drawImage(own, 0, 0, grown.width, grown.height);
  }
  [canvas.width, canvas.height] = [Math.max(1, Math.ceil(across * scale)), Math.max(1, Math.ceil(down * scale))];
  const drawing = canvas.getContext('2d');
  if (drawing) {
    drawing.imageSmoothingEnabled = !crisp && !(shrinks && square(turn));
    drawing.imageSmoothingQuality = 'high';
    drawing.translate(Math.round(-leastU * scale), Math.round(-leastV * scale));
    drawing.rotate(turn);
    drawing.drawImage(grown, 0, 0, shrinks ? grownWidth : width * scale, shrinks ? grownHeight : height * scale);
  }
  canvas.style.width = `${canvas.width / ratio}px`;
  canvas.style.height = `${canvas.height / ratio}px`;
  return canvas;
}
