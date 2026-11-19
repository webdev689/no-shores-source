// The Arts' pictures, drawn pixel by pixel as the elements' and the gear's glyphs are: each Art's emblem in a diamond,
// as Destiny frames a subclass (Storm a forked bolt, Divine a sun with wings, Shadow a crescent holding a raven's
// eye), the double diamond its screen frames it in, and an icon for each spell. Each is drawn in its Art's element: an
// outline, a deep shade, the body, its light and a white heat, with brass for a frame's fittings. The fragments' icons
// are in `game/artFragments.ts`.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { ELEMENTS } from './gear.ts';

/** The letters a map draws with, each a colour of its Art's palette in turn; a dot is none. */
export const PALETTE_LETTERS = 'abcdef';
/** The menu's lit brass, for a frame's fittings. */
const BRASS = '#f3cf86';
/** Each element's deep shade and white heat, by the gear crate's numbers, beside its glyph's outline, body and light. */
const DEEP: Readonly<Record<number, readonly [string, string]>> = {
  1: ['#b8441a', '#fff6d8'],
  2: ['#1f6fa8', '#ffffff'],
  3: ['#5d2aa8', '#ffffff'],
};

/** An element's palette for the Arts' maps: its outline, deep shade, body, light and heat, then brass; empty for none. */
export function artPalette(element: number): readonly string[] {
  const glyph = ELEMENTS[element]?.palette;
  const [deep, heat] = DEEP[element] ?? [];
  if (!glyph || !deep || !heat) return [];
  const [outline, body, light] = glyph;
  return [outline, deep, body, light, heat, BRASS];
}

/** A map as an SVG picture in `element`'s colours, crisp at any whole size, each run of one colour along a row one
 *  rect; empty for no map. */
