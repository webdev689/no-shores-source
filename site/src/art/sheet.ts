// The sheet the website's pictures are drawn on at build time: a grid of opaque colours (or clear), the few strokes a
// pixel scene needs, an ordered dither for shading, and a PNG writer. Every stroke inks whole colours, never blends,
// so a picture keeps a small palette and its PNG stays a few kilobytes.
import { deflateSync } from 'node:zlib';

/** A colour as `#rrggbb`, or `''` for clear. */
export type Ink = string;

export interface Sheet {
  readonly width: number;
  readonly height: number;
  /** One ink a cell, row by row. */
  readonly cells: Ink[];
}

export const makeSheet = (width: number, height: number): Sheet => ({
  width,
  height,
  cells: new Array<Ink>(width * height).fill(''),
});

// The 4 by 4 ordered pattern: a cell takes the second ink when the share asked for passes its threshold.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Whether the pattern picks the second ink at `x, y` for a share of 0..1. */
export const patternOn = (x: number, y: number, share: number): boolean =>
  share * 16 > (BAYER[y & 3]?.[x & 3] ?? 0) + 0.5;

export function dot(sheet: Sheet, x: number, y: number, ink: Ink): void {
  const col = Math.round(x);
  const row = Math.round(y);
  if (col < 0 || row < 0 || col >= sheet.width || row >= sheet.height) return;
  sheet.cells[row * sheet.width + col] = ink;
}

export function inkAt(sheet: Sheet, x: number, y: number): Ink {
  if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return '';
  return sheet.cells[y * sheet.width + x] ?? '';
}

export function box(sheet: Sheet, x: number, y: number, width: number, height: number, ink: Ink): void {
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) dot(sheet, x + col, y + row, ink);
}

/** Bands of colour top to bottom, each dithered into the next: a sky or a stretch of water. */
export function fade(sheet: Sheet, top: number, height: number, inks: readonly Ink[]): void {
  const bands = inks.length - 1;
  for (let row = 0; row < height; row++) {
    const along = (row / Math.max(1, height - 1)) * bands;
    const band = Math.min(bands - 1, Math.floor(along));
    for (let col = 0; col < sheet.width; col++) {
      const ink = patternOn(col, top + row, along - band) ? inks[band + 1] : inks[band];
      dot(sheet, col, top + row, ink ?? '');
    }
  }
}

/** A filled oval. */
export function disc(sheet: Sheet, centreX: number, centreY: number, wide: number, tall: number, ink: Ink): void {
  for (let row = Math.floor(-tall); row <= Math.ceil(tall); row++)
    for (let col = Math.floor(-wide); col <= Math.ceil(wide); col++)
      if ((col * col) / (wide * wide) + (row * row) / (tall * tall) <= 1) dot(sheet, centreX + col, centreY + row, ink);
}

/** Light falling off round a point, dithered: near the middle most cells take the ink, at `reach` none. */
export function glow(sheet: Sheet, centreX: number, centreY: number, reach: number, ink: Ink, strength = 0.6): void {
  for (let row = -reach; row <= reach; row++)
    for (let col = -reach; col <= reach; col++) {
      const away = Math.hypot(col, row) / reach;
      if (away < 1 && patternOn(centreX + col, centreY + row, strength * (1 - away) ** 2))
        dot(sheet, centreX + col, centreY + row, ink);
    }
}

/** Light that only falls on cells already inked, so a lit wall stays inside its wall. */
export function lightOn(sheet: Sheet, centreX: number, centreY: number, reach: number, ink: Ink, strength = 0.6): void {
  for (let row = -reach; row <= reach; row++)
    for (let col = -reach; col <= reach; col++) {
      const away = Math.hypot(col, row) / reach;
      const x = centreX + col;
      const y = centreY + row;
      if (away < 1 && inkAt(sheet, x, y) && patternOn(x, y, strength * (1 - away) ** 2)) dot(sheet, x, y, ink);
    }
}

export function line(sheet: Sheet, fromX: number, fromY: number, toX: number, toY: number, ink: Ink): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
  for (let step = 0; step <= steps; step++)
    dot(sheet, fromX + ((toX - fromX) * step) / steps, fromY + ((toY - fromY) * step) / steps, ink);
}

