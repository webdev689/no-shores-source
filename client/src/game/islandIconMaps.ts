// The island's tiles' own icons as letter maps, in the Journal's style (`journalIconMaps.ts`): twelve square, a dark
// outline, lit from the top left, in the Journal's tones. Each draws a detail a tile shows as a glyph.
import { OUTLINE } from '../combat/dropPictures.ts';
import type { Pixels } from '../plus/emblems.ts';

/** Wood, iron, stone, wax and the brass the Journal's icons share. */
const WOOD = { b: '#8a5a2b', c: '#c08a3e', d: '#5a3a1a' } as const;
const IRON = { b: '#9aa4ae', c: '#d8dee4', d: '#5a646e' } as const;
const STONE = { b: '#9a9079', c: '#c2b79a', d: '#5a5446' } as const;
const WAX = { b: '#c8382f', c: '#ff8a76', d: '#7a1d16', e: '#ffd8cc' } as const;

/** Every icon by its name. */
export const ISLAND_ICONS = {
  /** A port's counters: a stall under its striped awning, its wares on the board. */
  'counters': {
    rows: [
      '............',
      'aaaaaaaaaaaa',
      'arrerrerrera',
      'arrerrerrera',
      'aaaaaaaaaaaa',
      '.a........a.',
      '.a.aa..aa.a.',
      '.aaffaaffaa.',
      'aaaaaaaaaaaa',
      'acbbbbbbbbda',
      'adddddddddda',
      'aaaaaaaaaaaa',
    ],
    tones: { a: OUTLINE, r: '#b83a2e', e: '#e2dccd', f: '#f3cf86', ...WOOD },
  },
  /** A port's moorings: an anchor. */
  'moorings': {
    rows: [
      '.....aa.....',
      '....acba....',
      '....abda....',
      '..aaabdaaa..',
      '..acbbbbda..',
      '..aaabdaaa..',
      '....abda....',
      '.a..abda..a.',
      'aca.abda.aca',
      'abbbbbdbbbda',
      '.abbbbbbbda.',
      '..aaaaaaaa..',
    ],
    tones: { a: OUTLINE, ...IRON },
  },
  /** A patrol zone's resources: a rock veined with ore. */
  'resources': {
    rows: [
      '............',
      '....aaaa....',
      '..aaccbbaa..',
      '.acbbbfbbda.',
      '.abfbbbbbda.',
      'acbbbbbfbbda',
      'abbbfbbbbdda',
      'abfbbbbbfdda',
      'abbbbbfbddda',
      'adbbbbbbddda',
      'adddddddddda',
      'aaaaaaaaaaaa',
    ],
    tones: { a: OUTLINE, b: '#7a7266', c: '#a89f8e', d: '#4a443c', f: '#f0b545' },
  },
  /** Foes: two blades crossed. */
  'foes': {
    rows: [
      'aa........aa',
      'aca......aca',
      '.aca....aca.',
      '..aca..aca..',
      '...acaaca...',
      '....acca....',
      '....acca....',
      '...acaaca...',
      '.aaca..acaa.',
      'abaa....aaba',
      'aba......aba',
      'aa........aa',
    ],
    tones: { a: OUTLINE, b: WOOD.b, c: IRON.c },
  },
  /** An Elite Dungeon's blocks: courses of laid stone. */
  'blocks': {
    rows: [
      '............',
      'aaaaaaaaaaaa',
      'acbbdacbbbda',
      'addddaddddda',
      'aaaaaaaaaaaa',
      'acbbbbdacbda',
      'addddddaddda',
      'aaaaaaaaaaaa',
      'acbbdacbbbda',
      'addddaddddda',
      'aaaaaaaaaaaa',
      '............',
    ],
    tones: { a: OUTLINE, ...STONE },
  },
  /** An Elite Dungeon's seals: a disc of red wax, its mark pressed in it. */
  'seals': {
    rows: [
      '............',
      '...aaaaaa...',
      '..accbbbba..',
      '.acbbbbbbda.',
      'acbbbeebbbda',
      'acbbeeeebbda',
      'abbbeeeebbda',
      'abbbbeebbdda',
      '.abbbbbbdda.',
      '..abbbddda..',
      '...aaaaaa...',
      '............',
    ],
    tones: { a: OUTLINE, ...WAX },
  },
  /** A company: two of it, side by side. */
  'company': {
    rows: [
      '............',
      '..aa....aa..',
      '.acca..acca.',
      '.aeea..aeea.',
      '..aa....aa..',
      '.aaaa..aaaa.',
      'abbbdaabbbda',
      'abbbdaabbbda',
      'abbbdaabbbda',
      'aaaaaaaaaaaa',
      '............',
      '............',
    ],
    tones: { a: OUTLINE, b: '#4f7d96', c: '#f0d2b0', d: '#26465a', e: '#c8a080' },
  },
  /** Places named on a layout: a pin over the ground. */
  'places': {
    rows: [
      '....aaaa....',
      '...acbbba...',
      '..acbbbbda..',
      '..abbaabda..',
      '..abbaabda..',
      '..abbbbbda..',
      '...abbbda...',
      '....abda....',
      '....abda....',
      '.....aa.....',
      '...aaaaaa...',
      '............',
    ],
    tones: { a: OUTLINE, b: WAX.b, c: WAX.c, d: WAX.d },
  },
  /** An outpost slot: a stake flying a grey pennant over a plot roped between two pegs. */
  'slots': {
    rows: [
      '...aa.......',
      '...acaaaaa..',
      '...acbeeeba.',
      '...acbbbba..',
      '...acaaaa...',
      '...ad.......',
      '...ad.......',
      'aa.ad....aa.',
      'ad.ad....ad.',
      'adaadaaaaad.',
      'aaaaaaaaaaa.',
      '............',
    ],
    tones: { a: OUTLINE, b: IRON.b, c: WOOD.c, d: WOOD.d, e: IRON.c },
  },
  /** An outpost: its palisade of pointed stakes, bound by a beam. */
  'outpost': {
    rows: [
      '............',
      '.aa..aa..aa.',
      'acbaacbaacba',
      'acbaacbaacba',
      'acbaacbaacba',
      'aaaaaaaaaaaa',
      'adddddddddda',
      'aaaaaaaaaaaa',
      'acbaacbaacba',
      'adbaadbaadba',
      'aaaaaaaaaaaa',
      '............',
    ],
    tones: { a: OUTLINE, ...WOOD },
  },
} as const satisfies Record<string, Pixels>;
