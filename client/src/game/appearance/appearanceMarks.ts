// The Appearance screen's marks, drawn pixel by pixel as the gear's and the Arts' glyphs are: the wardrobe mark on the
// Character page's button (a coat on a hanger), a dye's tile (its ramp over a cuirass's silhouette) and a coat's (a
// swatch of its ramp, lit from the top left). Each is an SVG of whole pixels, crisp at any whole multiple.

import { OUTLINE } from '../../combat/dropPictures.ts';
import { rampOf } from '../../forge/cosmetics.ts';
import type { Rgb } from '../../forge/dyes.ts';

/** The letters a map draws with, each a colour of its palette in turn; a dot is none. */
const LETTERS = 'abcdefgh';

/** A map of letters as an SVG picture in `colours`, each run of one colour along a row one rect. */
export function pixelSvg(rows: readonly string[], colours: readonly string[]): string {
  const rects: string[] = [];
  rows.forEach((row, line) => {
    for (let column = 0; column < row.length;) {
      const letter = row.charAt(column);
      let end = column + 1;
      while (row.charAt(end) === letter) end++;
      const fill = colours[LETTERS.indexOf(letter)];
      if (fill) rects.push(`<rect x="${column}" y="${line}" width="${end - column}" height="1" fill="${fill}"/>`);
      column = end;
    }
  });
  const width = rows[0]?.length ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

/** The wardrobe mark: a coat on a brass hanger, 16 × 16; the outline, the hanger's shade, brass and light, then the
 *  coat's shade, body and light. */
export const WARDROBE_ROWS = [
  '.......aa.......',
  '......acda......',
  '.......aca......',
  '.......aca......',
  '.....aacdcaa....',
  '...aaccaaaccaa..',
  '..acdaafgfaadca.',
  '.aaaeefggffeeaaa',
  '.aeeeffggffeeea.',
  '.aeefffggfffeea.',
  '.aeeaffggffaeea.',
  '.aeeaffggffaeea.',
  '.aeeaffggffaeea.',
  '..aaaffggffaaa..',
  '....aeeeeeea....',
  '....aaaaaaaa....',
];
const WARDROBE_COLOURS = [OUTLINE, '#7a5420', '#c08a3e', '#f3cf86', '#3e3a52', '#6a6488', '#a9a3c8'];

/** The wardrobe mark as an SVG. */
export const wardrobeSvg = (): string => pixelSvg(WARDROBE_ROWS, WARDROBE_COLOURS);

/** A cuirass's silhouette, 16 × 16: its outline, then four steps of its dye from the shade to the light. */
export const CUIRASS_ROWS = [
  '................',
  '...aaa....aaa...',
  '..abcca..accba..',
  '.abcdeaaaaedcba.',
  '.abcdeeddeedcba.',
  '.abccdeeddedcba.',
  '..abcdeddedcba..',
  '...abcdeedcba...',
  '...abcdeedcba...',
  '...abccdedcba...',
  '...abccddccba...',
  '...aabccccbaa...',
  '...abbccccbba...',
  '...abbbccbbba...',
  '....aaaaaaaa....',
  '................',
];
/** The ramp steps a cuirass's four shades take, darkest first. */
const CUIRASS_STEPS = [3, 7, 11, 14];
/** Own Colours' tile: steel, which the sets mostly wear. */
const OWN_LOOK = ['#1c1f24', '#4a5058', '#8f979f', '#e3e7ea'];
/** Bay's tile: the bay's own hide, as the forge drew it. */
const BAY_LOOK = ['#1e140b', '#4b3420', '#80603c', '#c09a68'];

const hex = ([red, green, blue]: Rgb): string =>
  `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/** A dye's tile: its ramp over a cuirass, or the own colours' steel for none. */
export function dyeSvg(ramp: readonly Rgb[] | null): string {
  const steps = ramp ?? rampOf(OWN_LOOK);
  return pixelSvg(CUIRASS_ROWS, [OUTLINE, ...CUIRASS_STEPS.map((step) => hex(steps[step] ?? [0, 0, 0]))]);
}

/** A coat's tile: a swatch of its ramp 12 × 12 in an outline, lit from the top left across a step a pixel, or the
 *  bay's own for none. */
export function coatSvg(ramp: readonly Rgb[] | null): string {
  const steps = ramp ?? rampOf(BAY_LOOK);
  const side = 12;
  const rows = Array.from({ length: side }, (_unused, row) =>
    Array.from({ length: side }, (_unused2, column) => {
      if (row === 0 || column === 0 || row === side - 1 || column === side - 1) return 'a';
      return LETTERS.charAt(1 + Math.min(6, Math.floor((side * 2 - 4 - row - column) / 3)));
    }).join(''),
  );
  const shades = [2, 4, 6, 8, 10, 12, 14].map((step) => hex(steps[step] ?? [0, 0, 0]));
  return pixelSvg(rows, [OUTLINE, ...shades]);
}
