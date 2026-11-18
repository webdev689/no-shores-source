import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMBLEM_FACTIONS, EMBLEM_PIXELS, emblemUrl, markPicture } from './emblems.ts';
import { TONES } from './tones.ts';

/** A picture's pixels from its data URL: its size and each pixel's colour by place. */
function pixelsOf(url: string) {
  const svg = decodeURIComponent(url.replace('data:image/svg+xml,', ''));
  const size = /width='(\d+)' height='(\d+)'/.exec(svg);
  const pixels = new Map<string, string>();
  for (const [, x, y, fill] of svg.matchAll(/<rect x='(\d+)' y='(\d+)' width='1' height='1' fill='([^']+)'\/>/g))
    pixels.set(`${x},${y}`, fill ?? '');
  return { width: Number(size?.[1]), height: Number(size?.[2]), pixels, svg };
}

const STONE: readonly string[] = [TONES.stoneHi, TONES.stoneLit, TONES.stoneMid];
const BRASS: readonly string[] = [TONES.brassHi, TONES.brassLo];
const PALETTE = new Set<string>(Object.values(TONES));

test('the Grey Tithe wears its emblem in grey stone, the pirates theirs in bone and brass, and others none', () => {
  assert.deepEqual(EMBLEM_FACTIONS, [1, 2]);
  const tithe = pixelsOf(emblemUrl(1) ?? '');
  const pirates = pixelsOf(emblemUrl(2) ?? '');
  assert.ok(
    [...tithe.pixels.values()].every((tone) => STONE.includes(tone)),
    'the Tithe in stone alone',
  );
  const pirateTones = new Set(pirates.pixels.values());
  assert.ok(pirateTones.has(TONES.wordDim) && pirateTones.has(TONES.brass), 'the pirates in bone and brass');
  assert.equal(emblemUrl(0), null, 'a player’s ship, faction 0, wears none');
  assert.equal(emblemUrl(9), null);
});

test('each emblem is a square of whole pixels in the kit’s palette, drawn sharp', () => {
  for (const faction of EMBLEM_FACTIONS) {
    const { width, height, pixels, svg } = pixelsOf(emblemUrl(faction) ?? '');
    assert.deepEqual([width, height], [EMBLEM_PIXELS, EMBLEM_PIXELS]);
    assert.match(svg, /shape-rendering='crispEdges'/);
    assert.ok(pixels.size > 30, 'a sign, not a speck');
    for (const tone of pixels.values()) assert.ok(PALETTE.has(tone), `${tone} is the kit's`);
  }
});

test('the Elite’s and the Miniboss’s marks differ in shape, both in brass', () => {
  const elite = markPicture('elite');
  const miniboss = markPicture('miniboss');
  assert.notEqual(elite.url, miniboss.url);
  assert.equal(elite.width, miniboss.width);
  assert.ok(miniboss.height > elite.height, 'the Miniboss’s two chevrons stand taller than the Elite’s one');
  for (const { url } of [elite, miniboss])
    for (const tone of pixelsOf(url).pixels.values()) assert.ok(BRASS.includes(tone));
});
