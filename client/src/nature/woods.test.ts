import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castOf } from './cast.ts';
import { woodsOf } from './woods.ts';

test('a biome is wooded as its trees grow: thick in rainforest and woodland, open steppe and desert, green canopies', () => {
  const cover = (biome: string) => woodsOf(castOf(biome)).cover;
  assert.ok(cover('rainforest') > cover('temperate-coast') && cover('woodland') > cover('temperate-coast'));
  assert.ok(cover('temperate-coast') > cover('tundra'));
  assert.equal(cover('desert'), 0, 'its palms stand only by water');
  assert.equal(cover('steppe'), 0, 'its birches stand only by water');
  for (const biome of ['temperate-coast', 'woodland', 'rainforest', 'swamp']) {
    const [red, green, blue] = woodsOf(castOf(biome)).canopy;
    assert.ok(green > red && green > blue, `${biome}'s canopy is green`);
    assert.ok(woodsOf(castOf(biome)).gather > 0.4, `${biome}'s trees gather in groves`);
  }
});

test('a cast with no trees has no woods', () => {
  assert.deepEqual(woodsOf({ kinds: [], keepAtReach: 1 }), { canopy: [0, 0, 0], cover: 0, gather: 0 });
});
