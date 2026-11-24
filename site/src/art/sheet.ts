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

// The 8 by 8 ordered pattern, built from the 2 by 2 one: a cell takes the second ink when the share asked for passes
// its threshold. Sixty-four steps make a sky's bands melt into each other rather than stripe.
const BAYER: readonly (readonly number[])[] = Array.from({ length: 8 }, (_row, y) =>
  Array.from({ length: 8 }, (_column, x) => {
    let value = 0;
    for (let bit = 0; bit < 3; bit++) {
      const across = (x >> bit) & 1;
      const down = (y >> bit) & 1;
      value |= ((across ^ down) << (5 - bit * 2)) | (down << (4 - bit * 2));
    }
    return value;
  }),
);

/** Whether the pattern picks the second ink at `x, y` for a share of 0..1. */
export const patternOn = (x: number, y: number, share: number): boolean =>
  share * 64 > (BAYER[y & 7]?.[x & 7] ?? 0) + 0.5;

export function dot(sheet: Sheet, x: number, y: number, ink: Ink): void {
  const column = Math.round(x);
  const row = Math.round(y);
  if (column < 0 || row < 0 || column >= sheet.width || row >= sheet.height) return;
  sheet.cells[row * sheet.width + column] = ink;
}

export function inkAt(sheet: Sheet, x: number, y: number): Ink {
  if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return '';
  return sheet.cells[y * sheet.width + x] ?? '';
}

export function box(sheet: Sheet, x: number, y: number, width: number, height: number, ink: Ink): void {
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) dot(sheet, x + column, y + row, ink);
}

/** Bands of colour top to bottom, each dithered into the next: a sky or a stretch of water. */
export function fade(sheet: Sheet, top: number, height: number, inks: readonly Ink[]): void {
  const bands = inks.length - 1;
  for (let row = 0; row < height; row++) {
    const along = (row / Math.max(1, height - 1)) * bands;
    const band = Math.min(bands - 1, Math.floor(along));
    for (let column = 0; column < sheet.width; column++) {
      const ink = patternOn(column, top + row, along - band) ? inks[band + 1] : inks[band];
      dot(sheet, column, top + row, ink ?? '');
    }
  }
}

/** A filled oval. */
export function disc(sheet: Sheet, centreX: number, centreY: number, wide: number, tall: number, ink: Ink): void {
  for (let row = Math.floor(-tall); row <= Math.ceil(tall); row++)
    for (let column = Math.floor(-wide); column <= Math.ceil(wide); column++)
      if ((column * column) / (wide * wide) + (row * row) / (tall * tall) <= 1)
        dot(sheet, centreX + column, centreY + row, ink);
}

/** Light falling off round a point, dithered: near the middle most cells take the ink, at `reach` none. */
export function glow(sheet: Sheet, centreX: number, centreY: number, reach: number, ink: Ink, strength = 0.6): void {
  for (let row = -reach; row <= reach; row++)
    for (let column = -reach; column <= reach; column++) {
      const away = Math.hypot(column, row) / reach;
      if (away < 1 && patternOn(centreX + column, centreY + row, strength * (1 - away) ** 2))
        dot(sheet, centreX + column, centreY + row, ink);
    }
}

/** Light in rings round a point, DFO's way: each ink a ring nearer the middle, dithered into the one outside it. */
export function halo(sheet: Sheet, centreX: number, centreY: number, reach: number, inks: readonly Ink[]): void {
  inks.forEach((ink, ring) => {
    const outer = reach * (1 - ring / inks.length);
    const inner = reach * (1 - (ring + 1) / inks.length);
    for (let row = -Math.ceil(outer); row <= outer; row++)
      for (let column = -Math.ceil(outer); column <= outer; column++) {
        const away = Math.hypot(column, row);
        if (away > outer) continue;
        const share = away <= inner ? 1 : (outer - away) / (outer - inner);
        if (patternOn(centreX + column, centreY + row, share)) dot(sheet, centreX + column, centreY + row, ink);
      }
  });
}

/** Light that only falls on cells already inked, so a lit wall stays inside its wall. */
export function lightOn(sheet: Sheet, centreX: number, centreY: number, reach: number, ink: Ink, strength = 0.6): void {
  for (let row = -reach; row <= reach; row++)
    for (let column = -reach; column <= reach; column++) {
      const away = Math.hypot(column, row) / reach;
      const x = centreX + column;
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
      for (let column = Math.round(cuts[pair] ?? 0); column < Math.round(cuts[pair + 1] ?? 0); column++)
        dot(sheet, column, row, ink);
  }
}

/** Land seen side on: each column inked from its height down to `floor`. */
export function land(sheet: Sheet, heights: readonly number[], ink: Ink, floor: number, left = 0): void {
  heights.forEach((height, column) => {
    for (let row = Math.round(height); row < floor; row++) dot(sheet, left + column, row, ink);
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
    for (let column = 0; column < text.length; column++) {
      const ink = inks[text[column] ?? '.'];
      if (ink) box(sheet, place[0] + column * scale, place[1] + row * scale, scale, scale, ink);
    }
  });
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
