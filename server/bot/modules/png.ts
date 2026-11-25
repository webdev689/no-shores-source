// PNG in the Worker with no canvas: read into four bytes a pixel (the avatar a welcome card draws) and written from
// them (the card itself). The reader takes eight bits a sample, not interlaced, in any of PNG's five colour types
// (with a palette's transparency); anything else is refused, and the card draws the member's initial instead.

/** A picture as four bytes a pixel, red, green, blue and alpha, row by row. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** The most pixels a picture may hold before it is refused, so a hostile file cannot fill the Worker's memory. */
export const PNG_PIXELS_MAX = 1024 * 1024;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes run through a (de)compression stream, stopped past `max` bytes out; null past it. */
async function streamed(
  bytes: Uint8Array<ArrayBuffer>,
  through: CompressionStream | DecompressionStream,
  max: number,
): Promise<Uint8Array | null> {
  const reader = new Blob([bytes]).stream().pipeThrough(through).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.length;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(chunk.value);
  }
  const out = new Uint8Array(size);
  parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0);
  return out;
}

/** The samples a pixel holds, by colour type. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** The filter a row was written with, undone in place (PNG's five: none, left, up, average, Paeth). */
function unfilter(filter: number, rows: Uint8Array, row: Uint8Array, start: number, stride: number, per: number) {
  for (let index = 0; index < stride; index++) {
    const spot = start + index;
    const left = index >= per ? (rows[spot - per] ?? 0) : 0;
    const up = start > 0 ? (rows[spot - stride] ?? 0) : 0;
    const corner = index >= per && start > 0 ? (rows[spot - stride - per] ?? 0) : 0;
    let guess = 0;
    if (filter === 1) guess = left;
    else if (filter === 2) guess = up;
    else if (filter === 3) guess = (left + up) >> 1;
    else if (filter === 4) {
      const estimate = left + up - corner;
      const toLeft = Math.abs(estimate - left);
      const toUp = Math.abs(estimate - up);
      const toCorner = Math.abs(estimate - corner);
      guess = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
    } else if (filter !== 0) return false;
    rows[spot] = ((row[index] ?? 0) + guess) & 255;
  }
  return true;
}

/** A PNG's pixels, or null for one this does not read. */
export async function decodePng(bytes: Uint8Array): Promise<Picture | null> {
  if (bytes.length < 33 || SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let spot = 8;
  let width = 0;
  let height = 0;
  let type = -1;
  let palette: Uint8Array | null = null;
  let alphas: Uint8Array | null = null;
  const data: Uint8Array[] = [];
  while (spot + 8 <= bytes.length) {
    const size = view.getUint32(spot);
    const kind = String.fromCharCode(...bytes.subarray(spot + 4, spot + 8));
    const body = bytes.subarray(spot + 8, spot + 8 + size);
    if (body.length !== size) return null;
    if (kind === 'IHDR') {
      width = view.getUint32(spot + 8);
      height = view.getUint32(spot + 12);
      type = body[9] ?? -1;
      if (body[8] !== 8 || body[12] !== 0 || !(type in CHANNELS)) return null;
      if (!width || !height || width * height > PNG_PIXELS_MAX) return null;
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') alphas = body;
    else if (kind === 'IDAT') data.push(body);
    else if (kind === 'IEND') break;
    spot += 12 + size;
  }
  if (type < 0 || !data.length || (type === 3 && !palette)) return null;
  const joined = new Uint8Array(data.reduce((total, part) => total + part.length, 0));
  data.reduce((offset, part) => (joined.set(part, offset), offset + part.length), 0);
  const per = CHANNELS[type] ?? 1;
  const stride = width * per;
  // a small file may inflate to gigabytes: it is stopped at the size its header promised
  const raw = await streamed(joined, new DecompressionStream('deflate'), height * (stride + 1)).catch(() => null);
  if (!raw || raw.length < height * (stride + 1)) return null;
  const rows = new Uint8Array(height * stride);
  for (let line = 0; line < height; line++) {
    const from = line * (stride + 1);
    if (!unfilter(raw[from] ?? 0, rows, raw.subarray(from + 1, from + 1 + stride), line * stride, stride, per))
      return null;
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const source = pixel * per;
    const sample = (offset: number) => rows[source + offset] ?? 0;
    if (type === 6) pixels.set(rows.subarray(source, source + 4), pixel * 4);
    else if (type === 2) pixels.set([sample(0), sample(1), sample(2), 255], pixel * 4);
    else if (type === 0) pixels.set([sample(0), sample(0), sample(0), 255], pixel * 4);
    else if (type === 4) pixels.set([sample(0), sample(0), sample(0), sample(1)], pixel * 4);
    else {
      const index = sample(0);
      const colours = palette ?? new Uint8Array(0);
      const rgb = [colours[index * 3] ?? 0, colours[index * 3 + 1] ?? 0, colours[index * 3 + 2] ?? 0];
      pixels.set([...rgb, alphas?.[index] ?? 255], pixel * 4);
    }
  }
  return { width, height, data: pixels };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) value = (CRC_TABLE[(value ^ byte) & 255] ?? 0) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

/** One PNG chunk: its length, its kind, its body and the check over kind and body. */
function chunk(kind: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(kind), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** A picture as PNG bytes: eight-bit colour with alpha, each row unfiltered, deflated by the platform. */
export async function encodePng(picture: Picture): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height, data } = picture;
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let line = 0; line < height; line++)
    raw.set(data.subarray(line * width * 4, (line + 1) * width * 4), line * (width * 4 + 1) + 1);
  const packed = (await streamed(raw, new CompressionStream('deflate'), raw.length * 2)) ?? new Uint8Array(0);
  const parts = [
    new Uint8Array(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', packed),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0);
  return out;
}
