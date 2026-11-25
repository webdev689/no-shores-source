import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RESOURCE_COUNT } from '../player/gear.ts';
import { glyphSvg, growthSvg, nodeGlyphSvg } from './gearGlyphs.ts';

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
  assert.match(glyphSvg('vestige', 4, 0, 24), /viewBox="0 0 12 12"/, "at a mark's 24, a crystal of 12, twice over");
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

test("a locked node's growth is a square band round its edge, lit clockwise from its top's middle as far as it has grown", () => {
  const lit = (svg: string) => [...svg.matchAll(/x="(\d+)" y="(\d+)" width="1" height="1" fill="currentColor"/g)];
  const cells = (svg: string) => [...svg.matchAll(/x="(\d+)" y="(\d+)" width="1" height="1"/g)];
  const whole = growthSvg(1, '#000');
  const band = (cell: number) => cell <= 2 || cell >= 17;
  assert.equal(cells(whole).length, 18 * 18 - 14 * 14, 'a band two cells deep round a square 18 a side');
  for (const [, x, y] of cells(whole)) assert.ok(band(Number(x)) || band(Number(y)), `(${x}, ${y}) stands on the band`);
  assert.equal(lit(growthSvg(0, '#000')).length, 0);
  assert.equal(lit(whole).length, cells(whole).length);
  const quarter = lit(growthSvg(0.25, '#000')).map(([, x, y]) => [Number(x), Number(y)]);
  assert.ok(quarter.length > 20 && quarter.length < 40, `about a quarter round (${quarter.length})`);
  assert.ok(
    quarter.every(([x, y]) => (x ?? 0) >= 9 && (y ?? 0) <= 10),
    'the top right, from the middle of its top',
  );
});

test("no node's glyph is round: an Atheric's own is a square heart with square rays, nothing of a sun's ring", () => {
  const cells = new Set([...nodeGlyphSvg(4).matchAll(/x="(\d+)" y="(\d+)"/g)].map(([, x, y]) => `${x},${y}`));
  for (const x of [4, 5, 6, 7]) for (const y of [4, 5, 6, 7]) assert.ok(cells.has(`${x},${y}`), 'its square heart');
  for (const [x, y] of [
    [1, 2],
    [2, 3],
    [9, 2],
    [10, 3],
    [1, 8],
    [2, 9],
    [9, 8],
    [10, 9],
  ])
    assert.ok(cells.has(`${x},${y}`), `a square ray's cell (${x}, ${y})`);
  for (const [x, y] of [
    [4, 3],
    [7, 3],
    [3, 5],
    [8, 6],
    [4, 8],
  ])
    assert.ok(!cells.has(`${x},${y}`), `no rounded shoulder at (${x}, ${y})`);
});
