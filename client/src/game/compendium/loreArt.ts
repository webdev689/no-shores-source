// The Compendium's pictures, drawn pixel for pixel as the Journal's are: a lore book's cover in its cloth with its
// motif tooled in brass, as Destiny shows a lore book's cover; a category's motif; the small diamond that marks what is
// new; and the closed book that marks a chapter lying in the world.
import type { PixelPicture } from '../../combat/dropPictures.ts';
import { type Pixels, svgOf } from '../../plus/emblems.ts';
import { TONES } from '../../plus/tones.ts';
import { MOTIFS } from '../emblemMotifs.ts';

/** A cover's pixels: its width and height, a motif's side, and where the motif's top-left stands on it. */
export const COVER: readonly [number, number] = [24, 30];
const MOTIF = 16;
const MOTIF_AT: readonly [number, number] = [5, 7];
/** A category's motif, and the new diamond, a pixel a side each. */
export const MOTIF_PIXELS: readonly [number, number] = [MOTIF, MOTIF];
export const NEW_PIXELS: readonly [number, number] = [5, 5];
/** The cloth of a book not yet found: stone, unmarked. */
const UNFOUND = TONES.stoneDim;

/** A colour `#rrggbb` mixed `share` of the way toward `toward` (`#rrggbb`). */
export function mixed(colour: string, toward: string, share: number): string {
  const channels = (hex: string) => [1, 3, 5].map((from) => Number.parseInt(hex.slice(from, from + 2), 16) || 0);
  const [from, to] = [channels(colour), channels(toward)];
  const out = from.map((channel, index) => Math.round(channel + ((to[index] ?? 0) - channel) * share));
  return `#${out.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** A cover as rows of letters: its outline, its spine with two brass bands, its cloth lit along the top and shaded
 *  along its fore-edge and foot, a brass corner at each of the face's corners, and its motif's cells (`#` and `+`)
 *  tooled into the middle of the face. */
export function coverRows(motif: readonly string[] | null): string[] {
  const [width, height] = COVER;
  const rows = Array.from({ length: height }, (unusedRow, y) =>
    Array.from({ length: width }, (unusedCell, x): string => {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) return 'o';
      if (x <= 3) return y === 3 || y === height - 4 ? 'S' : 's';
      if (x === 4) return 'k';
      const corner = (x <= 6 || x >= width - 4) && (y <= 3 || y >= height - 4);
      if (corner) return 'b';
      if (y === 1) return 'h';
      if (x === width - 2 || y === height - 2) return 'd';
      return 'c';
    }),
  );
  // The motif centred in its square, whatever of the 16 it fills.
  const shown = motif ?? [];
  const [left, top] = [
    MOTIF_AT[0] + Math.floor((MOTIF - (shown[0]?.length ?? 0)) / 2),
    MOTIF_AT[1] + Math.floor((MOTIF - shown.length) / 2),
  ];
  shown.forEach((line, row) =>
    [...line].forEach((cell, column) => {
      const cells = rows[top + row];
      if (cells && (cell === '#' || cell === '+')) cells[left + column] = cell === '#' ? 'b' : 'B';
    }),
  );
  return rows.map((row) => row.join(''));
}

/** A book's cover as SVG markup: its cloth `colour` and its motif (emblemMotifs.ts); a book not `found` is plain stone
 *  with no motif, so nothing of it shows but that it is there. */
export function coverSvg(colour: string, motif: string, found: boolean): string {
  const cloth = found ? colour : UNFOUND;
  const pixels: Pixels = {
    rows: coverRows(found ? (MOTIFS[motif] ?? null) : null),
    tones: {
      o: TONES.outline,
      s: mixed(cloth, '#000000', 0.45),
      S: found ? TONES.brass : TONES.stoneMid,
      k: mixed(cloth, '#000000', 0.65),
      c: cloth,
      h: mixed(cloth, '#ffffff', 0.22),
      d: mixed(cloth, '#000000', 0.28),
      b: found ? TONES.brass : TONES.stoneMid,
      B: TONES.brassHi,
    },
  };
  return svgOf(pixels);
}

/** A category's motif in brass, `#` its body and `+` lit, as SVG markup; none for a motif not drawn. */
export function motifSvg(motif: string, dim = false): string | null {
  const rows = MOTIFS[motif];
  if (!rows) return null;
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => row.padEnd(width, '.'));
  return svgOf({
    rows: padded,
    tones: { '#': dim ? TONES.stoneMid : TONES.brass, '+': dim ? TONES.stoneLit : TONES.brassHi },
  });
}

/** The small diamond Destiny marks what is new with, in lit brass outlined dark. */
export const NEW_SVG = svgOf({
  rows: ['..o..', '.oBo.', 'oBBBo', '.oBo.', '..o..'],
  tones: { o: TONES.outline, B: TONES.brassHi },
});

/** A chapter lying in the world, as the mark over it: a closed book in a brass binding, its clasp lit, 12 × 12 as a
 *  drop's picture (combat/marksOver.ts lays it). */
export const LORE_PICTURE: PixelPicture = {
  rows: [
    '............',
    '..aaaaaaaa..',
    '.abbbbbbbba.',
    '.abccccccba.',
    '.abcddddcba.',
    '.abcdeedcbaa',
    '.abcdeedcbfa',
    '.abcddddcbaa',
    '.abccccccba.',
    '.abbbbbbbba.',
    '..aaaaaaaa..',
    '............',
  ],
  colours: ['#2a1b08', '#7a5424', '#6b2a24', '#8e3a30', '#c08a3e', '#f3cf86'],
};
