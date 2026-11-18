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
