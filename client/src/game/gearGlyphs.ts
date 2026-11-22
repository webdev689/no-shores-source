// The gear screens' glyphs, drawn pixel by pixel to sit with the forge's pixel figures and Enhanced Plus's carved
// frames: Aurem, the fragments and Essence, the Fruit of Dagon, each island's resource, a Vestige's crystal, an Ammo
// box and an Ammo crate (the pictures drops stand as on the ground), and an empty place. Enhanced Plus has no icons of
// its own for these, and the classic item art stays behind, so they are ours.

import { AMMO_BOX, AMMO_CRATE, OUTLINE, resourcePicture } from '../combat/dropPictures.ts';
import { crystalStill } from '../combat/vestigeCrystal.ts';
import type { Glyph } from './gearCards.ts';
import { SHIP_MAPS, SHIP_PALETTES } from './shipGlyphs.ts';

/** Each glyph as rows of letters, each letter a colour of its palette and a dot none. 12 × 12. */
const MAPS: Readonly<Record<Exclude<Glyph, 'item' | 'resource' | 'vestige'>, readonly string[]>> = {
  ...SHIP_MAPS,
  aurem: [
    '....aaaa....',
    '..aabbbbaa..',
    '.abbccccbba.',
    '.abccbbccba.',
    'abccbbbbccba',
    'abcbbaabbcba',
    'abcbbaabbcba',
    'abccbbbbccba',
    '.abccbbccba.',
    '.abbccccbba.',
    '..aabbbbaa..',
    '....aaaa....',
  ],
  'weapon-fragments': [
    '..........a.',
    '.........aba',
    '........abc.',
    '.......abc..',
    '......abc...',
    '.....abc....',
    '..a.abc.....',
    '.abaab......',
    '..abb.......',
    '.aba........',
    'aba.........',
    '.a..........',
  ],
  'armor-fragments': [
    '............',
    '..aaaaaaaa..',
    '.abbbbbbbba.',
    '.abccccccba.',
    '.abcbbbbcba.',
    '.abcb..bcba.',
    '..abcb.bca..',
    '..abcbbcba..',
    '...abccba...',
    '....abba....',
    '.....aa.....',
    '............',
  ],
  'weapon-essence': [
    '....aaaa....',
    '.....aa.....',
    '.....aa.....',
    '....abba....',
    '...abccba...',
    '..abccccba..',
    '.abccddccba.',
    '.abcddddcba.',
    '.abcddddcba.',
    '.abccddccba.',
    '..abbbbbba..',
    '...aaaaaa...',
  ],
  'armor-essence': [
    '....aaaa....',
    '.....aa.....',
    '.....aa.....',
    '....abba....',
    '...abccba...',
    '..abccccba..',
    '.abccddccba.',
    '.abcddddcba.',
    '.abcddddcba.',
    '.abccddccba.',
    '..abbbbbba..',
    '...aaaaaa...',
  ],
  fruit: [
    '......dd....',
    '.....d..ee..',
    '.....d.eee..',
    '...aaaaa....',
    '..abbbbbaa..',
    '.abcbbbbbba.',
    '.abccbbbbba.',
    '.abcbbbbbba.',
    '.abbbbbbbba.',
    '..abbbbbba..',
    '...abbbba...',
    '....aaaa....',
  ],
  'ammo-box': AMMO_BOX.rows,
  'ammo-crate': AMMO_CRATE.rows,
  empty: [
    '............',
    '.....aa.....',
    '....a..a....',
    '...a....a...',
    '..a......a..',
    '.a........a.',
    '.a........a.',
    '..a......a..',
    '...a....a...',
    '....a..a....',
    '.....aa.....',
    '............',
  ],
};

/** Each glyph's colours, outline first. */
const PALETTES: Readonly<Record<string, readonly string[]>> = {
  ...SHIP_PALETTES,
  aurem: [OUTLINE, '#c08a3e', '#f3cf86'],
  'weapon-fragments': [OUTLINE, '#9fb2c4', '#e2ecf4'],
  'armor-fragments': [OUTLINE, '#a3753e', '#e6c08a'],
  'weapon-essence': [OUTLINE, '#7a8b99', '#c9d6e0', '#6ba8e8'],
  'armor-essence': [OUTLINE, '#8a7a5e', '#d8c9a8', '#e08a3e'],
  fruit: [OUTLINE, '#8c2a2a', '#d86a5a', '#5a3a1e', '#4e7f3e'],
  'ammo-box': AMMO_BOX.colours,
  'ammo-crate': AMMO_CRATE.colours,
  empty: ['#6b665c'],
};
/** A glyph as an SVG picture; a material past the catalogue's end shows an empty place. */
export function glyphSvg(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0): string {
  if (glyph === 'resource') {
    const material = resourcePicture(tint);
    return material ? pictureSvg(material.rows, material.colours) : glyphSvg('empty');
  }
  if (glyph === 'vestige') {
    const crystal = crystalStill(rarity);
    return pictureSvg(crystal.rows, crystal.colours);
  }
  return pictureSvg(MAPS[glyph], PALETTES[glyph] ?? [OUTLINE]);
}

