import catalogue from '../../../content/gear/emblems.json' with { type: 'json' };
import { MOTIFS } from './emblemMotifs.ts';

/**
 * Emblems drawn as Destiny draws them, in Overlook's pixels: a square sign and the nameplate it heads, whose left square
 * is the sign's own ground, so the two join without a seam. The sign is 24 cells square and the nameplate 120 by 24,
 * shown at whole multiples (four times is Destiny's 96 and 474 by 96). Each is drawn from its emblem's colours, its
 * pattern and its sign, never from a picture.
 */

/** An emblem as the catalogue holds it, with its art. */
export interface Emblem {
  readonly id: string;
  readonly name: string;
  readonly rarity: string;
  readonly words: string;
  readonly source: { readonly kind: string; readonly level?: number; readonly aurem?: number };
  readonly art: {
    readonly ground: readonly string[];
    readonly ink: string;
    readonly accent: string;
    readonly pattern: string;
    readonly motif: string;
  };
}

/** Every emblem, numbered by its place, as the gear message numbers them. */
export const EMBLEMS: readonly Emblem[] = catalogue.emblems;

/** An emblem by its number or id; the first, Overlook's own, for none. */
export function emblemOf(which: number | string | null | undefined): Emblem {
  const found = typeof which === 'number' ? EMBLEMS[which] : EMBLEMS.find((each) => each.id === which);
  return found ?? (EMBLEMS[0] as Emblem);
}

/** The sign's square and the nameplate's length, in cells; and a band's, a nameplate run on behind a long row. */
export const SIGN_CELLS = 24;
export const PLATE_CELLS = 120;
export const BAND_CELLS = 320;

/** How an emblem is drawn: its sign alone; its nameplate, framed all round; a band, the nameplate run on unframed at
 *  its end, behind a row of any length, which the colour it ends in fills on past it; or a banner, as Destiny 2 heads
 *  its character screen, the pattern carried the whole way and framed all round at the length asked for. */
export type Shape = 'sign' | 'plate' | 'band' | 'banner';
const WIDTHS: Readonly<Record<Shape, number>> = {
  sign: SIGN_CELLS,
  plate: PLATE_CELLS,
  band: BAND_CELLS,
  banner: PLATE_CELLS,
};

type Rgb = readonly [number, number, number];

const rgb = (hex: string): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const dark = (colour: Rgb, times: number): Rgb => [
  Math.round(colour[0] * times),
  Math.round(colour[1] * times),
  Math.round(colour[2] * times),
];

/** Whether a pattern marks a cell. */
function patterned(pattern: string, x: number, y: number): boolean {
  switch (pattern) {
    case 'stripes':
      return (x + y) % 6 < 2;
    case 'waves':
      return (y + Math.round(Math.sin(x / 2.5) * 1.5) + 12) % 6 === 0;
    case 'stars':
      return ((x * 73856093) ^ (y * 19349663)) % 41 === 0;
    case 'chevrons':
      return (y + Math.abs((x % 8) - 4)) % 6 === 0;
    case 'checks':
      return ((x >> 2) + (y >> 2)) % 2 === 0;
    default:
      return false;
  }
}

/** The sign's cells on its square: 1 ink, 2 accent, 3 the dark edge round them, 0 none; centred however small. */
function signCells(motif: string): Uint8Array {
  const rows = MOTIFS[motif] ?? [];
  const cells = new Uint8Array(SIGN_CELLS * SIGN_CELLS);
  const filled = rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === '.' ? [] : [[x, y] as const])));
  const [left, right] = [Math.min(...filled.map(([x]) => x)), Math.max(...filled.map(([x]) => x))];
  const [top, bottom] = [Math.min(...filled.map(([, y]) => y)), Math.max(...filled.map(([, y]) => y))];
  const offsetX = Math.floor((SIGN_CELLS - (right - left + 1)) / 2) - left;
  const offsetY = Math.floor((SIGN_CELLS - (bottom - top + 1)) / 2) - top;
  for (const [x, y] of filled) cells[(y + offsetY) * SIGN_CELLS + x + offsetX] = rows[y]?.[x] === '+' ? 2 : 1;
  for (let y = 0; y < SIGN_CELLS; y++)
    for (let x = 0; x < SIGN_CELLS; x++) {
      if (cells[y * SIGN_CELLS + x] !== 0) continue;
      const near = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(
        ([across = -1, down = -1]) =>
          across >= 0 &&
          down >= 0 &&
          across < SIGN_CELLS &&
          down < SIGN_CELLS &&
          (cells[down * SIGN_CELLS + across] ?? 0) % 3 !== 0,
      );
      if (near) cells[y * SIGN_CELLS + x] = 3;
    }
  return cells;
}

