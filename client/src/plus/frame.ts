// The window's carved frame, as a 9-slice picture drawn pixel for pixel and used at 1:1, so it is never scaled: from
// the outside in, the outline, the lit or shaded stone bevel, an engraved black line and a dark inner lip, with a
// brass fitting and its rivet at each corner.
import { TONES, type Tones } from './tones.ts';

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
function fittingAt(across: number, down: number, tones: Tones): string | null {
  if (across >= FITTING || down >= FITTING || across + down > FITTING + 4) return null;
  const rim = across === 0 || down === 0 || across === FITTING - 1 || down === FITTING - 1;
  if (rim || across + down === FITTING + 4) return tones.outline;
  const inRivet = (from: number) => from >= RIVET && from <= RIVET + 2;
  if (inRivet(across) && inRivet(down)) {
    if (across === RIVET + 1 && down === RIVET + 1) return tones.brassHi;
    return across === RIVET || down === RIVET ? tones.brassDark : tones.brassLo;
  }
  if (across === 1 || down === 1) return tones.brassHi;
  if (across === FITTING - 2 || down === FITTING - 2 || across + down === FITTING + 3) return tones.brassLo;
  return tones.brass;
}

/** The frame as an SVG, `BAND * 2 + 1` pixels square. */
export function frameSvg(tones: Tones = TONES): string {
  const size = BAND * 2 + 1;
  // One row of a lit (top or left) and a shaded (bottom or right) edge, outside to in.
  const lit = [
    tones.outline,
    tones.stoneHi,
    tones.stoneLit,
    tones.stoneMid,
    tones.stoneLo,
    tones.outline,
    '#16140f',
    '#0c0d10',
  ];
  const shade = [
    tones.outline,
    tones.stoneDark,
    tones.stoneDim,
    '#443e31',
    '#4f4838',
    tones.outline,
    tones.stoneLo,
    '#1c1a15',
  ];
  const pixels: string[] = [];
  const paint = (x: number, y: number, colour: string | undefined) => {
    if (colour) pixels.push(`<rect x='${x}' y='${y}' width='1' height='1' fill='${colour}'/>`);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [left, right, top, bottom] = [x < BAND, x > BAND, y < BAND, y > BAND];
      const fromTop = top ? y : size - 1 - y;
      const fromSide = left ? x : size - 1 - x;
      const along = (from: number, litSide: boolean) => (litSide ? lit[from] : shade[from]);
      if ((left || right) && (top || bottom)) {
        const fitting = fittingAt(fromTop, fromSide, tones);
        if (fitting) paint(x, y, fitting);
        // Under the fitting's clipped corner the two edges meet in a mitre.
        else if (fromTop < EDGE && fromSide < EDGE)
          paint(x, y, fromTop <= fromSide ? along(fromTop, top) : along(fromSide, left));
        else if (fromTop < EDGE) paint(x, y, along(fromTop, top));
        else if (fromSide < EDGE) paint(x, y, along(fromSide, left));
      } else if ((top || bottom) && fromTop < EDGE) paint(x, y, along(fromTop, top));
      else if ((left || right) && fromSide < EDGE) paint(x, y, along(fromSide, left));
    }
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' shape-rendering='crispEdges'>${pixels.join('')}</svg>`;
}

/** The frame as a `border-image`: the picture, its slice, its width and how far it reaches out. */
export function frameImage(tones: Tones = TONES): string {
  const url = `url("data:image/svg+xml,${encodeURIComponent(frameSvg(tones))}")`;
  return `${url} ${BAND} / ${BAND}px / ${OUTSET}px stretch`;
}
