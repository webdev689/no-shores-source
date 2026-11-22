import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTLINE } from '../combat/dropPictures.ts';
import { pixelsOf } from '../plus/pixelsForTests.ts';
import { BOUNTY_GLYPH_NAMES, bountyGlyphSvg } from './bountyGlyphs.ts';
import { poolMarkSvg } from './journalIcons.ts';

/** The bounties the board draws from, by the names the rules give them. */
const BOARD = [
  'Tithe Collector',
  'A Cut Above',
  'Honest Work',
  'Big Game',
  'Broadside',
  'Bigger Fish',
  'Sea Wolf',
  'Into the Dark',
  'Deeper Still',
  'Deep Delver',
];

test('every bounty the board draws from wears a glyph of its own, sixteen square and outlined', () => {
  assert.deepEqual([...BOUNTY_GLYPH_NAMES].sort(), [...BOARD].sort());
  const drawn = BOARD.map((name) => bountyGlyphSvg(name, 0));
  assert.equal(new Set(drawn).size, 10, 'no two alike');
  for (const svg of drawn) {
    const { width, height, pixels } = pixelsOf(svg);
    assert.deepEqual([width, height], [16, 16]);
    assert.ok([...pixels.values()].includes(OUTLINE), 'outlined as the gear glyphs are');
  }
});

test('a bounty not drawn wears the mark of where it counts', () => {
  assert.equal(bountyGlyphSvg('A Bounty To Come', 1), poolMarkSvg(1));
  assert.equal(bountyGlyphSvg('A Bounty To Come', 9), '');
});
