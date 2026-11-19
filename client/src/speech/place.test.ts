import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BARK_HOLD_S,
  FADE_S,
  GAP_PX,
  barkOpacity,
  emoteOpacity,
  glyphScale,
  overheadPlace,
  underTheTop,
} from './place.ts';

test('an overhead stands centred over the head point, its foot a gap above it', () => {
  assert.deepEqual(overheadPlace([500, 400], [21, 45], 0), [490, 400 - GAP_PX - 45]);
  assert.deepEqual(overheadPlace([500.6, 400.2], [20, 10], 0), [491, 400 - GAP_PX - 10], 'on whole pixels');
});

test('a bark over an emote stands above the glyph', () => {
  const [, glyphTop] = overheadPlace([500, 400], [21, 45], 0);
  const [, barkTop] = overheadPlace([500, 400], [120, 30], 45);
  assert.ok(barkTop + 30 <= glyphTop, "the bark's foot is above the glyph's top");
});

test('glyphs grow a whole step on a tall screen', () => {
  assert.equal(glyphScale(400), 2);
  assert.equal(glyphScale(720), 3);
  assert.equal(glyphScale(1080), 4);
  assert.equal(glyphScale(2160), 9);
});

test('a bark stands while typed, holds, then fades and is gone', () => {
  assert.equal(barkOpacity(false, 5), 1, 'still typing');
  assert.equal(barkOpacity(true, BARK_HOLD_S - 0.01), 1);
  assert.ok(barkOpacity(true, BARK_HOLD_S + FADE_S / 2) < 1);
  assert.equal(barkOpacity(true, BARK_HOLD_S + FADE_S), 0);
});

test('an emote fades in, stands, and fades out by the end of its life', () => {
  const life = { lifeS: 1, fadeInS: 0.1, fadeOutS: 0.2 };
  assert.equal(emoteOpacity(life, 0), 0);
  assert.equal(emoteOpacity(life, 0.05), 0.5);
  assert.equal(emoteOpacity(life, 0.5), 1);
  assert.ok(Math.abs(emoteOpacity(life, 0.9) - 0.5) < 1e-9);
  assert.equal(emoteOpacity(life, 1), 0);
});

test('words over a head near the edges stay whole on the view: moved in from a side, and down from the top', () => {
  assert.deepEqual(overheadPlace([10, 400], [120, 22], 0, 1600), [0, 400 - GAP_PX - 22], 'in from the left edge');
  assert.deepEqual(overheadPlace([1595, 400], [120, 22], 0, 1600), [1480, 400 - GAP_PX - 22], 'in from the right');
  const head = underTheTop([800, 30], 98);
  assert.deepEqual(head, [800, 98], 'down just far enough for what stands over it');
  const [, top] = overheadPlace(head, [120, 22], 60, 1600);
  assert.ok(top >= 0, 'the highest word is on the view');
  assert.deepEqual(underTheTop([800, 400], 98), [800, 400], 'a head lower down is not moved');
});
