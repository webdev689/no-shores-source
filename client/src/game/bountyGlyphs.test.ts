import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { OUTLINE } from '../combat/dropPictures.ts';
import { pixelsOf } from '../plus/pixelsForTests.ts';
import { BOUNTY_GLYPH_NAMES, bountyGlyphUrl } from './bountyGlyphs.ts';
import { poolMarkUrl } from './journalIcons.ts';

const RULES = new URL('../../../crates/gear/src/bounties.rs', import.meta.url);

test('every bounty the board draws from wears a glyph of its own, sixteen square and outlined', () => {
  // Each template's last words are its name: `(objective, target, "words", "Name"),`.
  const named = [...readFileSync(RULES, 'utf8').matchAll(/"[^"]+", "([^"]+)"\),/g)].map((found) => found[1]);
  assert.equal(named.length, 10);
  assert.deepEqual([...BOUNTY_GLYPH_NAMES].sort(), [...named].sort());
  const urls = BOUNTY_GLYPH_NAMES.map((name) => bountyGlyphUrl(name, 0));
  assert.equal(new Set(urls).size, 10, 'no two alike');
  for (const url of urls) {
    const { width, height, pixels } = pixelsOf(url);
    assert.deepEqual([width, height], [16, 16]);
    assert.ok([...pixels.values()].includes(OUTLINE), 'outlined as the gear glyphs are');
  }
});

test('a bounty not drawn wears the mark of where it counts', () => {
  assert.equal(bountyGlyphUrl('A Bounty To Come', 1), poolMarkUrl(1));
  assert.equal(bountyGlyphUrl('A Bounty To Come', 9), '');
});