export function mapSvg(rows: readonly string[] | undefined, element: number): string {
  const colours = artPalette(element);
  if (!rows || colours.length === 0) return '';
  const rects: string[] = [];
  rows.forEach((row, line) => {
    for (let column = 0; column < row.length;) {
      const letter = row.charAt(column);
      let end = column + 1;
      while (row.charAt(end) === letter) end++;
      const fill = colours[PALETTE_LETTERS.indexOf(letter)];
      if (fill) rects.push(`<rect x="${column}" y="${line}" width="${end - column}" height="1" fill="${fill}"/>`);
      column = end;
    }
  });
  const width = rows[0]?.length ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

/** Each Art's emblem in its diamond, 24 × 24, by the Art's key. */
export const EMBLEM_MAPS: Readonly<Record<string, readonly string[]>> = {
  storm: [
    '...........dd...........',
    '..........daad..........',
    '.........dabddd.........',
    '........dabdedad........',
    '.......dabaeedbad.......',
    '......dabadedaabcd......',
    '.....dacaaeedaaabad.....',
    '....dabaadedaaaaabad....',
    '...dabaaaeedaaaaaacdd...',
    '..dabaacdeeddaaaacdcad..',
    '.dabacddcdeeeddccddabad.',
    'dabaacdcaaadeeedddcaabad',
    'cabacdcaaaaadedccaaaabac',
    '.cabdcaaaaadedaaaaaabac.',
    '..cadcaaaaaeedaaaaabac..',
    '...cabaaaadedaaaacbac...',
    '....cabaadeeaaaaabac....',
    '.....cabadeeaaaabac.....',
    '......cabadedaabac......',
    '.......cabdeeabac.......',
    '........cabdedac........',
    '.........caddac.........',
    '..........caac..........',
    '...........cc...........',
  ],
  divine: [
    '...........dd...........',
    '..........daad..........',
    '.........dabbad.........',
    '........dabaabad........',
    '.......dabaaaabad.......',
    '......dabaaddaabad......',
    '.....dabaaaaaaaabad.....',
    '....dadaaabbbbaaadad....',
    '...daddddbccccbddddad...',
    '..daddaadcddddcdaaddad..',
    '.daddaaabcddddcbaaaddad.',
    'dabdadddcddeeddcdddadbad',
    'cabdddabccdeedccbadddbac',
    '.cabacccccddddcccccabac.',
    '..cabaaaccccccccaaabac..',
    '...cabaccabbbbaccabac...',
    '....cabaaaaaaaaaabac....',
    '.....cabaaaaaaaabac.....',
    '......cabaaaaaabac......',
    '.......cabaaaabac.......',
    '........cabaabac........',
    '.........cabbac.........',
    '..........caac..........',
    '...........cc...........',
  ],
  shadow: [
    '...........dd...........',
    '..........daad..........',
    '.........dabbad.........',
    '........dabaabad........',
    '.......dabaadaaaaa......',
    '......dabdaaaaaaaaa.....',
    '.....dabdaaaaaaaaaaa....',
    '....dabcdaaaaaaaaaaa....',
    '...dabcdaaaaabbbaaaaa...',
    '..dabccdaaaabdedbaaaad..',
    '.dabbccdaaacbdeebacaaad.',
    'dababccdaaaabdddbaaaabad',
    'cababcccdaaaabbbaaaaabac',
    '.cabbcccdaaaaaaaaaadbac.',
    '..cabccccdaaaaaaaaabac..',
    '...cabccccdaaaaaadbac...',
    '....cbcccccdddddddac....',
    '.....cbcccccccccbac.....',
    '......cbbcccccbbac......',
    '.......cabbbbbbac.......',
    '........cabaabac........',
    '.........cabbac.........',
    '..........caac..........',
    '...........cc...........',
  ],
};

/** The double diamond an Art's emblem stands in on its screen, 32 × 32, the emblem's 24 centred in it two cells clear:
 *  a line in the element's body at its edge over a deeper one, bevelled as the kit's stone is, and a brass fitting at
 *  each point. */
export const EMBLEM_FRAME: readonly string[] = Array.from({ length: 32 }, (unused, row) =>
  Array.from({ length: 32 }, (alsoUnused, column) => {
    const [across, down] = [Math.abs(column - 15.5), Math.abs(row - 15.5)];
    const point = (across < 1 && down > 14) || (down < 1 && across > 14);
    const ring = across + down;
    return point ? 'f' : ring === 16 ? 'c' : ring === 15 ? 'b' : '.';
  }).join(''),
);

/** The diamond the HUD stands an Anima's icon in, as a Super stands in Destiny's, 34 × 34, the icon's 24 centred in
 *  it: an outline over a line in the element's body over a deeper one and an inner outline, with a brass fitting at
 *  each point, so it reads over any sky. */
export const ANIMA_FRAME: readonly string[] = Array.from({ length: 34 }, (unused, row) =>
  Array.from({ length: 34 }, (alsoUnused, column) => {
    const [across, down] = [Math.abs(column - 16.5), Math.abs(row - 16.5)];
    const ring = across + down;
    const point = ring >= 15 && ring <= 17 && (across < 1 || down < 1);
    return point ? 'f' : ring === 17 || ring === 14 ? 'a' : ring === 16 ? 'c' : ring === 15 ? 'b' : '.';
  }).join(''),
);

/** The ring the HUD stands a Tenet's icon in, as Destiny circles its abilities, 22 × 22, the icon's 12 centred in it:
 *  an outline, the element's body, a deeper line and an inner outline round a clear middle seven cells across. */
export const TENET_RING: readonly string[] = Array.from({ length: 22 }, (unused, row) =>
  Array.from({ length: 22 }, (alsoUnused, column) => {
    const out = Math.hypot(column - 10.5, row - 10.5);
    return out >= 11 ? '.' : out >= 10 ? 'a' : out >= 9 ? 'c' : out >= 8 ? 'b' : out >= 7 ? 'a' : '.';
  }).join(''),
);

/** Each spell's icon by its key: an Anima 24 × 24, a Tenet 12 × 12. */
export const SPELL_MAPS: Readonly<Record<string, readonly string[]>> = {
  tempest: [
    '........................',
    '........................',
    '.........aaa............',
    '........addda...........',
    '.......adeedaaaaaaa.....',
    '.......acdddbbbcddda....',
    '......abcadbbbccdedda...',
    '...aaaaba.aaaaaadeda....',
    '..adddbba.....abddda....',
    '..adeeda...aa..aabba....',
    '..adedda..adda..abba....',
    '...adda..adeeda..acca...',
    '...acca..adeeda..adda...',
    '....abba..adda..addeda..',
    '....abbaa..aa...adeeda..',
    '....adddba.....abbddda..',
    '....adedaaaaaa.abaaaa...',
    '...addedccbbbdacba......',
    '....adddcbbbdddca.......',
    '.....aaaaaaadeeda.......',
    '...........addda........',
    '............aaa.........',
    '........................',
    '........................',
  ],
  quicken: [
    '............',
    '.aa...aa....',
    'acda.acda...',
    '.acda.acda..',
    '..acda.acda.',
    '...aeda.aeda',
    '...aeda.aeda',
    '..acda.acda.',
    '.acda.acda..',
    'acda.acda...',
    '.aa...aa....',
    '............',
  ],
  arcLash: [
    '.........aa.',
    '.......aabca',
    '.....aabbbca',
    '...aabbbaaca',
    '.aabdbaadaca',
    'aeeddaadddca',
    'aeebadddadda',
    '.aabbbaa.aca',
    '...aabbbaaca',
    '.....aabbbca',
    '.......aabca',
    '.........aa.',
  ],
  sunwell: [
    '...........aa...........',
    '..........adda..........',
    '.......a..adda..a.......',
    '......ada.aaaa.ada......',
    '......addaccccadda......',
    '.......aaccddccaa.......',
    '.......acddddddca.......',
    '.....aaacddeeddcaaa.....',
    '....addacdeeeedcadda....',
    '.....aaacdeeeedcaaa.....',
    '.......acddddddca.......',
    '......aaacddddcaaa......',
    '.....abddaccccaddba.....',
    '.....abda.aaaa.adba.....',
    '.....aba..adda..aba.....',
    '.....abaaacddcaaaba.....',
    '...aacbccaaccaaccbcaa...',
    '..acccbaa.acca.aabccca..',
    '..accaa....aa....aacca..',
    '..adddaa........aaddda..',
    '...addddaaaaaaaadddda...',
    '....aaaaddddddddaaaa....',
    '........aaaaaaaa........',
    '........................',
  ],
  mend: [
    '....aaaa....',
    '...acddca...',
    '...adeeda...',
    '.aaadeedaaa.',
    'acdddeedddca',
    'adeeeeeeeeda',
    'adeeeeeeeeda',
    'acdddeedddca',
    '.aaadeedaaa.',
    '...adeeda...',
    '...acddca...',
    '....aaaa....',
  ],
  dawnflare: [
    '.a........a.',
    'aca......aca',
    'adca.aa.acda',
    'addcaddacdda',
    '.addcdeddda.',
    '..addeedda..',
    '...adeeda...',
    '...acddca...',
    '..acbccbca..',
    '..abaccaba..',
    '...aabbaa...',
    '.....aa.....',
  ],
  duskraven: [
    '......a.................',
    '...aaaca.aa.............',
    '..accaccaccaa...........',
    '..acdcccccccca..........',
    '...acdcccccccaa.........',
    '....acdcccccccca........',
    '.....acdccccccca........',
    '......acdcccccca........',
    '.......acdcccca..aaa....',
    '........acdccca.abbba...',
    '.......aaacdccaabbebbaa.',
    '......abbbbbbbbabbbbccca',
    '....aaabbbbcccccabbbacca',
    '.aaabbbbbccbbbbbbbaa.aa.',
    'abbbbbbbbbbbbbbbbba.....',
    '.aaabbbbaabbbbbbbba.....',
    '.abbbaba..aaabbbba......',
    '.abaaba......aaaa.......',
    '..aaba..................',
    '....a...................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
  duskDaggers: [
    '.....aa.....',
    '....abba....',
    '...aabbaa...',
    '..accbbcca..',
    '...aaddaa...',
    '....adda....',
    '..aacddcaa..',
    '.acaaddaaca.',
    'accaaeeaacca',
    '.accaaaacca.',
    '..aa....aa..',
    '............',
  ],
  vanish: [
    '............',
    '...aaa......',
    '..acdca.....',
    '.acbbbca.d..',
    '.acbeeba....',
    '.acbbbca.b..',
    '.acdddca.d..',
    '.acddddca..b',
    '.acdddca.d..',
    '.acddca.b...',
    '.aaaaa..d.b.',
    '............',
  ],
};

/** The pictures the HUD's ability bar draws an Art with, by its id, as SVG: its Anima's icon, as the Art's screen shows
 *  it, that icon's outline alone in the element's body colour, so the empty Anima still reads as the Art's, its two
 *  Tenets' icons, and the Anima's diamond and a Tenet's ring in its colours; null for no Art. */
export function abilityPictures(id: number): {
  readonly anima: string;
  readonly animaOutline: string;
  readonly tenets: readonly [string, string];
  readonly diamond: string;
  readonly ring: string;
} | null {
  const art = arts.arts.find((each) => each.id === id);
  const [first, second] = art?.tenets ?? [];
  if (!art || !first || !second) return null;
  const icon = (key: string) => mapSvg(SPELL_MAPS[key], art.element);
  const anima = SPELL_MAPS[art.anima.key];
  return {
    anima: mapSvg(anima, art.element),
    animaOutline: mapSvg(
      anima?.map((row) => row.replace(/[^a.]/g, '.').replaceAll('a', 'c')),
      art.element,
    ),
    tenets: [icon(first.key), icon(second.key)],
    diamond: mapSvg(ANIMA_FRAME, art.element),
    ring: mapSvg(TENET_RING, art.element),
  };
}
