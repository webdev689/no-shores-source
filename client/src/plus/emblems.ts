// The factions' emblems and the ranks' marks: small pictures drawn pixel for pixel in the kit's palette, each written
// as rows of letters, a letter a tone, so it stays sharp at any whole multiple of its size.
import { TONES } from './tones.ts';

/** A picture's rows, a letter a pixel ('.' is clear), and the tone each letter paints. */
export interface Pixels {
  readonly rows: readonly string[];
  readonly tones: Readonly<Record<string, string>>;
}

/** The Grey Tithe's balance, in grey stone: its beam, its two pans and its post. */
const BALANCE: Pixels = {
  rows: [
    '.....H.....',
    '.HHHHHHHHH.',
    '.L...M...L.',
    '.L...M...L.',
    'L.L..M..L.L',
    'LLL..M..LLL',
    '.....M.....',
    '.....M.....',
    '.....M.....',
    '...MMMMM...',
    '..MMMMMMM..',
  ],
  tones: { H: TONES.stoneHi, L: TONES.stoneLit, M: TONES.stoneMid },
};

/** The pirates' skull, in bone, over two brass bones crossed behind it. */
const SKULL: Pixels = {
  rows: [
    'b.........b',
    '.b.HHHHH.b.',
    '..BBBBBBB..',
    '.BBBBBBBBB.',
    '.BB..B..BB.',
    '.BB..B..BB.',
    '.BBBB.BBBB.',
    '..BBBBBBB..',
    '...B.B.B...',
    '.b.BBBBB.b.',
    'b.........b',
  ],
  tones: { H: TONES.word, B: TONES.wordDim, b: TONES.brass },
};

/** An Elite's mark, one brass chevron; a Miniboss's, two. */
const CHEVRON: Pixels = {
  rows: ['...h...', '..hbh..', '.hb.bh.', 'hb...bh'],
  tones: { h: TONES.brassHi, b: TONES.brassLo },
};
const CHEVRONS: Pixels = {
  rows: ['...h...', '..hbh..', '.hb.bh.', 'hb.h.bh', '..hbh..', '.hb.bh.', 'hb...bh'],
  tones: { h: TONES.brassHi, b: TONES.brassLo },
};

/** Each faction's emblem by its number: 1 the Grey Tithe's balance, 2 the pirates' skull. */
const EMBLEMS: Readonly<Record<number, Pixels>> = { 1: BALANCE, 2: SKULL };
const MARKS = { elite: CHEVRON, miniboss: CHEVRONS } as const;
export type RankMarkName = keyof typeof MARKS;

/** The pixels a side of an emblem. */
export const EMBLEM_PIXELS = 11;

/** A picture as an SVG, a pixel a unit, with its size in pixels. */
function pixelSvg(pixels: Pixels): string {
  const width = pixels.rows[0]?.length ?? 0;
  const height = pixels.rows.length;
  const rects = pixels.rows.flatMap((row, y) =>
    [...row].flatMap((letter, x) => {
      const tone = pixels.tones[letter];
      return tone ? [`<rect x='${x}' y='${y}' width='1' height='1' fill='${tone}'/>`] : [];
    }),
  );
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}' shape-rendering='crispEdges'>${rects.join('')}</svg>`;
}

export const urlOf = (pixels: Pixels) => `data:image/svg+xml,${encodeURIComponent(pixelSvg(pixels))}`;

/** A faction's emblem as a picture's address (an SVG's data URL), or null for a faction with none. */
export function emblemUrl(faction: number): string | null {
  const emblem = EMBLEMS[faction];
  return emblem ? urlOf(emblem) : null;
}

/** A faction's emblem as its rows and tones, for a picture drawn elsewhere (a ship's flag); null for one with none. */
export function emblemPixels(faction: number): Pixels | null {
  return EMBLEMS[faction] ?? null;
}

/** The factions that have an emblem, by number. */
export const EMBLEM_FACTIONS: readonly number[] = Object.keys(EMBLEMS).map(Number);

/** A rank's mark as a picture's address, and its size in pixels. */
export function markPicture(mark: RankMarkName): { url: string; width: number; height: number } {
  const pixels = MARKS[mark];
  return { url: urlOf(pixels), width: pixels.rows[0]?.length ?? 0, height: pixels.rows.length };
}
