// The Compendium's pictures, drawn pixel for pixel as the Journal's are: a lore book's cover in its cloth with its
// motif tooled in brass, as Destiny shows a lore book's cover; a category's motif; the small diamond that marks what is
// new; and the closed book that marks a chapter lying in the world.
import type { PixelPicture } from '../../combat/dropPictures.ts';
import { type Pixels, svgOf } from '../../plus/emblems.ts';
import { TONES } from '../../plus/tones.ts';
import { MOTIFS } from '../emblemMotifs.ts';

/** A cover's pixels, its width and height: a spine, a board, and the motif's 16-pixel square in a medallion on it. */
export const COVER: readonly [number, number] = [48, 60];
const MOTIF = 16;
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

/** Where the cover's parts stand, in its pixels. The spine runs to x 7, the groove of its hinge at 8, the board from 9
 *  to 46; light falls from the top left. */
const BOARD = { left: 9, right: 46, top: 1, bottom: 58 } as const;
/** The spine's four raised bands, each the row of its first of three. */
const BANDS = [12, 23, 34, 45] as const;
/** The medallion's box (an octagon, its corners cut `cut` deep) and its rim's rings: dark, brass, dark. */
const MEDALLION = { left: 16, right: 39, top: 19, bottom: 42, cut: 5 } as const;

/** A pixel's grain, the same every time it is drawn: a cloth's weave lit or shaded here and there. */
const grain = (x: number, y: number): number => (Math.imul(x + 31, 73_856_093) ^ Math.imul(y + 17, 19_349_663)) >>> 0;

/** A rectangle's outline from `left`, `top` to `right`, `bottom`, inclusive. */
const onFrame = (x: number, y: number, left: number, top: number, right: number, bottom: number): boolean =>
  ((x === left || x === right) && y >= top && y <= bottom) || ((y === top || y === bottom) && x >= left && x <= right);

/** The spine at `x`, `y`: rounded (lit down its middle), its caps brass, its bands raised, a gilt fleuron between
 *  them and a dark label in the middle panel with two gilt rules for its title. */
function spine(x: number, y: number): string {
  if (y <= 3 || y >= 56) return x === 1 || x === 7 ? 'L' : y === 1 || y === 56 ? 'B' : y === 3 || y === 58 ? 'L' : 'b';
  const band = BANDS.find((first) => y >= first && y <= first + 2);
  if (band !== undefined) return x === 1 || x === 7 ? 'r' : (['v', 'u', 'q'][y - band] ?? 'p');
  const round = ['q', 'r', 'p', 'u', 'p', 'r', 'q'][x - 1] ?? 'p';
  if (y >= 26 && y <= 33 && x >= 2 && x <= 6)
    return y === 26 || y === 33 ? 'b' : (y === 29 || y === 31) && x >= 3 && x <= 5 ? 'b' : 'z';
  // A fleuron in the middle of each other panel: a gilt diamond, lit at its heart.
  const middle = [8, 19, 41, 52].find((row) => Math.abs(y - row) + Math.abs(x - 4) <= 1);
  if (middle !== undefined) return y === middle && x === 4 ? 'B' : 'b';
  return round;
}

/** How far inside the medallion's octagon `x`, `y` stands, 0 on its rim; below 0 outside it. */
function inMedallion(x: number, y: number): number {
  const { left, right, top, bottom, cut } = MEDALLION;
  const across = Math.min(x - left, right - x);
  const down = Math.min(y - top, bottom - y);
  return Math.min(across, down, across + down - cut);
}

/** A brass corner piece, `across` and `down` pixels in from a corner of the board: its edge dark, a rivet lit, its
 *  sides along the book's edges lit on a corner the light falls on (`lit`); none past it. */
function cornerPiece(across: number, down: number, lit: boolean): string | null {
  if (across + down > 6) return null;
  if (across + down === 6) return 'K';
  if (across === 2 && down === 2) return 'B';
  if (across === 0 || down === 0) return lit ? 'B' : 'L';
  return 'b';
}

/** The board at `x`, `y`, under its metal: a woven cloth, bevelled, a blind-tooled double line round it, a gilt frame
 *  inside that with a fleuron in each corner, a brass plate for a title, a medallion, a gilt flourish under it, and a
 *  strap and clasp on the fore-edge. */
