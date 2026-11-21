// The window's carved frame, as a 9-slice picture drawn pixel for pixel and used at 1:1, so it is never scaled: from
// the outside in, the outline, the lit or shaded stone bevel, an engraved black line and a dark inner lip, with a
// brass fitting and its rivet at each corner.
import { TONES } from './tones.ts';

/** Pixels a side of the picture. */
export const BAND = 12;
/** How many of `BAND`'s pixels are the stone edge; the rest is clear, so a fitting may stand larger than the edge. */
export const EDGE = 8;
/** How far the picture reaches outside its box: the edge less the box's own 2 px border, which the picture's two
 *  innermost pixels land on exactly. */
export const OUTSET = EDGE - 2;
/** A corner fitting's size: a square with its inner corner clipped. */
const FITTING = 11;
/** The rivet's place in a fitting, 3 × 3 with one lit pixel. */
const RIVET = 4;

/** A fitting's colour `across` and `down` from the corner's two outer edges, or null where it does not reach. */
function fittingAt(across: number, down: number): string | null {
  if (across >= FITTING || down >= FITTING || across + down > FITTING + 4) return null;
  const rim = across === 0 || down === 0 || across === FITTING - 1 || down === FITTING - 1;
  if (rim || across + down === FITTING + 4) return TONES.outline;
  const inRivet = (from: number) => from >= RIVET && from <= RIVET + 2;
  if (inRivet(across) && inRivet(down)) {
    if (across === RIVET + 1 && down === RIVET + 1) return TONES.brassHi;
    return across === RIVET || down === RIVET ? TONES.brassDark : TONES.brassLo;
  }
  if (across === 1 || down === 1) return TONES.brassHi;
  if (across === FITTING - 2 || down === FITTING - 2 || across + down === FITTING + 3) return TONES.brassLo;
  return TONES.brass;
}

/** Pixels a side of the whole picture. */
export const FRAME_SIDE = BAND * 2 + 1;

/** The frame's pixels, `FRAME_SIDE` square, row by row from the top: each its colour, or null where it is clear. */
export function framePixels(): (string | null)[] {
  const size = FRAME_SIDE;
  // One row of a lit (top or left) and a shaded (bottom or right) edge, outside to in.
  const lit = [
    TONES.outline,
    TONES.stoneHi,
    TONES.stoneLit,
    TONES.stoneMid,
    TONES.stoneLo,
    TONES.outline,
    '#16140f',
    '#0c0d10',
  ];
  const shade = [
    TONES.outline,
    TONES.stoneDark,
    TONES.stoneDim,
    '#443e31',
    '#4f4838',
    TONES.outline,
    TONES.stoneLo,
    '#1c1a15',
  ];
  const pixels: (string | null)[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [left, right, top, bottom] = [x < BAND, x > BAND, y < BAND, y > BAND];
      const fromTop = top ? y : size - 1 - y;
      const fromSide = left ? x : size - 1 - x;
      const along = (from: number, litSide: boolean) => (litSide ? lit[from] : shade[from]) ?? null;
      if ((left || right) && (top || bottom)) {
        const fitting = fittingAt(fromTop, fromSide);
        if (fitting) pixels.push(fitting);
        else if (fromTop < EDGE) pixels.push(along(fromTop, top));
        else if (fromSide < EDGE) pixels.push(along(fromSide, left));
        else pixels.push(null);
      } else if ((top || bottom) && fromTop < EDGE) pixels.push(along(fromTop, top));
      else if ((left || right) && fromSide < EDGE) pixels.push(along(fromSide, left));
      else pixels.push(null);
    }
  }
  return pixels;
}
