// The logo as the interface draws it, the game's title on the intro and the tap to start, and the loading
// screen it heads: its cells (`logoPicture.ts`) as pixels of its own, laid at a whole multiple so each cell stays square
// and crisp.
import type { Child, Node } from '../ui/node.ts';
import { breath, dropped } from './cinemaParts.ts';
import { LOGO } from './logoPicture.ts';

/** The logo's size in cells. */
export const LOGO_CELLS = { width: LOGO.rows[0]?.length ?? 0, height: LOGO.rows.length } as const;

/** The logo's cells as RGBA pixels, row by row; a dot is clear. */
function logoPixels(): Uint8Array {
  const { width, height } = LOGO_CELLS;
  const pixels = new Uint8Array(width * height * 4);
  const colours = LOGO.colours.map((hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)));
  LOGO.rows.forEach((row, line) =>
    [...row].forEach((letter, column) => {
      const colour = colours[letter.charCodeAt(0) - 'a'.charCodeAt(0)];
      if (colour) pixels.set([...colour, 255], (line * width + column) * 4);
    }),
  );
  return pixels;
}

/** The largest whole multiple of the logo's cells within `room` CSS pixels across, and within `most`; one at least. */
export const logoScale = (room: number, most: number): number =>
  Math.max(1, Math.min(most, Math.floor(room / LOGO_CELLS.width)));

/** The logo, each of its cells `scale` CSS pixels a side. */
export function logoNode(scale: number): Child {
  const { width, height } = LOGO_CELLS;
  return {
    width: width * scale,
    height: height * scale,
    picture: { key: 'logo', source: { pixels: logoPixels }, pixel: { width, height } },
  };
}

/** The loading screen's middle, as the prologue's black and every trip's veil draw it: the logo across 45% of the view
 *  (`width`) at most, twice its cells at most; LOADING under it, breathing while `loading` (still under reduced
 *  motion, `still`); and under that the trip's `words`, if any. */
export function loadingNode(width: number, now: number, still: boolean, words = '', loading = true): Node {
  const ink = '#efe6cf';
  return {
    direction: 'column',
    alignX: 'center',
    gap: 33,
    children: [
      logoNode(logoScale(width * 0.45, 2)),
      loading && {
        opacity: still ? 1 : breath(now),
        children: [dropped({ words: 'LOADING', size: 2, colour: ink, tracking: 5, wrap: false }, '#000', 1)],
      },
      words !== '' && {
        width: Math.round(Math.min(720, width * 0.8)),
        alignX: 'center',
        children: [dropped({ words: words.toUpperCase(), colour: ink, tracking: 3, align: 'center' }, '#000', 1)],
      },
    ],
  };
}
