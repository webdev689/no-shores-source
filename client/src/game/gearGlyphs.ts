// The gear screens' glyphs, drawn pixel by pixel to sit with the forge's pixel figures and Enhanced Plus's carved
// frames: Aurem, the fragments and Essence, the Fruit of Dagon, each island's resource, a sealed Vestige, an Ammo box
// and an Ammo crate (the pictures drops stand as on the ground), and an empty place. Enhanced Plus has no icons of its
// own for these, and the classic item art stays behind, so they are ours.

import { AMMO_BOX, AMMO_CRATE, OUTLINE, VESTIGE_ROWS } from '../combat/dropPictures.ts';
import { RARITIES } from '../player/gear.ts';
import type { Glyph } from './gearCards.ts';
import { SHIP_MAPS, SHIP_PALETTES } from './shipGlyphs.ts';

/** Each glyph as rows of letters, each letter a colour of its palette and a dot none. 12 × 12. */
const MAPS: Readonly<Record<Exclude<Glyph, 'item' | 'resource'>, readonly string[]>> = {
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
  vestige: VESTIGE_ROWS,
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

/** Each glyph's colours, outline first; a Vestige's come from its rarity. */
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
/** Each island's resource as a picture of its own, in the catalogue's order: its rows as `MAPS`' are, and its
 *  colours, the outline then its body in the island's colour, its light and its shade, then any other parts. */
const MATERIALS: readonly { readonly rows: readonly string[]; readonly colours: readonly string[] }[] = [
  {
    // Brineglass: salt grown into clear cubes.
    rows: [
      '........aa..',
      '......aabbaa',
      '......abbbba',
      '...aa.acbbda',
      '.aabbaaccdda',
      'abbbbbbacdda',
      'accbbddacdaa',
      'acccdddaaa..',
      'acccddda.aa.',
      'acccdddaabba',
      '.aacdaa.acda',
      '...aa....aa.',
    ],
    colours: [OUTLINE, '#bfe8ff', '#f4fdff', '#6ea6c6'],
  },
  {
    // Cairn Iron: three bars, stacked.
    rows: [
      '............',
      '............',
      '...aaaaaa...',
      '...acecca...',
      '...abbbda...',
      '...abbdda...',
      '.aaaaaaaaaa.',
      'aceccaacecca',
      'abbbdaabbbda',
      'abbddaabbdda',
      'aaaaaaaaaaaa',
      '............',
    ],
    colours: [OUTLINE, '#8a8f96', '#c9ced4', '#54585e', '#f4f7fa'],
  },
  {
    // Heartwood Resin: a drop of amber, lit through its foot.
    rows: [
      '.....aa.....',
      '....abba....',
      '....acba....',
      '...acbbda...',
      '..aecbbbda..',
      '.aecbbbbbda.',
      '.acbbbbbbda.',
      '.abbbffbbda.',
      '.abbffffdda.',
      '..abbbddda..',
      '...adddda...',
      '....aaaa....',
    ],
    colours: [OUTLINE, '#d9973e', '#f7d590', '#8e5518', '#fffbe8', '#f0bc6a'],
  },
  {
    // Sunstone: a stone giving off the day's heat.
    rows: [
      '.....bb.....',
      '.b...bb...b.',
      '..b.aaaa.b..',
      '...acccba...',
      '..accbbbda..',
      'bbacbbbbdabb',
      'bbabbbbbdabb',
      '..abbbbdda..',
      '...adddda...',
      '..b.aaaa.b..',
      '.b...bb...b.',
      '.....bb.....',
    ],
    colours: [OUTLINE, '#f0b545', '#fde7a0', '#b0661c'],
  },
  {
    // Goldgrass Seed: an ear of the grass.
    rows: [
      '.......aa...',
      '......acba..',
      '.....acbdaa.',
      '....acbdacba',
      '...acbdacbda',
      '..acbdacbda.',
      '.acbdacbda..',
      '.abdacbda...',
      '..aacbda....',
      '..eabda.....',
      '.e..aa......',
      'e...........',
    ],
    colours: [OUTLINE, '#e4d27a', '#fff3bd', '#a48c3a', '#9c8a44'],
  },
  {
    // Mistbloom: a flower open.
    rows: [
      '....aaaa....',
      '...abccba...',
      '.aaabccbaaa.',
      'acccabbabbda',
      'abccbeebbbda',
      '.abbeffebda.',
      '..abeffeba..',
      '.abbbeebbba.',
      'abbdaaaadbba',
      '.aaa.ae.aaa.',
      '.....ae.....',
      '.....ae.....',
    ],
    colours: [OUTLINE, '#c9b8f0', '#f1ebff', '#8774bd', '#5d8a56', '#fff2b8'],
  },
  {
    // Windthistle: a thistle's head, its down like wire.
    rows: [
      '.c..c..c..c.',
      '..b.b..b.b..',
      '.c.bbbbbb.c.',
      '..bbbbbbbb..',
      '..adddddda..',
      '.abbdbbdbba.',
      '.adbbdbbdba.',
      '.abbdbbdbba.',
      '..adbbdbda..',
      '...adddda...',
      '.....ea.....',
      '.....ea.....',
    ],
    colours: [OUTLINE, '#9fd8c0', '#e2fff2', '#4f8a72', '#3d5e3a'],
  },
  {
    // Bog Pearl: a pearl in its open shell.
    rows: [
      '............',
      '....aaaa....',
      '...accbba...',
      '..accbbbba..',
      '..acbbbbda..',
      '.aebbbbbdea.',
      'aefbbbbddfea',
      'aeffbdddffea',
      '.aeeffffeea.',
      '..aeeeeeea..',
      '...aaaaaa...',
      '............',
    ],
    colours: [OUTLINE, '#e8e0c8', '#fffaf0', '#a89f86', '#2a3530', '#7f948a'],
  },
  {
    // Rimecrystal: a shard of frost.
    rows: [
      '.....aa.....',
      '....acba....',
      '...accbda...',
      '..acbbbdda..',
      '..acbbbdda..',
      '..acbbbdda..',
      '..acbbbdda..',
      '..acbbbdda..',
      '...acbbda...',
      '....abda....',
      '.....aa.....',
      '............',
    ],
    colours: [OUTLINE, '#d8f0ff', '#ffffff', '#86b8dc'],
  },
];

/** A glyph as an SVG picture; a material past the catalogue's end shows an empty place. */
export function glyphSvg(glyph: Exclude<Glyph, 'item'>, rarity = 0, tint = 0): string {
  if (glyph === 'resource') {
    const material = MATERIALS[tint];
    return material ? pictureSvg(material.rows, material.colours) : glyphSvg('empty');
  }
  const found = RARITIES[rarity];
  const colours =
    glyph === 'vestige'
      ? [OUTLINE, found?.shade ?? '#555', found?.colour ?? '#999', found?.lit ?? '#ddd']
      : (PALETTES[glyph] ?? [OUTLINE]);
  return pictureSvg(MAPS[glyph], colours);
}

/** The letters a map draws with, each a colour of its palette in turn; a dot is none. */
export const GLYPH_LETTERS = 'abcdefghijkl';

/** Rows of letters as an SVG picture as large as its map (12 cells, or a ship glyph's 24): each run of one letter
 *  along a row a strip in its colour, crisp at any size. */
function pictureSvg(rows: readonly string[], colours: readonly string[]): string {
  const strips: string[] = [];
  rows.forEach((row, line) => {
    for (let column = 0; column < row.length;) {
      const letter = row.charAt(column);
      let end = column + 1;
      while (row.charAt(end) === letter) end++;
      const fill = colours[GLYPH_LETTERS.indexOf(letter)];
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
