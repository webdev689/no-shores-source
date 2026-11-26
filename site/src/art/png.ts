// The website's pictures written as paletted PNGs at build time, from the sheet they are drawn on.
import { deflateSync } from 'node:zlib';
import type { Sheet } from '../../../client/src/art/sheet.ts';

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
