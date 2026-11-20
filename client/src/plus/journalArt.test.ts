import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANNER_KEYS, HOURGLASS_URL, bannerUrl, poolMarkUrl } from './journalArt.ts';
import { pixelsOf } from './pixelsForTests.ts';
import { TONES } from './tones.ts';

const PALETTE = new Set<string>(Object.values(TONES));

test('the hourglass is DFO’s, nine by twelve: brass caps, glass sides and the sand running through', () => {
  const { width, height, pixels, svg } = pixelsOf(HOURGLASS_URL);
  assert.deepEqual([width, height], [9, 12]);
  assert.match(svg, /shape-rendering='crispEdges'/);
  assert.equal(pixels.size, 56);
  assert.deepEqual(
    ['0,0', '8,11', '1,1', '7,10', '4,5', '2,10'].map((place) => pixels.get(place)),
    [TONES.brass, TONES.brass, TONES.glass, TONES.glass, TONES.brassHi, TONES.brassHi],
  );
  assert.equal(pixels.get('4,8'), undefined, 'the sand has run through the neck and not yet piled');
});

test('a story mission’s banner and a side quest’s differ, and a key not drawn wears the side quest’s', () => {
  assert.deepEqual(BANNER_KEYS, ['story', 'side']);
  const [story, side] = BANNER_KEYS.map((key) => pixelsOf(bannerUrl(key)));
  assert.deepEqual([story?.width, story?.height, side?.width, side?.height], [16, 24, 16, 24]);
  assert.ok([...(story?.pixels.values() ?? [])].includes(TONES.blood), 'the story’s in blood and brass');
  assert.ok(![...(side?.pixels.values() ?? [])].includes(TONES.blood), 'a side quest’s in stone');
  assert.equal(bannerUrl('a-kind-to-come'), bannerUrl('side'));
  for (const key of BANNER_KEYS)
    for (const tone of pixelsOf(bannerUrl(key)).pixels.values()) assert.ok(PALETTE.has(tone));
});

test('each of the board’s three pools has its own mark, eleven square, and no other pool has one', () => {
  const marks = [0, 1, 2].map((pool) => poolMarkUrl(pool) ?? '');
  assert.equal(new Set(marks).size, 3);
  for (const url of marks) assert.deepEqual([pixelsOf(url).width, pixelsOf(url).height], [11, 11]);
  assert.equal(poolMarkUrl(3), null);
});
