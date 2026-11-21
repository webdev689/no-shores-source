// A long thin bar's fine frame with pointed ends, after a souls-like display's vitals: a picture drawn pixel for pixel
// and used at 1:1 as a three-part border, so it is never scaled. Each end comes to a point, its outline and stone line
// meeting at a brass tip; the trough runs into the point, and the fill stands between the points. Light falls from the
// top left, as on the kit's other frames, so the upper slopes and the top edge are lit and the lower ones shaded.
import { TONES } from './tones.ts';

/** The frame's colours: its stone lit and shaded, and its tip. */
export interface BarTone {
  readonly lit: string;
  readonly shade: string;
  readonly tip: string;
}

/** The frame's looks: plain stone, gone to blood for a warning, lit white for a flash, and brass for an opening. */
export const BAR_TONES = {
  stone: { lit: TONES.stoneLit, shade: TONES.stoneDim, tip: TONES.brassHi },
  brass: { lit: TONES.brassHi, shade: TONES.brassLo, tip: '#fff6d0' },
  blood: { lit: '#e0584a', shade: '#7a1d16', tip: '#ff8a76' },
  light: { lit: '#ffffff', shade: '#c9c4b6', tip: '#ffffff' },
} as const satisfies Record<string, BarTone>;

/** How far the display's corner pieces stand in from the view's side, top and foot, in CSS pixels at their own size. */
export const CORNER = { side: 28, top: 14, foot: 22 } as const;

/** Each vital's height, frame and all, the gap between two, and the room kept under them for the buffs' row, at
 *  each step, in CSS pixels: the thin bars' sizes, the vitals' on foot and the ship's at sea. */
export const VITAL_SIZES = {
  base: { health: 12, stamina: 10, poise: 8, gap: 4, buffs: 34 },
  wide: { health: 16, stamina: 14, poise: 10, gap: 5, buffs: 46 },
} as const;

/** How many pixels the frame takes along the bar's top and foot: its outline and its stone line. */
export const BAR_EDGE = 2;
/** How many pixels a point's slope runs along the bar for each row it climbs: two, so each end is a slender point. */
const SLOPE = 2;
/** How far a bar `height` pixels tall (frame and all) reaches into each point. */
export const tipOf = (height: number): number => SLOPE * Math.ceil(height / 2);

/** The frame for a bar `height` pixels tall as an SVG: each point's `tipOf` columns, and one column between them that
 *  the border stretches along the bar. */
export function barFrameSvg(height: number, tone: BarTone): string {
  const tip = tipOf(height);
  const width = tip * 2 + 1;
  const pixels: string[] = [];
  const paint = (x: number, y: number, colour: string) =>
    pixels.push(`<rect x='${x}' y='${y}' width='1' height='1' fill='${colour}'/>`);
  for (let y = 0; y < height; y++) {
    // Rows from the middle: 0 on the middle row (or the two of an even height), up to the top and foot.
    const fromMiddle = Math.abs(y - (height - 1) / 2) - (height % 2 === 0 ? 0.5 : 0);
    const slope = fromMiddle * SLOPE;
    const upper = y < height / 2;
    const stone = upper ? tone.lit : tone.shade;
    const edge = y === 0 || y === height - 1;
    for (let x = 0; x < width; x++) {
      const along = x < tip ? x : width - 1 - x;
      const middle = x === tip;
      // Along the bar the top and the foot are an outline over a stone line; the inside is the bar's own.
      if (middle) {
        if (edge) paint(x, y, TONES.outline);
        else if (y === 1 || y === height - 2) paint(x, y, stone);
        continue;
      }
      if (along < slope) continue;
      if (along < slope + SLOPE || edge) paint(x, y, TONES.outline);
      else if (along < slope + SLOPE * 2 || y === 1 || y === height - 2)
        paint(x, y, fromMiddle === 0 && along < SLOPE * 2 ? tone.tip : stone);
      else paint(x, y, TONES.groundTrack);
    }
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' shape-rendering='crispEdges'>${pixels.join('')}</svg>`;
}

/** The frame as a `border-image` for a bar `height` pixels tall: the picture, its slices and their widths. */
export function barFrameImage(height: number, tone: BarTone): string {
  const tip = tipOf(height);
  const url = `url("data:image/svg+xml,${encodeURIComponent(barFrameSvg(height, tone))}")`;
  return `${url} ${BAR_EDGE} ${tip} / ${BAR_EDGE}px ${tip}px stretch`;
}
