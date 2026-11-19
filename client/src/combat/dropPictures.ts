// The pictures a drop stands as on the ground, pixel by pixel in the gear screens' glyph style: a sealed Vestige in its
// rarity's colours, an Ammo box and an Ammo crate. The gear screens draw the same rows as their glyphs, so a drop looks
// on the ground as it does in the pack.

import { RARITIES } from '../player/gear.ts';

/** A picture: rows of letters, each a colour of `colours` ('a' the first) and a dot none. 12 × 12. */
export interface PixelPicture {
  readonly rows: readonly string[];
  readonly colours: readonly string[];
}

/** Every glyph's outline. */
export const OUTLINE = '#120e0a';

export const VESTIGE_ROWS: readonly string[] = [
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
];

/** An Ammo box: a small olive can, its lid lit, a brass round stamped on its side. */
export const AMMO_BOX: PixelPicture = {
  rows: [
    '............',
    '..aaaaaaaa..',
    '.abbbbbbbba.',
    '.acccccccca.',
    'aaaaaaaaaaaa',
    'abbbbeebbbba',
    'abbbeffebbba',
    'abbbeffebbba',
    'abbbbeebbbba',
    'abbbbbbbbbba',
    'adddddddddda',
    'aaaaaaaaaaaa',
  ],
  colours: [OUTLINE, '#5b6b3a', '#8f9f5e', '#3a4424', '#c08a3e', '#f3cf86'],
};

/** An Ammo crate: a wooden crate braced corner to corner, its corners shod in brass. */
export const AMMO_CRATE: PixelPicture = {
  rows: [
    'aaaaaaaaaaaa',
    'abccccccccba',
    'aceddddddeca',
    'acdeddddedca',
    'acddeddeddca',
    'acdddeedddca',
    'acdddeedddca',
    'acddeddeddca',
    'acdeddddedca',
    'aceddddddeca',
    'abccccccccba',
    'aaaaaaaaaaaa',
  ],
  colours: [OUTLINE, '#c08a3e', '#b07a40', '#6e4a22', '#d8a464'],
};

/** A Vestige's picture in a rarity's colours: its shade, its own and its light. */
export function vestigePicture(rarity: number): PixelPicture {
  const found = RARITIES[rarity] ?? RARITIES[0];
  return { rows: VESTIGE_ROWS, colours: [OUTLINE, found.shade, found.colour, found.lit] };
}
