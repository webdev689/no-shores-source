import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMBLEM_FACTIONS, EMBLEM_PIXELS, emblemSvg, markPicture } from './emblems.ts';
import { pixelsOf } from './pixelsForTests.ts';
import { TONES } from './tones.ts';

const STONE: readonly string[] = [TONES.stoneHi, TONES.stoneLit, TONES.stoneMid];
const BRASS: readonly string[] = [TONES.brassHi, TONES.brassLo];
const PALETTE = new Set<string>(Object.values(TONES));

test('the Grey Tithe wears its emblem in grey stone, and others none', () => {
  assert.deepEqual(EMBLEM_FACTIONS, [1]);
  const tithe = pixelsOf(emblemSvg(1) ?? '');
  assert.ok(
    [...tithe.pixels.values()].every((tone) => STONE.includes(tone)),
    'the Tithe in stone alone',
  );
  assert.equal(emblemSvg(0), null, 'a player’s ship or a friendly one, faction 0, wears none');
  assert.equal(emblemSvg(2), null, 'no faction of that number');
  assert.equal(emblemSvg(9), null);
});

test('each emblem is a square of whole pixels in the kit’s palette, drawn sharp', () => {
  for (const faction of EMBLEM_FACTIONS) {
    const { width, height, pixels, svg } = pixelsOf(emblemSvg(faction) ?? '');
    assert.deepEqual([width, height], [EMBLEM_PIXELS, EMBLEM_PIXELS]);
    assert.match(svg, /shape-rendering='crispEdges'/);
    assert.ok(pixels.size > 30, 'a sign, not a speck');
    for (const tone of pixels.values()) assert.ok(PALETTE.has(tone), `${tone} is the kit's`);
  }
});

test('the Elite’s and the Miniboss’s marks differ in shape, both in brass', () => {
  const elite = markPicture('elite');
  const miniboss = markPicture('miniboss');
  assert.notEqual(elite.svg, miniboss.svg);
  assert.equal(elite.width, miniboss.width);
  assert.ok(miniboss.height > elite.height, 'the Miniboss’s two chevrons stand taller than the Elite’s one');
  for (const { svg } of [elite, miniboss])
    for (const tone of pixelsOf(svg).pixels.values()) assert.ok(BRASS.includes(tone));
});
