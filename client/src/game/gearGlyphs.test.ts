import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RARITIES, RESOURCE_COUNT } from '../player/gear.ts';
import { glyphSvg } from './gearGlyphs.ts';

/** Each pixel a glyph's picture fills: its column, its row and its colour. */
const pixelsOf = (svg: string) =>
  [...svg.matchAll(/x="(\d+)" y="(\d+)" width="1" height="1" fill="(#\w+)"/g)].map(([, x, y, fill]) => ({
    x: Number(x),
    y: Number(y),
    fill: fill ?? '',
  }));
const shapeOf = (svg: string) =>
  pixelsOf(svg)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

test('each glyph is twelve pixels square, a Vestige in its rarity’s colour', () => {
  for (const glyph of ['aurem', 'fruit', 'resource', 'vestige', 'empty', 'weapon-essence'] as const) {
    const svg = glyphSvg(glyph);
    assert.match(svg, /viewBox="0 0 12 12"/);
    for (const [, x, y] of svg.matchAll(/x="(\d+)" y="(\d+)"/g)) assert.ok(Number(x) < 12 && Number(y) < 12, glyph);
  }
  assert.ok(glyphSvg('vestige', 4).includes(RARITIES[4].colour), 'an Atheric Vestige is cyan');
});

test('each island’s resource is a picture of its own, inside the grid, mostly in a colour of its own', () => {
  const materials = Array.from({ length: RESOURCE_COUNT }, (unused, index) => glyphSvg('resource', 0, index));
  for (const svg of materials) {
    assert.match(svg, /viewBox="0 0 12 12"/);
    for (const { x, y } of pixelsOf(svg)) assert.ok(x < 12 && y < 12);
  }
  const shapes = materials.map(shapeOf);
  assert.ok(!shapes.includes(shapeOf(glyphSvg('empty'))), 'every one is drawn');
  assert.equal(new Set(shapes).size, RESOURCE_COUNT, 'no two are the same shape');
  const fills = materials.map((svg) => pixelsOf(svg).map(({ fill }) => fill));
  const outline = fills.reduce((common, each) => common.filter((fill) => each.includes(fill)));
  const mains = fills.map((each) => {
    const counts = new Map<string, number>();
    for (const fill of each) if (!outline.includes(fill)) counts.set(fill, (counts.get(fill) ?? 0) + 1);
    return [...counts].sort((first, second) => second[1] - first[1])[0]?.[0];
  });
  assert.equal(new Set(mains).size, RESOURCE_COUNT, 'no two are mostly the same colour');
  assert.equal(glyphSvg('resource', 0, RESOURCE_COUNT), glyphSvg('empty'), 'one past the list is an empty place');
});
