// The pictures an Ammo box and an Ammo crate stand as on the ground, pixel by pixel in the gear screens' glyph style.
// The gear screens draw the same rows as their glyphs, so a drop looks on the ground as it does in the pack; a Vestige
// is its crystal (`vestigeCrystal.ts`).

/** A picture: rows of letters, each a colour of `colours` ('a' the first) and a dot none, each pixel `pixelM` metres
 *  in the world (a glyph's 0.035 m when not given). */
export interface PixelPicture {
  readonly rows: readonly string[];
  readonly colours: readonly string[];
  readonly pixelM?: number;
}

/** Every glyph's outline. */
export const OUTLINE = '#120e0a';

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