function board(x: number, y: number): string {
  const { left, right, top, bottom } = BOARD;
  for (const [cornerX, cornerY] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ] as const) {
    const piece = cornerPiece(Math.abs(x - cornerX), Math.abs(y - cornerY), cornerX === left || cornerY === top);
    if (piece) return piece;
  }
  // The clasp: a brass catch on a dark strap that wraps the fore-edge, stitched along its sides.
  if (x >= 41 && x <= 44 && y >= 27 && y <= 34) {
    if (onFrame(x, y, 41, 27, 44, 34)) return 'K';
    if ((x === 42 || x === 43) && (y === 30 || y === 31)) return x === 42 && y === 30 ? 'B' : 'K';
    return y === 28 ? 'B' : y === 33 ? 'L' : 'b';
  }
  if (x >= 44 && y >= 28 && y <= 33)
    return y === 28 ? 'Z' : y === 33 ? 'k' : (y === 29 || y === 32) && x % 2 === 1 ? 'y' : 'z';
  // The title plate: brass, rimmed dark, its corners round, a rivet each end and its title an engraved line.
  if (x >= 20 && x <= 35 && y >= 11 && y <= 15) {
    if ((x === 20 || x === 35) && (y === 11 || y === 15)) return 'c';
    if (onFrame(x, y, 20, 11, 35, 15)) return 'K';
    if (y === 13 && (x === 22 || x === 33)) return 'B';
    if (y === 13 && x >= 25 && x <= 30) return 'L';
    return y === 12 ? 'B' : y === 14 ? 'L' : 'b';
  }
  const inside = inMedallion(x, y);
  if (inside >= 0) return inside === 0 || inside === 2 ? 'K' : inside === 1 ? (x + y < 50 ? 'B' : 'b') : 's';
  // The flourish under the medallion: a gilt rule, a lit diamond at its middle.
  if (y >= 45 && y <= 47 && x >= 21 && x <= 34) {
    const diamond = Math.abs(y - 46) + Math.min(Math.abs(x - 27), Math.abs(x - 28)) <= 1;
    if (diamond) return y === 46 ? 'B' : 'b';
    if (y === 46) return 'b';
  }
  if (onFrame(x, y, 15, 7, 40, 52)) return y === 7 || x === 15 ? 'B' : 'b';
  const fleuron = [
    [17, 9],
    [38, 9],
    [17, 50],
    [38, 50],
  ].find(([atX = 0, atY = 0]) => Math.abs(x - atX) + Math.abs(y - atY) <= 1);
  if (fleuron) return fleuron[0] === x && fleuron[1] === y ? 'B' : 'b';
  if (onFrame(x, y, 12, 4, 43, 55)) return 'k';
  if (onFrame(x, y, 13, 5, 42, 54)) return 'l';
  if (x === left || y === top) return 'h';
  if (x === right || y === bottom) return 'd';
  if (x === left + 1 || y === top + 1) return 'l';
  if (x === right - 1 || y === bottom - 1) return 'm';
  // The weave lit more often toward the top left and shaded toward the bottom right, as a board catches the light.
  const weave = grain(x, y) % 11;
  const toLight = (x - left) / (right - left) + (y - top) / (bottom - top);
  if (weave === 0 || (weave === 2 && toLight < 0.7)) return 'l';
  return weave === 1 || (weave === 3 && toLight > 1.3) ? 'm' : 'c';
}

/** A cover as rows of letters (`coverSvg` gives each its tone): its outline, its spine, the groove of its hinge, its
 *  board, and its motif's cells (`#` and `+`) raised in brass in the medallion's middle, a shadow under each. */
export function coverRows(motif: readonly string[] | null): string[] {
  const [width, height] = COVER;
  const rows = Array.from({ length: height }, (unusedRow, y) =>
    Array.from({ length: width }, (unusedCell, x): string => {
      const corner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
      if (corner) return '.';
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) return 'o';
      if (x < BOARD.left - 1) return spine(x, y);
      if (x === BOARD.left - 1) return 'g';
      return board(x, y);
    }),
  );
  // The motif centred in the medallion, whatever of its 16 it fills.
  const shown = motif ?? [];
  const [left, top] = [
    MEDALLION.left + 4 + Math.floor((MOTIF - (shown[0]?.length ?? 0)) / 2),
    MEDALLION.top + 4 + Math.floor((MOTIF - shown.length) / 2),
  ];
  const raised = (cell: string | undefined) => cell === '#' || cell === '+';
  shown.forEach((line, row) =>
    [...line].forEach((cell, column) => {
      const cells = rows[top + row];
      if (cells && raised(cell)) cells[left + column] = cell === '#' ? 'b' : 'B';
      const below = rows[top + row + 1];
      const casts = raised(cell) && !raised(shown[row + 1]?.[column + 1]);
      if (below && casts && below[left + column + 1] === 's') below[left + column + 1] = 'k';
    }),
  );
  return rows.map((row) => row.join(''));
}

/** A book's cover as SVG markup: its cloth `colour` and its motif (emblemMotifs.ts); a book not `found` is plain stone
 *  with no motif and no brass, so nothing of it shows but that it is there. */
export function coverSvg(colour: string, motif: string, found: boolean): string {
  const cloth = found ? colour : UNFOUND;
  const toward = (share: number) => mixed(cloth, share < 0 ? '#000000' : '#ffffff', Math.abs(share));
  const pixels: Pixels = {
    rows: coverRows(found ? (MOTIFS[motif] ?? null) : null),
    tones: {
      o: TONES.outline,
      q: toward(-0.55),
      r: toward(-0.38),
      p: toward(-0.2),
      u: toward(0.04),
      v: toward(0.2),
      g: toward(-0.72),
      c: cloth,
      h: toward(0.24),
      l: toward(0.1),
      m: toward(-0.12),
      d: toward(-0.3),
      k: toward(-0.5),
      s: toward(-0.36),
      z: toward(-0.6),
      Z: toward(-0.42),
      y: toward(0.3),
      B: found ? TONES.brassHi : TONES.stoneLit,
      b: found ? TONES.brass : TONES.stoneMid,
      L: found ? TONES.brassLo : TONES.stoneLo,
      K: found ? TONES.brassDark : TONES.stoneDark,
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
