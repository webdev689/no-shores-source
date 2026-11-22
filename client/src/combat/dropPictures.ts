// The pictures an Ammo box and an Ammo crate stand as on the ground, and each island's resource as its node's mark,
// pixel by pixel in the gear screens' glyph style. The gear screens draw the same rows as their glyphs, so a drop or a
// resource looks in the world as it does in the pack; a Vestige is its crystal (`vestigeCrystal.ts`).

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

/** Each island's resource as a picture of its own, in the catalogue's order: its rows as a drop's are, and its
 *  colours, the outline then its body in the island's colour, its light and its shade, then any other parts. */
const MATERIALS: readonly PixelPicture[] = [
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

/** An island's resource as its picture, by its place in the catalogue; none past its end. */
export function resourcePicture(place: number): PixelPicture | null {
  return MATERIALS[place] ?? null;
}
