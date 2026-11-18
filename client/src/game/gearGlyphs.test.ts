import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RARITIES } from '../player/gear.ts';
import { glyphSvg } from './gearGlyphs.ts';

test('each glyph is twelve pixels square, a Vestige in its rarity’s colour', () => {
  for (const glyph of ['aurem', 'fruit', 'resource', 'vestige', 'empty', 'weapon-essence'] as const) {
    const svg = glyphSvg(glyph);
    assert.match(svg, /viewBox="0 0 12 12"/);
    for (const [, x, y] of svg.matchAll(/x="(\d+)" y="(\d+)"/g)) assert.ok(Number(x) < 12 && Number(y) < 12, glyph);
  }
  assert.ok(glyphSvg('vestige', 4).includes(RARITIES[4].colour), 'an Atheric Vestige is cyan');
  assert.notEqual(glyphSvg('resource', 0, 0), glyphSvg('resource', 0, 3), 'each island’s resource its own colour');
});
