// The ship's glyphs, drawn pixel by pixel as the gear's are (`gearGlyphs.ts`, 12 × 12, a letter a colour of the
// palette and a dot none): its four materials, Timber, Canvas, Iron and Heartwood, and its four modules, Guns, Hull,
// Sails and Rigging, which stand for a module's picture since the forge draws only what a figure wears.

import { OUTLINE } from '../combat/dropPictures.ts';

export const SHIP_GLYPHS = ['timber', 'canvas', 'iron', 'heartwood', 'guns', 'hull', 'sails', 'rigging'] as const;
export type ShipGlyph = (typeof SHIP_GLYPHS)[number];

const WOOD = '#7a4e2a';
const WOOD_LIGHT = '#c08a52';
const WOOD_DARK = '#4a2c16';

export const SHIP_MAPS: Readonly<Record<ShipGlyph, readonly string[]>> = {
  // Two planks, one on the other, a knot in each.
  timber: [
    '............',
    '.aaaaaaaaaa.',
    'acccccccccca',
    'abbbbdbbbbba',
    'abbbbbbbbbba',
    '.aaaaaaaaaa.',
    '.aaaaaaaaaa.',
    'acccccccccca',
    'abbbbbbbdbba',
    'abbbbbbbbbba',
    '.aaaaaaaaaa.',
    '............',
  ],
  // A bolt of sailcloth, rolled and tied.
  canvas: [
    '............',
    '.aaaaaaaaaa.',
    'acccdccdcaca',
    'abbbdbbdbaba',
    'abbbdbbdbaca',
    'abbbdbbdbaba',
    'abbbdbbdbaba',
    'abbbdbbdbaca',
    'abbbdbbdbaba',
    '.aaaaaaaaaa.',
    '............',
    '............',
  ],
  // An ingot, lit on its top.
  iron: [
    '............',
    '............',
    '............',
    '....aaaaaa..',
    '...acccccca.',
    '..acbbbbbbda',
    '.abbbbbbbdda',
    'abbbbbbbbdda',
    'abbbbbbbdda.',
    'addddddddda.',
    '.aaaaaaaaa..',
    '............',
  ],
  // An old keel cut across: bark, rings, and its red heart.
  heartwood: [
    '....aaaa....',
    '..aabbbbaa..',
    '.abbccccbba.',
    '.abccddccba.',
    'abccdeedccba',
    'abcdeeeedcba',
    'abcdeeeedcba',
    'abccdeedccba',
    '.abccddccba.',
    '.abbccccbba.',
    '..aabbbbaa..',
    '....aaaa....',
  ],
  // A gun on its carriage.
  guns: [
    '............',
    '............',
    'aa..........',
    'abaaaaaaaaa.',
    'abccccccccca',
    'abbbbbbbbbba',
    'abaaaaaaaaa.',
    '.adddddda...',
    'adddddddda..',
    'aeeaaaeea...',
    'aeea.aeea...',
    '.aa...aa....',
  ],
  // Its hull from the side, its gunports along it.
  hull: [
    '............',
    '............',
    'a..........a',
    'ab........ba',
    'abaaaaaaaaba',
    'acccccccccca',
    'abbdbbdbbdba',
    'abbbbbbbbbba',
    '.abbbbbbbba.',
    '..abbbbbba..',
    '...aaaaaa...',
    '............',
  ],
  // A square sail on its yard, full of wind.
  sails: [
    '.....a......',
    'aaaaaaaaaaaa',
    '.abbbbbbbba.',
    '.acbbbbbbba.',
    '.acbbbbbbba.',
    '..acbbbbbba.',
    '..abbbbbbba.',
    '..abbbbbba..',
    '...abbbbba..',
    '...aaaaaaa..',
    '.....a......',
    '.....a......',
  ],
  // A coil of line, its end run out.
  rigging: [
    '............',
    '...aaaaaa...',
    '..abbbbbba..',
    '.abccccccba.',
    '.abcaaaacba.',
    '.abca..acba.',
    '.abca..acba.',
    '.abcaaaacba.',
    '.abccccccba.',
    '..abbbbbba..',
    '...aaaaaaaa.',
    '.........aba',
  ],
};

/** Each glyph's colours, outline first. */
export const SHIP_PALETTES: Readonly<Record<ShipGlyph, readonly string[]>> = {
  timber: [OUTLINE, WOOD, WOOD_LIGHT, WOOD_DARK],
  canvas: [OUTLINE, '#d9cfb4', '#f4eedd', '#8c6a3e'],
  iron: [OUTLINE, '#6f7780', '#b9c2cb', '#3c4248'],
  heartwood: [OUTLINE, '#5a3418', '#c99a5e', '#8a5a2e', '#b8322a'],
  guns: [OUTLINE, '#4c5258', '#9aa3ab', WOOD, WOOD_DARK],
  hull: [OUTLINE, WOOD, WOOD_LIGHT, '#2a1a0e'],
  sails: [OUTLINE, '#e9e1c8', '#ffffff'],
  rigging: [OUTLINE, '#b08a52', '#e0c08a'],
};
