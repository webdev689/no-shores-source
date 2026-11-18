// The gear screens' glyphs, drawn pixel by pixel to sit with the forge's pixel figures and Enhanced Plus's carved
// frames: Aurem, the fragments and Essence, the Fruit of Dagon, an island's resource, a sealed Vestige and an empty
// place. Enhanced Plus has no icons of its own for these, and the classic item art stays behind, so they are ours.

import { RARITIES } from '../player/gear.ts';
import type { Glyph } from './gearCards.ts';

/** Each glyph as rows of letters, each letter a colour of its palette and a dot none. 12 × 12. */
const MAPS: Readonly<Record<Exclude<Glyph, 'item'>, readonly string[]>> = {
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
  resource: [
    '.....a......',
    '....aba.....',
    '...abcba....',
    '..abccba.a..',
    '..abcbba.aba',
    '.abccbbaabca',
    '.abcbbbaabba',
    'abccbbbbaaa.',
    'abcbbbbbba..',
    '.abbbbbbba..',
    '..aaaaaaa...',
    '............',
  ],
  vestige: [
    '....aaaa....',
    '...abbbba...',
    '..abccccba..',
    '.abcbddbcba.',
    'abcbddddbcba',
    'abcddbbddcba',
    'abcddbbddcba',
    'abcbddddbcba',
    '.abcbddbcba.',
    '..abccccba..',
    '...abbbba...',
    '....aaaa....',
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

const OUTLINE = '#120e0a';
/** Each glyph's colours, outline first; a Vestige's and a resource's come from their rarity or island. */
const PALETTES: Readonly<Record<string, readonly string[]>> = {
  aurem: [OUTLINE, '#c08a3e', '#f3cf86'],
  'weapon-fragments': [OUTLINE, '#9fb2c4', '#e2ecf4'],
  'armor-fragments': [OUTLINE, '#a3753e', '#e6c08a'],
  'weapon-essence': [OUTLINE, '#7a8b99', '#c9d6e0', '#6ba8e8'],
  'armor-essence': [OUTLINE, '#8a7a5e', '#d8c9a8', '#e08a3e'],
  fruit: [OUTLINE, '#8c2a2a', '#d86a5a', '#5a3a1e', '#4e7f3e'],
  empty: ['#6b665c'],
};
/** Each island's resource's colour, in the catalogue's order. */
const RESOURCE_TONES = [
  '#bfe8ff',
  '#8a8f96',
  '#d9973e',
  '#f0b545',
  '#e4d27a',
  '#c9b8f0',
  '#9fd8c0',
  '#e8e0c8',
  '#d8f0ff',
];

/** A glyph as an SVG picture: its pixels as squares, crisp at any size. */
export function glyphSvg(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0): string {
  const rows = MAPS[glyph];
  const tone = (shades: readonly [string, string]) => [OUTLINE, ...shades];
  const colours =
    glyph === 'vestige'
      ? [
          ...tone([RARITIES[rarity]?.shade ?? '#555', RARITIES[rarity]?.colour ?? '#999']),
          RARITIES[rarity]?.lit ?? '#ddd',
        ]
      : glyph === 'resource'
        ? [...tone(['#3a3530', RESOURCE_TONES[tint] ?? '#bbb']), '#ffffff']
        : (PALETTES[glyph] ?? [OUTLINE]);
  const squares: string[] = [];
  rows.forEach((row, line) =>
    [...row].forEach((letter, column) => {
      const fill = colours['abcde'.indexOf(letter)];
      if (fill) squares.push(`<rect x="${column}" y="${line}" width="1" height="1" fill="${fill}"/>`);
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${squares.join('')}</svg>`;
}

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
