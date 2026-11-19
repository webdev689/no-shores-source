// The Arts' pictures, drawn pixel by pixel as the elements' and the gear's glyphs are: each Art's emblem in a diamond,
// as Destiny frames a subclass (Storm a forked bolt, Divine a sun with wings, Shadow a crescent holding a raven's
// eye), and an icon for each spell. Each is drawn in its Art's element: an outline, a deep shade, the body, its light
// and a white heat. The fragments' icons are in `game/artFragments.ts`.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { ELEMENTS } from './gear.ts';

/** The letters a map draws with, each a colour of its Art's palette in turn; a dot is none. */
export const PALETTE_LETTERS = 'abcde';
/** Each element's deep shade and white heat, by the gear crate's numbers, beside its glyph's outline, body and light. */
const DEEP: Readonly<Record<number, readonly [string, string]>> = {
  1: ['#b8441a', '#fff6d8'],
  2: ['#1f6fa8', '#ffffff'],
  3: ['#5d2aa8', '#ffffff'],
};

/** An element's palette for the Arts' maps: its outline, deep shade, body, light and heat; empty for none. */
export function artPalette(element: number): readonly string[] {
  const glyph = ELEMENTS[element]?.palette;
  const [deep, heat] = DEEP[element] ?? [];
  if (!glyph || !deep || !heat) return [];
  const [outline, body, light] = glyph;
  return [outline, deep, body, light, heat];
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

/** The pictures the HUD's ability bar draws an Art with, by its id, as SVG: its emblem in its diamond and its two
 *  Tenets' icons; null for no Art. */
export function abilityPictures(
  id: number,
): { readonly diamond: string; readonly tenets: readonly [string, string] } | null {
  const art = arts.arts.find((each) => each.id === id);
  const [first, second] = art?.tenets ?? [];
  if (!art || !first || !second) return null;
  const icon = (key: string) => mapSvg(SPELL_MAPS[key], art.element);
  return { diamond: mapSvg(EMBLEM_MAPS[art.key], art.element), tenets: [icon(first.key), icon(second.key)] };
}
