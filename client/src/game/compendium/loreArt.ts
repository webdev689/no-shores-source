// The Compendium's pictures: a lore book's cover printed as a poster and bound, drawn pixel by pixel at the size it
// stands; the empty slot of a book not yet found; a category's motif; the small diamond that marks what is new; and the
// closed book that marks a chapter lying in the world.
import type { PixelPicture } from '../../combat/dropPictures.ts';
import { svgOf } from '../../plus/emblems.ts';
import { TONES } from '../../plus/tones.ts';
import { MOTIFS } from '../emblemMotifs.ts';

/** A cover's shape, its width to its height, as its pixels stand at its smallest (48 CSS pixels, a pixel each). */
export const COVER: readonly [number, number] = [48, 60];
const MOTIF = 16;
/** A category's motif, and the new diamond, a pixel a side each. */
export const MOTIF_PIXELS: readonly [number, number] = [MOTIF, MOTIF];
export const NEW_PIXELS: readonly [number, number] = [5, 5];

/** A cover's pixels for its width in CSS pixels: a pixel a CSS pixel under 96, two from there, so each stands square
 *  and a large cover reads as the rest of the interface's pixel art does. */
export function coverGrid(width: number): readonly [number, number] {
  const across = width >= 96 ? Math.round(width / 2) : width;
  return [across, Math.round((across * COVER[1]) / COVER[0])];
}

type Rgb = readonly number[];
const rgbOf = (hex: string): Rgb => [1, 3, 5].map((from) => Number.parseInt(hex.slice(from, from + 2), 16) || 0);
/** `colour` mixed `share` of the way toward `other`. */
const toward = (colour: Rgb, other: Rgb, share: number): Rgb =>
  colour.map((channel, index) => Math.round(channel + ((other[index] ?? 0) - channel) * share));
const [BLACK, WHITE] = [rgbOf('#000000'), rgbOf('#ffffff')];
const [BRASS_HI, BRASS, BRASS_LO, OUTLINE] = [TONES.brassHi, TONES.brass, TONES.brassLo, TONES.outline].map(rgbOf);
const PAPER = [rgbOf('#e9dfc4'), rgbOf('#c9bb99')] as const;

/** A pixel's grain, the same every time it is drawn, as print's on a cover. */
const grain = (x: number, y: number): number => (Math.imul(x + 31, 73_856_093) ^ Math.imul(y + 17, 19_349_663)) >>> 0;

/** A book's cover, its cloth `colour` and its `motif` (emblemMotifs.ts), as RGBA pixels on `grid`: printed as a
 *  poster is, and bound. Its spine at the left; the pages' edge under it; a face banded from light to dark, a
 *  sunburst across it and its print's grain; a frame of thin brass with brackets at its corners, a diamond top and
 *  foot, a chevron and a row of studs; rings about a dark disc rimmed in brass, the motif raised large in its middle;
 *  and a book `complete` turns down a gold corner. */