/** An emblem's cells as colours, four numbers each (red, green, blue, opaque), in its shape. */
export function emblemPixels(emblem: Emblem, shape: Shape, cells = WIDTHS[shape]): Uint8ClampedArray<ArrayBuffer> {
  const { ground, ink, accent, pattern, motif } = emblem.art;
  const [top, foot] = [rgb(ground[0] ?? '#000000'), rgb(ground[1] ?? ground[0] ?? '#000000')];
  const [inked, lit] = [rgb(ink), rgb(accent)];
  const width = Math.max(SIGN_CELLS, Math.round(cells));
  const sign = signCells(motif);
  const pixels = new Uint8ClampedArray(width * SIGN_CELLS * 4);
  for (let y = 0; y < SIGN_CELLS; y++)
    for (let x = 0; x < width; x++) {
      // The ground falls from its top colour to its foot in four bands, and past the sign darkens toward the end.
      const band = Math.min(3, Math.floor((y / SIGN_CELLS) * 4)) / 3;
      const reach = shape === 'banner' ? width - SIGN_CELLS : PLATE_CELLS - SIGN_CELLS;
      const along = Math.min(1, Math.max(0, (x - SIGN_CELLS) / reach));
      let colour = dark(mix(top, foot, band), 1 - along * 0.3);
      // A banner keeps its pattern the whole way; a nameplate's fades toward its end.
      const faded = shape === 'banner' ? 0.22 * (1 - along * 0.5) : 0.22 * (1 - along);
      if (patterned(pattern, x, y)) colour = mix(colour, lit, x < SIGN_CELLS ? 0.22 : faded);
      const cell = x < SIGN_CELLS ? (sign[y * SIGN_CELLS + x] ?? 0) : 0;
      if (cell === 1) colour = inked;
      else if (cell === 2) colour = lit;
      else if (cell === 3) colour = dark(foot, 0.45);
      // A frame a cell wide, lit along its top as Enhanced Plus's stone is.
      if (y === 0 || y === SIGN_CELLS - 1 || x === 0 || (x === width - 1 && shape !== 'band'))
        colour = y === 0 ? mix(colour, lit, 0.35) : dark(foot, 0.55);
      pixels.set([...colour, 255], (y * width + x) * 4);
    }
  return pixels;
}

const drawn = new Map<string, string>();

/** An emblem in its shape as an image's address, drawn once a page; a banner at the cells it is asked for, the last
 *  kept. */
export function emblemImage(emblem: Emblem, shape: Shape, cells = WIDTHS[shape]): string {
  const key = `${emblem.id}:${shape}:${cells}`;
  const known = drawn.get(key);
  if (known) return known;
  const canvas = document.createElement('canvas');
  const pixels = emblemPixels(emblem, shape, cells);
  [canvas.width, canvas.height] = [pixels.length / 4 / SIGN_CELLS, SIGN_CELLS];
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
  const address = canvas.toDataURL();
  // A banner is drawn to whatever width the window gives it, so only the last one is kept, not one a width.
  if (shape === 'banner') for (const old of drawn.keys()) if (old.includes(':banner:')) drawn.delete(old);
  drawn.set(key, address);
  return address;
}

/** The colour a band ends in, which a row longer than it is filled with. */
export function plateEnd(emblem: Emblem): string {
  const pixels = emblemPixels(emblem, 'band');
  const end = (SIGN_CELLS / 2) * BAND_CELLS * 4 + (BAND_CELLS - 1) * 4;
  return `rgb(${pixels[end] ?? 0},${pixels[end + 1] ?? 0},${pixels[end + 2] ?? 0})`;
}
