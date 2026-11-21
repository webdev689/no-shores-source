import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MENDED_RANGE, mendedFont, outlineOf } from './face.ts';
import { wordSum } from './trueType.ts';

const font = mendedFont();
const view = new DataView(font.buffer);
const tables = new Map<string, { offset: number; length: number; sum: number }>();
for (let index = 0; index < view.getUint16(4); index++) {
  const entry = 12 + 16 * index;
  const tag = String.fromCharCode(...font.subarray(entry, entry + 4));
  tables.set(tag, {
    sum: view.getUint32(entry + 4),
    offset: view.getUint32(entry + 8),
    length: view.getUint32(entry + 12),
  });
}

/** The glyph a code point maps to, read from the font's own cmap as a browser reads it. */
function glyphOf(code: number): number {
  const cmap = tables.get('cmap');
  assert.ok(cmap);
  const sub = cmap.offset + view.getUint32(cmap.offset + 8);
  const count = view.getUint16(sub + 6) / 2;
  for (let segment = 0; segment < count; segment++) {
    const end = view.getUint16(sub + 14 + 2 * segment);
    const start = view.getUint16(sub + 16 + 2 * count + 2 * segment);
    if (code >= start && code <= end) return (code + view.getUint16(sub + 16 + 4 * count + 2 * segment)) & 0xffff;
  }
  return 0;
}

test('the mended face is a whole TrueType font: every table where it says, each and the whole summing true', () => {
  assert.equal(view.getUint32(0), 0x00010000);
  const tags = [...tables.keys()];
  assert.deepEqual(tags, [...tags].sort());
  for (const tag of ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']) {
    const table = tables.get(tag);
    assert.ok(table, tag);
    const bytes = [...font.subarray(table.offset, table.offset + table.length)];
    // The head's own sum is taken with its adjustment as zero.
    if (tag === 'head') bytes.splice(8, 4, 0, 0, 0, 0);
    assert.equal(wordSum(bytes), table.sum, tag);
  }
  assert.equal(wordSum([...font]), 0xb1b0afba);
  const hhea = tables.get('hhea');
  assert.ok(hhea);
  assert.equal(
    view.getInt16(hhea.offset + 12),
    -30,
    "the least left bearing is of a glyph with ink, a column left of the first: Pixelify's own hyphen",
  );
  assert.ok(view.getInt16(hhea.offset + 14) < 100, 'the least right bearing, the empty glyph not counted');
});

test('every code point the face claims maps to a glyph drawn on the grid', () => {
  const codes = MENDED_RANGE.split(', ').map((each) => Number.parseInt(each.slice(2), 16));
  assert.ok(codes.length >= 14);
  const loca = tables.get('loca');
  assert.ok(loca);
  for (const code of codes) {
    const glyph = glyphOf(code);
    assert.ok(glyph > 0, `U+${code.toString(16)}`);
    const length = view.getUint32(loca.offset + 4 * (glyph + 1)) - view.getUint32(loca.offset + 4 * glyph);
    assert.ok(length > 0, `U+${code.toString(16)} is drawn`);
  }
  assert.equal(glyphOf(0x41), 0, 'Pixelify keeps its own A');
});

test('the mended 2 and Z stand apart, and the 5 and the B are drawn whole', () => {
  const cells = (char: string) => new Set(outlineOf(char).contours.map((contour) => contour.join(' ')));
  const two = cells('2');
  const zed = cells('Z');
  assert.ok([...two].filter((each) => !zed.has(each)).length >= 6);
  for (const char of ['5', 'B', 'Z', '2']) {
    const { contours, advance } = outlineOf(char);
    const heights = contours.flat().map(([, y]) => y);
    assert.equal(Math.min(...heights), -12, `${char} stands on the baseline`);
    assert.equal(Math.max(...heights), 633, `${char} reaches the cap height`);
    assert.equal(advance, 592);
  }
});
