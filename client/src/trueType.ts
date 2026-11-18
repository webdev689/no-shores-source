/**
 * A TrueType font made from outlines of straight lines only, for a face drawn in code on a pixel grid. It writes the
 * tables a browser asks of a font and nothing more: no hinting, no kerning, no names past the family's.
 */

/** A point in font units. */
export type Point = readonly [number, number];

/** A glyph: its code point, its outline as closed contours (clockwise, as TrueType fills them), and how far the pen
 *  moves after it. */
export interface Outline {
  readonly code: number;
  readonly contours: readonly (readonly Point[])[];
  readonly advance: number;
}

/** The face's vertical measures, in font units. */
export interface Measures {
  readonly ascent: number;
  readonly descent: number;
  readonly winAscent: number;
  readonly winDescent: number;
  readonly capHeight: number;
  readonly xHeight: number;
  readonly weight: number;
}

const UNITS_PER_EM = 1000;
/** A fixed date in the font's own reckoning, so the same drawing always makes the same bytes. */
const MADE = 3_876_000_000;
/** What every font's words sum to once its head is set right. */
const WHOLE_SUM = 0xb1b0afba;

class Bytes {
  readonly list: number[] = [];
  byte(value: number): this {
    this.list.push(value & 0xff);
    return this;
  }
  u16(value: number): this {
    return this.byte(value >> 8).byte(value);
  }
  u32(value: number): this {
    return this.u16(value >>> 16).u16(value & 0xffff);
  }
  all(values: Iterable<number>): this {
    for (const value of values) this.byte(value);
    return this;
  }
  /** Zeros to the next whole word. */
  pad(): this {
    while (this.list.length % 4 !== 0) this.byte(0);
    return this;
  }
}

/** The sum of a table's big-endian words, as TrueType checks it. */
export function wordSum(bytes: readonly number[]): number {
  let sum = 0;
  for (let word = 0; word < bytes.length; word += 4)
    sum =
      (sum +
        ((bytes[word] ?? 0) << 24) +
        ((bytes[word + 1] ?? 0) << 16) +
        ((bytes[word + 2] ?? 0) << 8) +
        (bytes[word + 3] ?? 0)) >>>
      0;
  return sum;
}

const log2 = (value: number) => Math.floor(Math.log2(value));

function glyphData(outline: Outline | null): {
  bytes: number[];
  box: [number, number, number, number];
  points: number;
} {
  const points = outline?.contours.flat() ?? [];
  if (!outline || points.length === 0) return { bytes: [], box: [0, 0, 0, 0], points: 0 };
  const lefts = points.map(([x]) => x);
  const heights = points.map(([, y]) => y);
  const box: [number, number, number, number] = [
    Math.min(...lefts),
    Math.min(...heights),
    Math.max(...lefts),
    Math.max(...heights),
  ];
  const out = new Bytes().u16(outline.contours.length);
  for (const edge of box) out.u16(edge);
  let ends = -1;
  for (const contour of outline.contours) out.u16((ends += contour.length));
  // No instructions; every point on the curve, its x and y each a whole 16-bit step from the last.
  out.u16(0).all(points.map(() => 0x01));
  points.forEach(([across], index) => out.u16(across - (points[index - 1]?.[0] ?? 0)));
  points.forEach(([, up], index) => out.u16(up - (points[index - 1]?.[1] ?? 0)));
  return { bytes: out.pad().list, box, points: points.length };
}

function nameTable(family: string): number[] {
  const names: [number, string][] = [
    [1, family],
    [2, 'Regular'],
    [3, `${family} Regular`],
    [4, family],
    [6, `${family.replace(/\s+/g, '')}-Regular`],
  ];
  const head = new Bytes()
    .u16(0)
    .u16(names.length)
    .u16(6 + 12 * names.length);
  const strings = new Bytes();
  for (const [id, text] of names) {
    const units = [...text].map((char) => char.charCodeAt(0));
    head
      .u16(3)
      .u16(1)
      .u16(0x0409)
      .u16(id)
      .u16(units.length * 2)
      .u16(strings.list.length);
    for (const unit of units) strings.u16(unit);
  }
  return [...head.list, ...strings.list];
}

function cmapTable(codes: readonly number[]): number[] {
  // Each code its own segment, then the one that ends every table.
  const segments = [...codes.map((code, index) => ({ code, glyph: index + 1 })), { code: 0xffff, glyph: 0 }];
  const count = segments.length;
  const range = 2 * 2 ** log2(count);
  const table = new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12);
  table
    .u16(4)
    .u16(16 + 8 * count)
    .u16(0)
    .u16(count * 2)
    .u16(range)
    .u16(log2(count))
    .u16(count * 2 - range);
  for (const { code } of segments) table.u16(code);
  table.u16(0);
  for (const { code } of segments) table.u16(code);
  for (const { code, glyph } of segments) table.u16(code === 0xffff ? 1 : (glyph - code) & 0xffff);
  segments.forEach(() => table.u16(0));
  return table.list;
}

