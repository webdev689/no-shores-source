import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESOURCE_COUNT } from '../player/gear.ts';
import { glyphSvg } from './gearGlyphs.ts';

/** Each pixel a glyph's picture fills: its column, its row and its colour, each run along a row unpacked. */
const pixelsOf = (svg: string) =>
  [...svg.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#\w+)"/g)].flatMap(([, x, y, width, fill]) =>
    Array.from({ length: Number(width) }, (unused, step) => ({ x: Number(x) + step, y: Number(y), fill: fill ?? '' })),
  );
const shapeOf = (svg: string) =>
  pixelsOf(svg)
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');

test('each drawn glyph is twelve pixels square, a Vestige its crystal, 18, in its rarity’s colour', () => {
  for (const glyph of ['aurem', 'fruit', 'empty', 'weapon-essence'] as const) {
    const svg = glyphSvg(glyph);
    assert.match(svg, /viewBox="0 0 12 12"/);
    for (const [, x, y] of svg.matchAll(/x="(\d+)" y="(\d+)"/g)) assert.ok(Number(x) < 12 && Number(y) < 12, glyph);
  }
  const mostly = (rarity: number) => {
    const solid = pixelsOf(glyphSvg('vestige', rarity)).filter(({ fill }) => fill.length === 7);
    const counts = new Map<string, number>();
    for (const { fill } of solid) counts.set(fill, (counts.get(fill) ?? 0) + 1);
    const [top = ''] = [...counts].sort((first, second) => second[1] - first[1])[0] ?? [];
    return [1, 3, 5].map((start) => Number.parseInt(top.slice(start, start + 2), 16));
  };
  assert.match(glyphSvg('vestige', 4), /viewBox="0 0 18 18"/);
  const [red = 0, green = 0, blue = 0] = mostly(4);
  assert.ok(blue > red && green > red, 'an Atheric Vestige is cyan blue');
  const [magicRed = 0, magicGreen = 0, magicBlue = 0] = mostly(1);
  assert.ok(magicGreen > magicRed && magicGreen > magicBlue, 'a Magic one green');
  assert.ok(
    pixelsOf(glyphSvg('vestige', 0)).some(({ fill }) => fill.length === 9),
    'its halo see-through',
  );
});

test('an Ammo box and an Ammo crate are baked pictures of their own, 18 pixels square', () => {
  const [box, crate] = [glyphSvg('ammo-box'), glyphSvg('ammo-crate')];
  for (const svg of [box, crate]) {
    assert.match(svg, /viewBox="0 0 18 18"/);
    assert.ok(pixelsOf(svg).length > 60, 'mostly filled');
  }
  assert.notEqual(shapeOf(box), shapeOf(crate));
});

test('each island’s resource is a baked picture of its own, 18 pixels square, mostly in a colour of its own', () => {
  const materials = Array.from({ length: RESOURCE_COUNT }, (unused, index) => glyphSvg('resource', 0, index));
  for (const svg of materials) {
    assert.match(svg, /viewBox="0 0 18 18"/);
    for (const { x, y } of pixelsOf(svg)) assert.ok(x < 18 && y < 18);
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