/** The letters a hand-drawn map draws with, each a colour of its palette in turn; a dot is none. A picture is read by
 *  each letter's code from 'a', so a baked one (a crystal's) may run past 'l'. */
export const GLYPH_LETTERS = 'abcdefghijkl';

/** Rows of letters as an SVG picture as large as its map (12 cells, a ship glyph's 24, a crystal's 18): each run of
 *  one letter along a row a strip in its colour, crisp at any size. */
function pictureSvg(rows: readonly string[], colours: readonly string[]): string {
  const strips: string[] = [];
  rows.forEach((row, line) => {
    for (let column = 0; column < row.length;) {
      const letter = row.charAt(column);
      let end = column + 1;
      while (row.charAt(end) === letter) end++;
      const fill = colours[letter.charCodeAt(0) - GLYPH_LETTERS.charCodeAt(0)];
      if (fill) strips.push(`<rect x="${column}" y="${line}" width="${end - column}" height="1" fill="${fill}"/>`);
      column = end;
    }
  });
  const size = rows.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${strips.join('')}</svg>`;
}

/** Whether a glyph is drawn at the ship's 24 cells rather than the gear's 12. */
export const fineGlyph = (glyph: Exclude<Glyph, 'item'>): boolean => MAPS[glyph as keyof typeof MAPS]?.length === 24;

/** A node's kind, as its column's kind numbers it: an upgrade, handling, a finish, a perk, an Atheric's own. */
const NODE_MAPS: readonly (readonly string[])[] = [
  [
    '............',
    '.....aa.....',
    '....aaaa....',
    '...aaaaaa...',
    '..aaa..aaa..',
    '.aaa....aaa.',
    '.....aa.....',
    '....aaaa....',
    '...aaaaaa...',
    '..aaa..aaa..',
    '.aaa....aaa.',
    '............',
  ],
  [
    '.....aa.....',
    '....aaaa....',
    '.....aa.....',
    '..aaaaaaaa..',
    '.....aa.....',
    '...aaaaaa...',
    '.....aa.....',
    '...aaaaaa...',
    '.....aa.....',
    '.....aa.....',
    '....aaaa....',
    '............',
  ],
  [
    '............',
    '...aaaaaa...',
    '..aa.aa.aa..',
    '.aaaaaaaaaa.',
    '.a..a..a..a.',
    '..a.a..a.a..',
    '...a.aa.a...',
    '....aaaa....',
    '.....aa.....',
    '............',
    '............',
    '............',
  ],
  [
    '.....aa.....',
    '.....aa.....',
    '....aaaa....',
    'aaaaaaaaaaaa',
    '.aaaaaaaaaa.',
    '..aaaaaaaa..',
    '...aaaaaa...',
    '...aaaaaa...',
    '..aaa..aaa..',
    '..aa....aa..',
    '.a........a.',
    '............',
  ],
  [
    '.....aa.....',
    '.a...aa...a.',
    '..a......a..',
    '....aaaa....',
    '...aaaaaa...',
    'aa.aaaaaa.aa',
    'aa.aaaaaa.aa',
    '...aaaaaa...',
    '....aaaa....',
    '..a......a..',
    '.a...aa...a.',
    '.....aa.....',
  ],
];

/** A node's glyph as an SVG drawn in the colour of the text around it, so its state colours it. */
export function nodeGlyphSvg(kind: number): string {
  const rows = NODE_MAPS[kind] ?? NODE_MAPS[3] ?? [];
  const squares = rows.flatMap((row, line) =>
    [...row].flatMap((letter, column) =>
      letter === 'a' ? [`<rect x="${column}" y="${line}" width="1" height="1"/>`] : [],
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${squares.join('')}</svg>`;
}

/** The cells across a node's ring, and its radius and thickness in cells. */
const RING_CELLS = 20;
const RING_RADIUS = 9;
const RING_HALF_WIDTH = 0.6;

/** A node's ring, pixel by pixel, lit clockwise from the top as far as `share` of the way round, the rest dark: how
 *  far the item has grown toward the node. Its colours are the text's around it (lit) and `dark`. */
export function ringSvg(share: number, dark: string): string {
  const centre = (RING_CELLS - 1) / 2;
  const squares: string[] = [];
  for (let line = 0; line < RING_CELLS; line++)
    for (let column = 0; column < RING_CELLS; column++) {
      const [east, south] = [column - centre, line - centre];
      if (Math.abs(Math.hypot(east, south) - RING_RADIUS) > RING_HALF_WIDTH) continue;
      const round = (Math.atan2(east, -south) / (2 * Math.PI) + 1) % 1;
      const fill = round < share ? 'currentColor' : dark;
      squares.push(`<rect x="${column}" y="${line}" width="1" height="1" fill="${fill}"/>`);
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RING_CELLS} ${RING_CELLS}" shape-rendering="crispEdges" aria-hidden="true">${squares.join('')}</svg>`;
}