/** The font file of `family`: an empty glyph for what it lacks, then each outline, mapped from its code point. */
export function trueType(family: string, measures: Measures, outlines: readonly Outline[]): Uint8Array {
  const glyphs = [null, ...[...outlines].sort((one, other) => one.code - other.code)];
  const drawn = glyphs.map(glyphData);
  const codes = glyphs.flatMap((glyph) => (glyph ? [glyph.code] : []));
  const advances = glyphs.map((glyph) => glyph?.advance ?? 500);
  const boxes = drawn.filter((glyph) => glyph.points > 0).map((glyph) => glyph.box);
  const [xMin, yMin, xMax, yMax] = [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
  const glyf: number[] = [];
  const loca = new Bytes();
  for (const glyph of drawn) {
    loca.u32(glyf.length);
    glyf.push(...glyph.bytes);
  }
  loca.u32(glyf.length);
  const head = new Bytes().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(3).u16(UNITS_PER_EM);
  head.u32(0).u32(MADE).u32(0).u32(MADE);
  head.u16(xMin).u16(yMin).u16(xMax).u16(yMax).u16(0).u16(6).u16(2).u16(1).u16(0);
  const hhea = new Bytes().u32(0x00010000).u16(measures.ascent).u16(-measures.descent).u16(0);
  // The side bearings' least are of the glyphs with ink, as the spec has them: an empty glyph has none.
  const inked = drawn.flatMap((glyph, index) => (glyph.points > 0 ? [[glyph, advances[index] ?? 0] as const] : []));
  hhea.u16(Math.max(...advances)).u16(Math.min(...inked.map(([glyph]) => glyph.box[0])));
  hhea.u16(Math.min(...inked.map(([glyph, advance]) => advance - glyph.box[2]))).u16(xMax);
  hhea.u16(1).u16(0).u16(0).u32(0).u32(0).u16(0).u16(glyphs.length);
  const maxp = new Bytes().u32(0x00010000).u16(glyphs.length);
  maxp.u16(Math.max(...drawn.map((glyph) => glyph.points)));
  maxp.u16(Math.max(...glyphs.map((glyph) => glyph?.contours.length ?? 0)));
  maxp.u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const os2 = new Bytes().u16(4).u16(Math.round(advances.reduce((sum, each) => sum + each, 0) / advances.length));
  os2.u16(measures.weight).u16(5).u16(0);
  os2.u16(650).u16(600).u16(0).u16(75).u16(650).u16(600).u16(0).u16(350).u16(50).u16(300).u16(0);
  os2
    .all(Array(10).fill(0))
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .all([...'NONE'].map((char) => char.charCodeAt(0)));
  os2
    .u16(0x0040)
    .u16(Math.min(...codes))
    .u16(Math.max(...codes));
  os2.u16(measures.ascent).u16(-measures.descent).u16(0).u16(measures.winAscent).u16(measures.winDescent);
  os2.u32(1).u32(0).u16(measures.xHeight).u16(measures.capHeight).u16(0).u16(32).u16(0);
  const hmtx = new Bytes();
  drawn.forEach((glyph, index) => hmtx.u16(advances[index] ?? 0).u16(glyph.box[0]));
  const post = new Bytes().u32(0x00030000).u32(0).u16(-75).u16(50).u32(0).u32(0).u32(0).u32(0).u32(0);
  const tables: [string, number[]][] = [
    ['OS/2', os2.list],
    ['cmap', cmapTable(codes)],
    ['glyf', glyf],
    ['head', head.list],
    ['hhea', hhea.list],
    ['hmtx', hmtx.list],
    ['loca', loca.list],
    ['maxp', maxp.list],
    ['name', nameTable(family)],
    ['post', post.list],
  ];
  const font = new Bytes().u32(0x00010000).u16(tables.length);
  const range = 16 * 2 ** log2(tables.length);
  font
    .u16(range)
    .u16(log2(tables.length))
    .u16(tables.length * 16 - range);
  let offset = 12 + 16 * tables.length;
  const body = new Bytes();
  let headAt = 0;
  for (const [tag, data] of tables) {
    if (tag === 'head') headAt = offset;
    font
      .all([...tag].map((char) => char.charCodeAt(0)))
      .u32(wordSum(data))
      .u32(offset)
      .u32(data.length);
    body.all(data).pad();
    offset = 12 + 16 * tables.length + body.list.length;
  }
  const bytes = [...font.list, ...body.list];
  const adjust = (WHOLE_SUM - wordSum(bytes)) >>> 0;
  bytes.splice(headAt + 8, 4, adjust >>> 24, (adjust >>> 16) & 0xff, (adjust >>> 8) & 0xff, adjust & 0xff);
  return Uint8Array.from(bytes);
}
