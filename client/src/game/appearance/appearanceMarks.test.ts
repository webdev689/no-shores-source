import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosmeticRamp } from '../../forge/cosmetics.ts';
import { GAME_PALETTE } from './gamePalette.ts';
import { CUIRASS_ROWS, WARDROBE_ROWS, dyeSvg, wardrobeSvg } from './appearanceMarks.ts';

test('the marks are whole squares of pixels, every letter a colour of their palettes', () => {
  for (const rows of [WARDROBE_ROWS, CUIRASS_ROWS]) {
    assert.ok(rows.every((row) => row.length === rows.length));
    assert.ok(rows.every((row) => /^[.a-g]+$/.test(row)));
  }
  assert.match(wardrobeSvg(), /viewBox="0 0 16 16"/);
});

test("a dye's tile is its ramp over the cuirass; none shows the own colours", () => {
  const coral = cosmeticRamp('coral', GAME_PALETTE);
  const hex = (step: number, ramp = coral) =>
    `#${(ramp?.[step] ?? [0, 0, 0]).map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  assert.ok(dyeSvg(coral).includes(hex(14)), "the cuirass's light is the dye's");
  assert.notEqual(dyeSvg(null), dyeSvg(coral));
});
