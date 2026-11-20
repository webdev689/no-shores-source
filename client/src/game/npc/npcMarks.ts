// The keepers' marks, drawn pixel by pixel as the Arts' emblems are: each keeper's sign in brass in a diamond, as
// Destiny marks a vendor beside their name (an eye for the Mage, a shield for the Armorsmith, a sword for the
// Weaponsmith, a needle and thread for the Tailor, a horseshoe for the Tack, and for Shape a shape that is no shape);
// and the glyph of Shapes, the currency only he takes. A faction's mark is its emblem (npcScreen.ts).

/** A map's colours in order of its letters: outline, ground, body, light. */
const LETTERS = 'abcd';
const BRASS = ['#2a1b08', '#16110a', '#c08a3e', '#f3cf86'];
const SHAPES = ['#15121c', '#4a4258', '#9a8fb0', '#e9e2f7'];

/** Each keeper's sign, 11 × 11, laid in the middle of the diamond. */
const SIGNS: Readonly<Record<string, readonly string[]>> = {
  mage: [
    '...........',
    '...........',
    '...ddddd...',
    '..d.....d..',
    '.d..ccc..d.',
    'd..cdddc..d',
    '.d..ccc..d.',
    '..d.....d..',
    '...ddddd...',
    '...........',
    '...........',
  ],
  armorsmith: [
    '...........',
    '..ddddddd..',
    '..dcccccd..',
    '..dcdddcd..',
    '..dcdddcd..',
    '..dcdddcd..',
    '...dcdcd...',
    '...dcccd...',
    '....dcd....',
    '.....d.....',
    '...........',
  ],
  weaponsmith: [
    '.....d.....',
    '.....d.....',
    '.....d.....',
    '.....d.....',
    '.....d.....',
    '.....d.....',
    '.....d.....',
    '...ccccc...',
    '.....c.....',
    '.....c.....',
    '....ccc....',
  ],
  tailor: [
    '.........dd',
    '........d.d',
    '.......dd..',
    '......d....',
    '.....d.....',
    '....d......',
    '...d....c..',
    '..d....c.c.',
    '.d.....c.c.',
    'd.......c..',
    '...........',
  ],
  tack: [
    '...........',
    '..ddd.ddd..',
    '.dd.....dd.',
    '.d.......d.',
    '.d.......d.',
    '.d.......d.',
    '.dd.....dd.',
    '..dd...dd..',
    '...ddddd...',
    '...........',
    '...........',
  ],
  shape: [
    '...........',
    '....dd.....',
    '...d..d....',
    '..d....dd..',
    '..d......d.',
    '...d....d..',
    '..d.....d..',
    '.d.....d...',
    '..dd..d....',
    '....dd.....',
    '...........',
  ],
};

/** The glyph of Shapes: a stone cut on no plan, pale as the Pale Expanse. */
const SHAPES_GLYPH = [
  '.....aa.....',
  '....adda....',
  '...adccda...',
  '..adcccbda..',
  '.adcccccbda.',
  'adccccccbbda',
  '.abccccbbba.',
  '..abcccbba..',
  '...abbbba...',
  '....abba....',
  '.....aa.....',
];

/** A map as an SVG picture, each run of one colour along a row one rect, crisp at any whole size. */
export function markSvg(rows: readonly string[], colours: readonly string[]): string {
  const rects: string[] = [];
  rows.forEach((row, line) => {
    for (let column = 0; column < row.length;) {
      const letter = row.charAt(column);
      let end = column + 1;
      while (row.charAt(end) === letter) end++;
      const fill = colours[LETTERS.indexOf(letter)];
      if (fill) rects.push(`<rect x="${column}" y="${line}" width="${end - column}" height="1" fill="${fill}"/>`);
      column = end;
    }
  });
  const width = rows[0]?.length ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

/** The diamond's side, in its pixels, and where the sign sits in it. */
const SIDE = 21;
const SIGN_AT = 5;

/** A keeper's sign in its brass diamond, 21 × 21; null for a keeper with no sign. */
export function keeperMap(kind: string): readonly string[] | null {
  const sign = SIGNS[kind];
  if (!sign) return null;
  const middle = (SIDE - 1) / 2;
  return Array.from({ length: SIDE }, (unused, row) =>
    Array.from({ length: SIDE }, (unseen, column) => {
      const reach = Math.abs(row - middle) + Math.abs(column - middle);
      const signed = sign[row - SIGN_AT]?.charAt(column - SIGN_AT) ?? '.';
      if (reach > middle) return '.';
      if (reach === middle) return 'a';
      if (reach === middle - 1) return 'c';
      return signed === '.' || signed === '' ? 'b' : signed;
    }).join(''),
  );
}

export const keeperMarkSvg = (kind: string): string => {
  const map = keeperMap(kind);
  return map ? markSvg(map, BRASS) : '';
};
export const shapesSvg = (): string => markSvg(SHAPES_GLYPH, SHAPES);
export const svgUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;