export function coverPixels(
  grid: readonly [number, number],
  colour: string,
  motif: string,
  complete: boolean,
): Uint8Array {
  const [width, height] = grid;
  const out = new Uint8Array(width * height * 4);
  const put = (x: number, y: number, tone: Rgb) =>
    out.set([tone[0] ?? 0, tone[1] ?? 0, tone[2] ?? 0, 255], (y * width + x) * 4);
  const scale = width / COVER[0];
  const step = (count: number) => Math.max(1, Math.round(count * scale));
  const cloth = rgbOf(colour);
  const [edge, spineWidth] = [step(1) + 1, step(3)];
  const [faceLeft, faceRight, faceTop, faceBottom] = [spineWidth + 1, width - 2, 1, height - 2 - edge];
  const [middleX, middleY] = [(faceLeft + faceRight + 1) / 2, height * 0.42];
  const disc = 14.5 * scale;
  const frame = {
    left: faceLeft + step(3),
    right: faceRight - step(3),
    top: faceTop + step(3),
    bottom: faceBottom - step(3),
  };
  const frameMiddle = Math.floor(middleX);
  const corner = step(6);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const boardEdge = height - 1 - edge;
      // The pages' edge under the board, from the spine to the fore-edge.
      if (y > boardEdge) {
        if (x <= spineWidth || x >= width - 1) continue;
        put(
          x,
          y,
          x === spineWidth + 1 || x === width - 2 || y === height - 1 ? OUTLINE : (PAPER[(height - y) % 2] ?? WHITE),
        );
        continue;
      }
      if ((x === 0 || x === width - 1) && (y === 0 || y === boardEdge)) continue;
      if (x === 0 || x === width - 1 || y === 0 || y === boardEdge) {
        put(x, y, OUTLINE);
        continue;
      }
      if (x <= spineWidth) {
        const spine = toward(cloth, BLACK, 0.38);
        put(
          x,
          y,
          x === spineWidth ? toward(cloth, BLACK, 0.65) : x === spineWidth - 1 ? toward(spine, WHITE, 0.14) : spine,
        );
        continue;
      }
      put(x, y, face(x, y));
    }
  /** The face at `x`, `y`, under the disc and the motif. */
  function face(x: number, y: number): Rgb {
    const [across, down] = [x + 0.5 - middleX, y + 0.5 - middleY];
    const reach = Math.hypot(across, down);
    const angle = Math.atan2(down, across) + Math.PI;
    if (complete) {
      const turned = faceRight - x + (faceBottom - y);
      if (turned < corner) return turned === corner - 1 ? BRASS : turned === 0 ? BRASS_LO : BRASS_HI;
    }
    const inFrame = x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
    // The disc: a brass rim lit at its upper left, a dark line outside it, a thin ring inside, a dark field.
    if (reach <= disc + 1) {
      if (reach > disc) return toward(cloth, BLACK, 0.62);
      if (reach > disc - step(1)) return across + down < 0 ? BRASS_HI : BRASS;
      if (Math.abs(reach - (disc - step(3))) <= 0.5) return BRASS_LO;
      return toward(cloth, BLACK, 0.52);
    }
    // The frame: a thin line, brackets at its corners, a diamond at its top and foot, a chevron, a row of studs.
    const onLine = (x === frame.left || x === frame.right) && y >= frame.top && y <= frame.bottom;
    const onRow = (y === frame.top || y === frame.bottom) && x >= frame.left && x <= frame.right;
    const nearCorner =
      Math.min(x - frame.left, frame.right - x) < step(5) && Math.min(y - frame.top, frame.bottom - y) < step(5);
    const bracket =
      nearCorner &&
      (Math.min(Math.abs(x - frame.left), Math.abs(x - frame.right)) <= 1 ||
        Math.min(Math.abs(y - frame.top), Math.abs(y - frame.bottom)) <= 1) &&
      inFrame;
    if (bracket) return BRASS;
    for (const row of [frame.top, frame.bottom]) {
      const diamond = Math.abs(x - frameMiddle) + Math.abs(y - row);
      if (diamond <= step(2)) return diamond === 0 ? BRASS_HI : BRASS;
    }
    if (onLine || onRow) return toward(BRASS_LO, cloth, 0.2);
    const chevron = y - (frame.top + step(4));
    if (chevron >= 0 && chevron < step(3) && Math.abs(x - frameMiddle) === step(3) - 1 - chevron) return BRASS;
    const studs = frame.bottom - step(5);
    if (y === studs && x > frame.left + step(4) && x < frame.right - step(4) && (x - frameMiddle) % step(3) === 0)
      return BRASS;
    // The ground: banded light to dark down the face, a sunburst of 24 rays, rings broken and dotted about the disc.
    const down01 = (y - faceTop) / (faceBottom - faceTop) + ((x + y) % 2 === 0 ? 0.012 : -0.012);
    let ground =
      down01 < 0.22
        ? toward(cloth, WHITE, 0.1)
        : down01 < 0.55
          ? cloth
          : down01 < 0.8
            ? toward(cloth, BLACK, 0.12)
            : toward(cloth, BLACK, 0.24);
    ground =
      Math.floor(angle / ((2 * Math.PI) / 24)) % 2 === 0 ? toward(ground, WHITE, 0.1) : toward(ground, BLACK, 0.04);
    const speck = grain(x, y) % 13;
    if (speck === 0) ground = toward(ground, WHITE, 0.07);
    if (speck === 1) ground = toward(ground, BLACK, 0.08);
    if (inFrame) {
      const ring = (radius: number) => Math.abs(reach - radius) <= 0.5;
      const dim = toward(BRASS, ground, 0.45);
      if (ring(disc + step(2)) && angle % (Math.PI / 4) > 0.14) return dim;
      // A ring of ticks, as a dial's, a tick every ten degrees.
      const tick = reach >= disc + step(4) && reach <= disc + step(6);
      if (tick && (angle + 0.03) % (Math.PI / 18) < 0.06 + 0.5 / reach) return toward(BRASS, ground, 0.3);
      if (ring(disc + step(8)) && Math.floor(angle / (Math.PI / 30)) % 2 === 0) return dim;
      if (ring(disc + step(11))) return toward(BRASS, ground, 0.7);
    }
    return ground;
  }
  // The motif raised large in the disc's middle, a shadow under it.
  const rows = MOTIFS[motif] ?? [];
  // As large as the disc holds: three times at the largest, once at the smallest.
  const size = Math.max(1, Math.floor((disc * 1.7) / MOTIF));
  const [left, top] = [
    Math.round(middleX - ((rows[0]?.length ?? 0) * size) / 2),
    Math.round(middleY - (rows.length * size) / 2),
  ];
  const raised = (cell: string | undefined) => cell === '#' || cell === '+';
  const fill = (column: number, row: number, tone: Rgb) => {
    for (let down = 0; down < size; down++)
      for (let across = 0; across < size; across++) put(left + column * size + across, top + row * size + down, tone);
  };
  rows.forEach((line, row) =>
    [...line].forEach((cell, column) => {
      if (raised(cell) && !raised(rows[row + 1]?.[column + 1])) fill(column + 1, row + 1, toward(cloth, BLACK, 0.75));
    }),
  );
  rows.forEach((line, row) =>
    [...line].forEach((cell, column) => raised(cell) && fill(column, row, cell === '#' ? BRASS : BRASS_HI)),
  );
  return out;
}

/** Where a book not yet found stands: an empty slot outlined in dots, as a gap on a shelf, on `grid`. */
export function slotPixels(grid: readonly [number, number]): Uint8Array {
  const [width, height] = grid;
  const out = new Uint8Array(width * height * 4);
  const dot = rgbOf(TONES.stoneMid);
  const run = Math.max(1, Math.round(width / COVER[0]));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rim = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const dotted = Math.floor((x + y) / run) % 2 === 0;
      if (rim && !dotted) continue;
      out.set(rim ? [...dot, 255] : [0, 0, 0, 70], (y * width + x) * 4);
    }
  return out;
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
