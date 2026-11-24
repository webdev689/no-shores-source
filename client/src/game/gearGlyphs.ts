// The gear screens' glyphs, pixel pictures to sit with the forge's pixel figures and Enhanced Plus's carved frames:
// drawn by hand, Aurem, the fragments and Essence, the Fruit of Dagon, an empty place and an empty Mount slot's horse;
// baked, each island's resource, a Vestige's crystal, an Ammo box and an Ammo crate (the pictures drops stand as on
// the ground). Enhanced Plus has no icons of its own for these, and the classic item art stays behind, so they are
// ours.

import { AMMO_BOX, AMMO_CRATE, OUTLINE, resourcePicture } from '../combat/dropPictures.ts';
import { crystalStill } from '../combat/vestigeCrystal.ts';
import type { Glyph } from './gearCards.ts';
import { SHIP_MAPS, SHIP_PALETTES } from './shipGlyphs.ts';

/** Each glyph as rows of letters, each letter a colour of its palette and a dot none: 12 × 12 drawn by hand, 18 × 18
 *  an Ammo box's or crate's, 24 × 24 a ship's. */
const MAPS: Readonly<Record<Exclude<Glyph, 'item' | 'resource' | 'vestige'>, readonly string[]>> = {
  ...SHIP_MAPS,
  // XP: a four-pointed spark, lit at its heart.
  xp: [
    '.....aa.....',
    '.....bb.....',
    '....abba....',
    '....bccb....',
    '.aabccccbaa.',
    'abbccddccbba',
    'abbccddccbba',
    '.aabccccbaa.',
    '....bccb....',
    '....abba....',
    '.....bb.....',
    '.....aa.....',
  ],
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
  // An empty Mount slot: a horse's head, ears up, looking left.
  horse: [
    '.......a.a..',
    '......aaaa..',
    '.....a...a..',
    '....a.....a.',
    '...a.......a',
    '..a...a....a',
    '.a.........a',
    'a....aa....a',
    'a...a..a...a',
    '.aaa....a..a',
    '.........a.a',
    '.........aaa',
  ],
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
  xp: [OUTLINE, '#b88a3e', '#f6e2a8', '#ffffff'],
  'weapon-fragments': [OUTLINE, '#9fb2c4', '#e2ecf4'],
  'armor-fragments': [OUTLINE, '#a3753e', '#e6c08a'],
  'weapon-essence': [OUTLINE, '#7a8b99', '#c9d6e0', '#6ba8e8'],
  'armor-essence': [OUTLINE, '#8a7a5e', '#d8c9a8', '#e08a3e'],
  fruit: [OUTLINE, '#8c2a2a', '#d86a5a', '#5a3a1e', '#4e7f3e'],
  'ammo-box': AMMO_BOX.colours,
  'ammo-crate': AMMO_CRATE.colours,
  empty: ['#6b665c'],
  horse: ['#6b665c'],
};
/** A glyph as an SVG picture; a material past the catalogue's end shows an empty place. */
export function glyphSvg(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0, drawnAt = 36): string {
  if (glyph === 'resource') {
    const material = resourcePicture(tint);
    return material ? pictureSvg(material.rows, material.colours) : glyphSvg('empty');
  }
  if (glyph === 'vestige') {
    // At a size 18 cells would not fill in whole pixels (a mark's 24), a crystal of 12.
    const crystal = crystalStill(rarity, true, drawnAt % 18 !== 0 && drawnAt % 12 === 0 ? 12 : 18);
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
    '.....aa.....',
    '.aa......aa.',
    '.aa......aa.',
    '....aaaa....',
    'aa..aaaa..aa',
    'aa..aaaa..aa',
    '....aaaa....',
    '.aa......aa.',
    '.aa......aa.',
    '.....aa.....',
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

/** The cells across a node's growth: its square's edge runs one cell in from them. */
const GROWTH_CELLS = 20;

/** A locked node's growth, pixel by pixel: a square round its edge, lit clockwise from the middle of its top as far as
 *  `share` of the way round, the rest dark; how far the item has grown toward the node. Its colours are the text's
 *  around it (lit) and `dark`. */
export function growthSvg(share: number, dark: string): string {
  const [first, last] = [1, GROWTH_CELLS - 2];
  const middle = (GROWTH_CELLS - 1) / 2;
  const squares: string[] = [];
  for (let line = first; line <= last; line++)
    for (let column = first; column <= last; column++) {
      if (line !== first && line !== last && column !== first && column !== last) continue;
      const round = (Math.atan2(column - middle, middle - line) / (2 * Math.PI) + 1) % 1;
      const fill = round < share ? 'currentColor' : dark;
      squares.push(`<rect x="${column}" y="${line}" width="1" height="1" fill="${fill}"/>`);
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GROWTH_CELLS} ${GROWTH_CELLS}" shape-rendering="crispEdges" aria-hidden="true">${squares.join('')}</svg>`;
}