/** A filled shape from its corners, in order. */
export function shape(sheet: Sheet, corners: readonly (readonly [number, number])[], ink: Ink): void {
  const rows = corners.map((corner) => corner[1]);
  for (let row = Math.floor(Math.min(...rows)); row <= Math.ceil(Math.max(...rows)); row++) {
    const cuts: number[] = [];
    corners.forEach(([startX, startY], place) => {
      const [endX, endY] = corners[(place + 1) % corners.length] ?? [startX, startY];
      if (startY === endY || row + 0.5 < Math.min(startY, endY) || row + 0.5 >= Math.max(startY, endY)) return;
      cuts.push(startX + ((row + 0.5 - startY) / (endY - startY)) * (endX - startX));
    });
    cuts.sort((left, right) => left - right);
    for (let pair = 0; pair + 1 < cuts.length; pair += 2)
      for (let col = Math.round(cuts[pair] ?? 0); col < Math.round(cuts[pair + 1] ?? 0); col++)
        dot(sheet, col, row, ink);
  }
}

/** Land seen side on: each column inked from its height down to `floor`. */
export function land(sheet: Sheet, heights: readonly number[], ink: Ink, floor: number, left = 0): void {
  heights.forEach((height, col) => {
    for (let row = Math.round(height); row < floor; row++) dot(sheet, left + col, row, ink);
  });
}

/**
 * A height for each column: a broken line that wanders between `top`, its highest point, and `foot`, its lowest,
 * by midpoint displacement. A higher `rough` breaks it more.
 */
export function ridge(random: () => number, width: number, top: number, foot: number, rough = 0.55): number[] {
  let size = 1;
  while (size < width) size *= 2;
  const heights = new Array<number>(size + 1).fill(0);
  heights[0] = random();
  heights[size] = random();
  let sway = 1;
  for (let span = size; span > 1; span /= 2) {
    for (let place = span / 2; place < size; place += span)
      heights[place] =
        ((heights[place - span / 2] ?? 0) + (heights[place + span / 2] ?? 0)) / 2 + (random() - 0.5) * sway;
    sway *= rough;
  }
  const cut = heights.slice(0, width);
  const most = Math.max(...cut);
  const least = Math.min(...cut);
  return cut.map((value) => foot - ((value - least) / (most - least || 1)) * (foot - top));
}

/** A small picture typed as rows of letters, each letter a colour and `scale` cells square; a dot is clear. */
export function stamp(
  sheet: Sheet,
  rows: readonly string[],
  place: readonly [number, number],
  inks: Readonly<Record<string, Ink>>,
  scale = 1,
): void {
  rows.forEach((text, row) => {
    for (let col = 0; col < text.length; col++) {
      const ink = inks[text[col] ?? '.'];
      if (ink) box(sheet, place[0] + col * scale, place[1] + row * scale, scale, scale, ink);
    }
  });
}

/** One sheet laid over another: its clear cells leave what is under them. */
export function lay(sheet: Sheet, over: Sheet, x = 0, y = 0): void {
  for (let row = 0; row < over.height; row++)
    for (let col = 0; col < over.width; col++) {
      const ink = inkAt(over, col, row);
      if (ink) dot(sheet, x + col, y + row, ink);
    }
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, place) => {
  let value = place;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crcOf(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crcOf(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** The sheet as a paletted PNG, clear cells see-through. A sheet of more than 256 inks is a drawing mistake. */
export function pngOf(sheet: Sheet): Buffer {
  const inks = [...new Set(sheet.cells)].sort();
  if (inks.length > 256) throw new Error(`a picture holds ${inks.length} colours; 256 at most`);
  const index = new Map(inks.map((ink, place) => [ink, place]));
  const palette = Buffer.alloc(inks.length * 3);
  const covers = Buffer.alloc(inks.length);
  inks.forEach((ink, place) => {
    if (ink) palette.write(ink.slice(1), place * 3, 'hex');
    covers[place] = ink ? 255 : 0;
  });
  const rows = Buffer.alloc((sheet.width + 1) * sheet.height);
  sheet.cells.forEach((ink, place) => {
    const row = Math.floor(place / sheet.width);
    rows[row * (sheet.width + 1) + 1 + (place % sheet.width)] = index.get(ink) ?? 0;
  });
  const head = Buffer.alloc(13);
  head.writeUInt32BE(sheet.width, 0);
  head.writeUInt32BE(sheet.height, 4);
  head[8] = 8;
  head[9] = 3;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('PLTE', palette),
    chunk('tRNS', covers),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
