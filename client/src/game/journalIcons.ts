// The Journal's icons, drawn pixel by pixel in the gear glyphs' style (`gearGlyphs.ts`): twelve square, a dark outline,
// lit from the top left. They mark where a bounty counts, and lead the timers: each reset, the dungeons on, the seas
// of each tier and how a character stands with them, what a run pays, the Abyss's rules, and each modifier.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { OUTLINE } from '../combat/dropPictures.ts';
import { ELEMENTS } from '../player/gear.ts';
import { type Pixels, urlOf } from '../plus/emblems.ts';
import { TONES } from '../plus/tones.ts';

/** Every icon by its name. */
const ICONS = {
  /** Land: two peaks under snow. */
  'land': {
    rows: [
      '............',
      '............',
      '....aa......',
      '...aeea.....',
      '..aeebba.aa.',
      '..acbbbdacea',
      '.acbbbbdaeea',
      '.abbdbbbdbba',
      'acbddbbbbdda',
      'abddbbbbbdda',
      'adddddddddda',
      'aaaaaaaaaaaa',
    ],
    tones: { a: OUTLINE, b: '#9a9079', c: '#c2b79a', d: '#5a5446', e: '#e6dcc0' },
  },
  /** The sea: a wave curling over the swell. */
  'sea': {
    rows: [
      '............',
      '....aaaa....',
      '..aacccca...',
      '.acbbbbbca..',
      'acbbddaabca.',
      'abbdaa..aba.',
      'abda...aaa..',
      'aaaaaaacccaa',
      'acccccbbbbca',
      'abbbbbbbbbba',
      'adddddddddda',
      'aaaaaaaaaaaa',
    ],
    tones: { a: OUTLINE, b: '#4f7d96', c: '#a9d3e0', d: '#26465a' },
  },
  /** A dungeon: an arched door. */
  'dungeon': {
    rows: [
      '....aaaa....',
      '..aaccccaa..',
      '.acccbbbbda.',
      '.accaaaabda.',
      'acbaxxxxabda',
      'acbaxxxxabda',
      'acbaxxxxabda',
      'acbaxxxfabda',
      'acbaxxxxabda',
      'acbaxxxxabda',
      'aaaaaaaaaaaa',
      '.addddddddda',
    ],
    tones: { a: OUTLINE, b: '#9a9079', c: '#c2b79a', d: '#5a5446', e: '#e6dcc0', f: '#f0b545', x: '#1a1712' },
  },
  /** Daily reset: the sun rising over the rim of the world. */
  'dawn': {
    rows: [
      '.....ee.....',
      '..e..ee..e..',
      '...e....e...',
      '....aaaa....',
      'ee.acccca.ee',
      '..acccbbba..',
      '.acccbbbbda.',
      '.acbbbbbbda.',
      'aaaaaaaaaaaa',
      'affffffffffa',
      'aaaaaaaaaaaa',
      '............',
    ],
    tones: { a: OUTLINE, b: '#f0b545', c: '#fde7a0', d: '#b0661c', e: '#f3cf86', f: '#5a5446' },
  },
  /** Weekly reset: a page of the week, its Tuesday marked. */
  'week': {
    rows: [
      '..a..a..a...',
      '.abaabaabaa.',
      'acccccccccca',
      'arrrrrrrrrra',
      'arrrrrrrrrra',
      'aeeeeeeeeeea',
      'aebebebebeba',
      'aeeeeeeeeeea',
      'aebebxbebeba',
      'aeeeeeeeeeea',
      'aeeeeeeeeeea',
      '.aaaaaaaaaa.',
    ],
    tones: { a: OUTLINE, b: '#7a7260', c: '#c08a3e', e: '#e2dccd', r: '#b83a2e', x: '#b83a2e' },
  },
  /** The Elite Dungeon of the week: its door under a brass chevron. */
  'elite-dungeon': {
    rows: [
      '.....aa.....',
      '....affa....',
      '...affffa...',
      '..affaaffa..',
      '..aaccccaa..',
      '.acccbbbbda.',
      '.accaaaabda.',
      'acbaxxxxabda',
      'acbaxxxgabda',
      'acbaxxxxabda',
      'aaaaaaaaaaaa',
      '.addddddddda',
    ],
    tones: {
      a: OUTLINE,
      b: '#9a9079',
      c: '#c2b79a',
      d: '#5a5446',
      e: '#e6dcc0',
      f: '#f0b545',
      g: '#f0b545',
      x: '#1a1712',
    },
  },
  /** The Abyss Dungeon of the week: its door, an eye burning in it. */
  'abyss-dungeon': {
    rows: [
      '....aaaa....',
      '..aaccccaa..',
      '.acccbbbbda.',
      '.accaaaabda.',
      'acbaxxxxabda',
      'acbaxyyxabda',
      'acbayzzyabda',
      'acbaxyyxabda',
      'acbaxxxxabda',
      'acbaxxxxabda',
      'aaaaaaaaaaaa',
      '.addddddddda',
    ],
    tones: {
      a: OUTLINE,
      b: '#9a9079',
      c: '#c2b79a',
      d: '#5a5446',
      e: '#e6dcc0',
      x: '#1a1712',
      y: '#b83a2e',
      z: '#ff8a76',
    },
  },
  /** Bounties: a notice pinned to the board, sealed in wax. */
  'bounty': {
    rows: [
      '.....aa.....',
      '....affa....',
      '.aaaaffaaaa.',
      '.aeeeaaeeea.',
      '.aeccccccea.',
      '.aeeeeeeeea.',
      '.aecccccea.a',
      '.aeeeeeeeea.',
      '.aecccaaaa..',
      '.aeeearrrra.',
      '.aeeeearrra.',
      '.aaaaaaaaa..',
    ],
    tones: { a: OUTLINE, c: '#9a9079', e: '#e2dccd', f: '#c08a3e', r: '#b83a2e' },
  },
  /** The Abyss boon: a star. */
  'boon': {
    rows: [
      '.....aa.....',
      '.....aca....',
      '....acba....',
      '....acba....',
      '.aaaacbbaaa.',
      'acccccebbbda',
      '.aabbbbbdaa.',
      '...abbbda...',
      '....abda....',
      '....abda....',
      '.....ada....',
      '.....aa.....',
    ],
    tones: { a: OUTLINE, b: '#f0b545', c: '#fde7a0', d: '#b0661c', e: '#fff8e0' },
  },
  /** Breaches: a rift torn open. */
  'breach': {
    rows: [
      '.....aa.....',
      '....acda....',
      '...acbbda...',
      '...abbbda...',
      '..acbcda....',
      '..abcbda....',
      '...acbbda...',
      '....acbbda..',
      '...acbcda...',
      '..acbbda....',
      '..abbda.....',
      '...aaa......',
    ],
    tones: { a: OUTLINE, b: '#9c55ff', c: '#efd9ff', d: '#26093f' },
  },
  /** Normal seas: calm water. */
  'seas-normal': {
    rows: [
      '............',
      '............',
      '............',
      '............',
      '..aaa...aaa.',
      '.acccaaaccca',
      'acbbbccbbbca',
      'abbddbbbddba',
      'adddddddddda',
      '.aaaaaaaaaa.',
      '............',
      '............',
    ],
    tones: { a: OUTLINE, b: '#4f7d96', c: '#a9d3e0', d: '#26465a' },
  },
  /** Elite seas: a wave rearing. */
  'seas-elite': {
    rows: [
      '............',
      '.....aaa....',
      '....acccaa..',
      '...acbbbcca.',
      '..acbbddbca.',
      '..abbdaadba.',
      '.acbbda.aa..',
      '.abbdda.....',
      'acbbdda..aa.',
      'abbddbbaacba',
      'adddddddddda',
      '.aaaaaaaaaa.',
    ],
    tones: { a: OUTLINE, b: '#3f8a8a', c: '#a6e3d6', d: '#1d4c4c' },
  },
  /** Abyss seas: a maelstrom turning. */
  'seas-abyss': {
    rows: [
      '....aaaa....',
      '..aaddddaa..',
      '.addbbbbdda.',
      '.adbaaaabdda',
      'adbacccabda.',
      'adbcayyacbda',
      'adbcayyaabda',
      'adbbcaaacbda',
      '.adbbcccbda.',
      '.addbbbbdda.',
      '..aaddddaa..',
      '....aaaa....',
    ],
    tones: { a: OUTLINE, b: '#7a1d16', c: '#b83a2e', d: '#3d0d0a', y: '#ff8a76' },
  },
  /** Taken: a brass tick. */
  'taken': {
    rows: [
      '............',
      '..........aa',
      '.........aca',
      '........acba',
      '.aa....acba.',
      'acba..acba..',
      'abcbaacba...',
      '.abcbacba...',
      '..abccba....',
      '...abba.....',
      '....aa......',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c08a3e', c: '#f3cf86' },
  },
  /** Open: a ring not yet filled. */
  'open': {
    rows: [
      '............',
      '....aaaa....',
      '...adddda...',
      '..ad....da..',
      '..ad....da..',
      '..ad....da..',
      '..ad....da..',
      '...adddda...',
      '....aaaa....',
      '............',
      '............',
      '............',
    ],
    tones: { a: OUTLINE, d: '#7a7260' },
  },
  /** Shut: a padlock. */
  'locked': {
    rows: [
      '............',
      '....aaaa....',
      '...acbbda...',
      '..ad....da..',
      '..ad....da..',
      '.aaaaaaaaaa.',
      '.acccccccda.',
      '.acbbaabbda.',
      '.acbbaabbda.',
      '.abbbbbbbda.',
      '.adddddddda.',
      '.aaaaaaaaaa.',
    ],
    tones: { a: OUTLINE, b: '#9a9079', c: '#c2b79a', d: '#5a5446' },
  },
  /** A richer cache: a chest bound in brass. */
  'cache': {
    rows: [
      '............',
      '..aaaaaaaa..',
      '.acccccccda.',
      'acbbbbbbbbda',
      'aaaaaffaaaaa',
      'acbbbaabbbda',
      'abbbbffbbbda',
      'abbbbbbbbbda',
      'abbbbbbbbbda',
      'adddddddddda',
      'aaaaaaaaaaaa',
      '............',
    ],
    tones: { a: OUTLINE, b: '#8a5a2b', c: '#c08a3e', d: '#5a3a1a', f: '#f3cf86' },
  },
  /** Revives: a heart. */
  'revive': {
    rows: [
      '............',
      '.aaa...aaa..',
      'acccaaacbba.',
      'acebbbbbbbda',
      'acbbbbbbbbda',
      'abbbbbbbbbda',
      '.abbbbbbbda.',
      '..abbbbbda..',
      '...abbbda...',
      '....abda....',
      '.....aa.....',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c8382f', c: '#ff8a76', d: '#7a1d16', e: '#ffd8cc' },
  },
  /** A wipe: a skull. */
  'wipe': {
    rows: [
      '............',
      '...aaaaaa...',
      '..acccccba..',
      '.accbbbbbda.',
      '.acaabbaabd.',
      '.acaaabaaad.',
      '.abbbbabbbd.',
      '..abbbbbbda.',
      '..abababada.',
      '...aaaaaaa..',
      '............',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c2b79a', c: '#e6dcc0', d: '#7a7260' },
  },
  /** Burn: a flame, in its Art's colours. */
  'burn': {
    rows: [
      '.....a......',
      '....aca.....',
      '....acba....',
      '...acbbaa...',
      '..acbbcbda..',
      '..abbcecbda.',
      '.acbceecbda.',
      '.abcceeccda.',
      '.abceeeecda.',
      '.abcceeccda.',
      '..adccccda..',
      '...aaaaaa...',
    ],
    tones: { a: OUTLINE, b: '#ff7a2a', c: '#ffd36a', d: '#4a1606', e: '#fff4d0' },
  },
  /** Brawler: a fist. */
  'brawler': {
    rows: [
      '............',
      '...aaaaaa...',
      '..acacacaa..',
      '.acbcbcbcba.',
      '.abbbbbbbba.',
      '.aaaaabbbda.',
      '.acccabbbda.',
      '.abbbbbbbda.',
      '..abbbbbbda.',
      '...abbbbda..',
      '...aaaaaa...',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c99572', c: '#efc3a0', d: '#7a5038' },
  },
  /** Marksman: a target. */
  'marksman': {
    rows: [
      '.....aa.....',
      '...aabbaa...',
      '..abaaaaba..',
      '.abaccccaaba',
      '.aacaaaacaaa',
      'abacaffacaba',
      'abacaffacaba',
      '.aacaaaacaa.',
      '.abaccccaba.',
      '..abaaaaba..',
      '...aabbaa...',
      '.....aa.....',
    ],
    tones: { a: OUTLINE, b: '#e2dccd', c: '#b83a2e', f: '#f3cf86' },
  },
  /** Lightswitch: claw marks, a foe's blow. */
  'lightswitch': {
    rows: [
      '............',
      '.a...a...a..',
      'aca.aca.aca.',
      'aba.aba.aba.',
      '.aba.aba.aba',
      '.aba.aba.aba',
      '..aba.aba.aa',
      '..aba.aba.ab',
      '...aba.aba.a',
      '...ada.ada..',
      '....a...a...',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c8382f', c: '#ff8a76', d: '#7a1d16' },
  },
  /** Ironclad: a kite shield. */
  'ironclad': {
    rows: [
      '.aaaaaaaaaa.',
      'acccccccccda',
      'acbbbbbbbbda',
      'acbbbffbbbda',
      'acbbffffbbda',
      'acbbbffbbbda',
      '.abbbbbbbda.',
      '.abbbbbbbda.',
      '..abbbbbda..',
      '...abbbda...',
      '....adda....',
      '.....aa.....',
    ],
    tones: { a: OUTLINE, b: '#8a8f96', c: '#c9ced4', d: '#54585e', f: '#c08a3e' },
  },
  /** Trickle: a slow drop. */
  'trickle': {
    rows: [
      '.....aa.....',
      '....acda....',
      '....acda....',
      '...acbbda...',
      '...acbbda...',
      '..acbbbbda..',
      '..acebbbda..',
      '..aebbbbda..',
      '...abbbda...',
      '....aaaa....',
      '.....aa.....',
      '.....aa.....',
    ],
    tones: { a: OUTLINE, b: '#46beff', c: '#dcf6ff', d: '#0b2a44', e: '#ffffff' },
  },
  /** Juggler: an ammunition crate struck through. */
  'juggler': {
    rows: [
      '............',
      '.aaaaaaaa...',
      'acccccccda..',
      'abbbbbbbdaa.',
      'aaaaaaaaaarr',
      'acbbbbbbbrra',
      'abbbffbbrrda',
      'abbbffbrrbda',
      'abbbbbrrbbda',
      'addddrrdddda',
      'aaaarraaaaaa',
      '...rr.......',
    ],
    tones: { a: OUTLINE, b: '#8a5a2b', c: '#c08a3e', d: '#5a3a1a', f: '#f3cf86', r: '#e0584a' },
  },
  /** Exposure: a heart broken. */
  'exposure': {
    rows: [
      '............',
      '.aaa...aaa..',
      'acccaa.acbba',
      'acebba.abbda',
      'acbbbaabbbda',
      'abbbba.abbda',
      '.abbaa..abda',
      '..abba.aba..',
      '...ab.aba...',
      '....aaba....',
      '.....aa.....',
      '............',
    ],
    tones: { a: OUTLINE, b: '#c8382f', c: '#ff8a76', d: '#7a1d16', e: '#ffd8cc' },
  },
} as const satisfies Readonly<Record<string, Pixels>>;

export type IconName = keyof typeof ICONS;

/** The pixels a side of an icon. */
export const ICON_PIXELS = 12;

/** An icon as a picture's address (an SVG's data URL), some of its colours swapped where `tones` gives them. */
export function iconUrl(name: IconName, tones: Readonly<Record<string, string>> = {}): string {
  const icon: Pixels = ICONS[name];
  return urlOf({ rows: icon.rows, tones: { ...icon.tones, ...tones } });
}

/** An icon as an image `size` pixels square (a whole multiple of its twelve), naming itself in `words` to a reader
 *  and under the pointer. */
export function iconImage(name: IconName, words: string, size: number, tones?: Readonly<Record<string, string>>) {
  const image = document.createElement('img');
  image.className = 'journal-icon';
  image.src = iconUrl(name, tones);
  [image.width, image.height, image.alt] = [size, size, words];
  if (words) image.title = words;
  return image;
}

/** Each pool's mark, by the board's numbers: 0 land, 1 the sea, 2 dungeons. */
const POOLS: readonly IconName[] = ['land', 'sea', 'dungeon'];

/** The mark of where a bounty counts: a peak on land, a wave at sea, an arched door in a dungeon; null for a pool the
 *  board does not have. */
export function poolMarkUrl(pool: number): string | null {
  const name = POOLS[pool];
  return name ? iconUrl(name) : null;
}

/** The ground each pool's tiles stand on: stone for land, deep water for the sea, blood for dungeons. */
export const POOL_GROUNDS: readonly string[] = [TONES.stoneDim, TONES.sea, TONES.bloodDark];

/** The modifiers drawn under their own keys. */
const MODIFIERS: readonly IconName[] = [
  'brawler',
  'marksman',
  'lightswitch',
  'ironclad',
  'trickle',
  'juggler',
  'exposure',
];

const ART_ELEMENTS: ReadonlyMap<string, number> = new Map(arts.arts.map((art) => [art.key, art.element]));

/** A modifier's icon by its key ("burn-shadow", "brawler", ...), Burn's flame in its Art's element's colours; none
 *  for a key it does not know. */
export function modifierIcon(key: string): { readonly name: IconName; readonly tones?: Record<string, string> } | null {
  if (key.startsWith('burn-')) {
    const element = ELEMENTS[ART_ELEMENTS.get(key.slice('burn-'.length)) ?? 0];
    if (!element) return { name: 'burn' };
    const [dark, body, light] = element.palette;
    return { name: 'burn', tones: { b: body, c: light, d: dark } };
  }
  const name = MODIFIERS.find((modifier) => modifier === key);
  return name ? { name } : null;
}
