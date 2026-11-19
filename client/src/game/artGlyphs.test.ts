import assert from 'node:assert/strict';
import { test } from 'node:test';
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { FRAGMENT_MAPS } from './artFragments.ts';
import { EMBLEM_MAPS, PALETTE_LETTERS, SPELL_MAPS, artPalette, mapSvg } from '../player/artGlyphs.ts';

const ALL = { ...EMBLEM_MAPS, ...SPELL_MAPS, ...FRAGMENT_MAPS };

test('every map is a rectangle drawn only in its palette’s letters', () => {
  for (const [key, rows] of Object.entries(ALL)) {
    assert.ok(rows.length > 0, key);
    for (const row of rows) {
      assert.equal(row.length, rows[0]?.length, `${key} is rectangular`);
      for (const letter of row) assert.ok(letter === '.' || PALETTE_LETTERS.includes(letter), `${key}: ${letter}`);
    }
  }
});

test('each Art has its emblem, three spells and six fragments drawn, at their sizes', () => {
  for (const art of arts.arts) {
    const square = (rows: readonly string[] | undefined, side: number, what: string) => {
      assert.equal(rows?.length, side, what);
      assert.equal(rows?.[0]?.length, side, what);
    };
    square(EMBLEM_MAPS[art.key], 24, `${art.name}'s emblem`);
    square(SPELL_MAPS[art.anima.key], 24, art.anima.name);
    assert.equal(art.tenets.length, 2);
    for (const tenet of art.tenets) square(SPELL_MAPS[tenet.key], 12, tenet.name);
    assert.equal(art.core.length, 6);
    for (const fragment of art.core) square(FRAGMENT_MAPS[fragment.key], 12, fragment.name);
  }
  const drawn = arts.arts.flatMap((art) => [art.anima, ...art.tenets, ...art.core].map((each) => each.key));
  assert.equal(Object.keys(SPELL_MAPS).length + Object.keys(FRAGMENT_MAPS).length, drawn.length, 'nothing extra');
});

test('no two of an Art’s pictures are the same', () => {
  const shapes = Object.values(ALL).map((rows) => rows.join('/'));
  assert.equal(new Set(shapes).size, shapes.length);
});

test('a map is drawn in its Art’s element, its outline the element glyph’s own', () => {
  for (const art of arts.arts) {
    const palette = artPalette(art.element);
    assert.equal(palette.length, PALETTE_LETTERS.length);
    const svg = mapSvg(EMBLEM_MAPS[art.key], art.element);
    assert.match(svg, /viewBox="0 0 24 24"/);
    const fills = new Set([...svg.matchAll(/fill="(#\w+)"/g)].map(([, fill]) => fill));
    for (const fill of fills) assert.ok(palette.includes(fill ?? ''), `${art.name}: ${fill}`);
    assert.ok(fills.has(palette[2] ?? ''), `${art.name} shows its body colour`);
  }
  assert.equal(mapSvg(undefined, 2), '');
  assert.equal(mapSvg(['ab'], 0), '', 'no element, no picture');
});
