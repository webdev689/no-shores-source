import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANNER_KEYS, HOURGLASS_SVG, bannerFor, bannerSvg } from './journalArt.ts';
import { pixelsOf } from './pixelsForTests.ts';
import { TONES } from './tones.ts';

test('the hourglass is DFO’s, nine by twelve: brass caps, glass sides and the sand running through', () => {
  const { width, height, pixels, svg } = pixelsOf(HOURGLASS_SVG);
  assert.deepEqual([width, height], [9, 12]);
  assert.match(svg, /shape-rendering='crispEdges'/);
  assert.equal(pixels.size, 56);
  assert.deepEqual(
    ['0,0', '8,11', '1,1', '7,10', '4,5', '2,10'].map((place) => pixels.get(place)),
    [TONES.brass, TONES.brass, TONES.glass, TONES.glass, TONES.brassHi, TONES.brassHi],
  );
  assert.equal(pixels.get('4,8'), undefined, 'the sand has run through the neck and not yet piled');
});

test('the banners are six story pennants and six side shields, each its own, and a key not drawn wears the side’s', () => {
  const story = BANNER_KEYS.filter((key) => key.startsWith('story'));
  const side = BANNER_KEYS.filter((key) => key.startsWith('side'));
  assert.deepEqual([story.length, side.length, BANNER_KEYS.length], [6, 6, 12]);
  assert.equal(new Set(BANNER_KEYS.map(bannerSvg)).size, 12, 'no two banners alike');
  for (const key of BANNER_KEYS) {
    const { width, height, pixels } = pixelsOf(bannerSvg(key));
    assert.deepEqual([width, height], [16, 24], key);
    assert.equal(pixels.get('0,0') === TONES.brassHi, key.startsWith('story'), `${key}: a pennant's brass hem`);
    assert.equal(
      [...pixels.values()].includes(TONES.blood),
      key.startsWith('story'),
      `${key}: only a story's in blood`,
    );
  }
  // The shields' fields each a tone of their own: the colour at the middle of the left of each field.
  assert.equal(new Set(side.map((key) => pixelsOf(bannerSvg(key)).pixels.get('1,5'))).size, 6);
  assert.equal(bannerSvg('a-kind-to-come'), bannerSvg('side'));
});

test('a quest naming no banner wears one of its kind’s by its id, the same each time, and quests differ', () => {
  for (const id of ['the-wreck', 'a-debt-paid', 'q1'])
    assert.equal(bannerFor('story', id), bannerFor('story', id), 'the same each time');
  const stories = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => bannerFor('story', id)));
  assert.equal(stories.size, 6, 'six ids in a row wear the six pennants');
  for (const id of ['a', 'b', 'c']) {
    assert.ok(bannerFor('story', id).startsWith('story'));
    assert.ok(bannerFor('side', id).startsWith('side'));
    assert.ok(bannerFor('a-kind-to-come', id).startsWith('side'), 'a kind to come wears a side quest’s');
  }
});
