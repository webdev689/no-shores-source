import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLYPH_LETTERS, glyphSvg } from './gearGlyphs.ts';
import { SHIP_GLYPHS, SHIP_GLYPH_CELLS, SHIP_MAPS, SHIP_PALETTES } from './shipGlyphs.ts';

test('each ship glyph is 24 cells square, drawn only in its palette, and no two alike', () => {
  for (const glyph of SHIP_GLYPHS) {
    const map = SHIP_MAPS[glyph];
    assert.equal(map.length, SHIP_GLYPH_CELLS, glyph);
    const palette = SHIP_PALETTES[glyph];
    assert.ok(palette.length <= GLYPH_LETTERS.length, `${glyph}: a letter for each colour`);
    const allowed = new Set(['.', ...GLYPH_LETTERS.slice(0, palette.length)]);
    for (const row of map) {
      assert.equal(row.length, SHIP_GLYPH_CELLS, glyph);
      assert.ok(
        [...row].every((pixel) => allowed.has(pixel)),
        `${glyph}: ${row}`,
      );
    }
  }
  assert.equal(new Set(SHIP_GLYPHS.map((glyph) => SHIP_MAPS[glyph].join(''))).size, SHIP_GLYPHS.length);
});

test('a ship glyph is a picture, not a sign: most of its tones are drawn, and its outline goes round it', () => {
  for (const glyph of SHIP_GLYPHS) {
    const drawn = SHIP_MAPS[glyph].join('');
    const tones = new Set(drawn.replaceAll('.', ''));
    assert.ok(tones.size >= 5, `${glyph} is shaded in ${tones.size} tones`);
    assert.ok(tones.size >= SHIP_PALETTES[glyph].length - 1, `${glyph} draws its palette`);
    assert.ok(drawn.replaceAll('.', '').length >= 120, `${glyph} fills its cells`);
    assert.ok(drawn.includes('a'), `${glyph} is outlined`);
  }
});

test('a ship glyph draws as an SVG as large as its map, every run of a tone in its colour', () => {
  const svg = glyphSvg('hull');
  assert.match(svg, /viewBox="0 0 24 24"/);
  const runs = [...svg.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#\w+)"/g)];
  const cells = runs.reduce((sum, [, , , width]) => sum + Number(width), 0);
  assert.equal(cells, SHIP_MAPS.hull.join('').replaceAll('.', '').length, 'every drawn cell, once');
  for (const [, , , , fill] of runs) assert.ok(SHIP_PALETTES.hull.includes(fill ?? ''), fill);
});

test('the rigging is shrouds with ratlines across them, not a ring: rows crossed by a run of one tone', () => {
  const rungs = SHIP_MAPS.rigging.filter((row) => /([b-l])\1{4,}/.test(row)).length;
  assert.ok(rungs >= 3, `ratlines rigged across: ${rungs}`);
});
