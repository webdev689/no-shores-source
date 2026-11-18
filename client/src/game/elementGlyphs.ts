// The elements' glyphs, drawn pixel by pixel as the gear's are: Blaze a flame, Volt a bolt, Cosmic a four-pointed
// star. Each in its own colours: an outline, the body and its light.

import { ELEMENTS } from '../player/gear.ts';

/** Each element's glyph as rows of letters (a the outline, b the body, c its light, a dot none), 12 × 12, by the gear
 *  crate's numbers. */
const MAPS: Readonly<Record<number, readonly string[]>> = {
  1: [
    '.....a......',
    '....aba.....',
    '....abba....',
    '...abbba....',
    '..abbcbba...',
    '..abbccbba..',
    '.abbccccba..',
    '.abccccccba.',
    '.abcccccbba.',
    '..abccccba..',
    '...abbbba...',
    '....aaaa....',
  ],
  2: [
    '......aaaa..',
    '.....abba...',
    '....abca....',
    '...abca.....',
    '..abcaaaa...',
    '.abccccba...',
    '..aaaacba...',
    '.....abca...',
    '....abca....',
    '...abca.....',
    '..aba.......',
    '..aa........',
  ],
  3: [
    '.....ab.....',
    '.....ab.....',
    '....abba....',
    '....abca....',
    '..aabccbaa..',
    'aabbcccccbba',
    '..aabccbaa..',
    '....abca....',
    '....abba....',
    '.....ab.....',
    '.....ab.....',
    '............',
  ],
};

/** An element's glyph as an SVG picture, crisp at any size; empty for none. */
export function elementSvg(element: number): string {
  const rows = MAPS[element];
  const colours = ELEMENTS[element]?.palette;
  if (!rows || !colours) return '';
  const squares = rows.flatMap((row, line) =>
    [...row].flatMap((letter, column) => {
      const fill = colours['abc'.indexOf(letter)];
      return fill ? [`<rect x="${column}" y="${line}" width="1" height="1" fill="${fill}"/>`] : [];
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${squares.join('')}</svg>`;
}
