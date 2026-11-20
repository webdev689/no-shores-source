import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_GLYPHS, SHIP_MAPS, SHIP_PALETTES } from './shipGlyphs.ts';

const LETTERS = 'abcdefgh';

test('each ship glyph is twelve pixels square, drawn only in its palette, and no two alike', () => {
  for (const glyph of SHIP_GLYPHS) {
    const map = SHIP_MAPS[glyph];
    assert.equal(map.length, 12, glyph);
    const allowed = new Set(['.', ...LETTERS.slice(0, SHIP_PALETTES[glyph].length)]);
    for (const row of map) {
      assert.equal(row.length, 12, glyph);
      assert.ok(
        [...row].every((pixel) => allowed.has(pixel)),
        `${glyph}: ${row}`,
      );
    }
  }
  assert.equal(new Set(SHIP_GLYPHS.map((glyph) => SHIP_MAPS[glyph].join(''))).size, SHIP_GLYPHS.length);
});

test('the rigging is a block on its hook with two falls of line, not a ring: wood, iron and line all drawn', () => {
  const pixels = SHIP_MAPS.rigging.join('');
  for (const part of ['b', 'd', 'e']) assert.ok(pixels.includes(part), `part ${part} drawn`);
  const falls = SHIP_MAPS.rigging
    .slice(9)
    .map((row) => [...row].filter((pixel) => pixel === 'b' || pixel === 'c').length);
  assert.deepEqual(falls, [2, 2, 2], 'two falls of line run down from the block');
});
