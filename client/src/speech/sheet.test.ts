import assert from 'node:assert/strict';
import { test } from 'node:test';
import { speechCss } from './sheet.ts';

test('every word of speech is set at a whole step of the face, 11 px', () => {
  const sizes = [...speechCss().matchAll(/font-size:\s*(\d+)px/g)].map((found) => Number(found[1]));
  assert.ok(sizes.length >= 4);
  for (const size of sizes) assert.equal(size % 11, 0, `${size} px`);
});

test("the box is a window: a 2 px solid border for the kit's frame to land on", () => {
  assert.match(speechCss(), /\.speech-box \{[^}]*border-width: 2px; border-style: solid/);
});

test('no border shorthand or colour, which would clear or repaint what the kit lays on a border', () => {
  assert.doesNotMatch(speechCss(), /border(-(top|right|bottom|left))?\s*:/);
  assert.doesNotMatch(speechCss(), /border(-(top|right|bottom|left))?-(color|image)\s*:/);
});

test('the box keeps to the middle, clear of the vitals at the bottom left', () => {
  assert.match(speechCss(), /\.speech-box \{[^}]*left: 50%;[^}]*calc\(100vw - 760px\)/);
});

test("the marks stand under every one of the HUD's layers, and the box takes no place over them of its own", () => {
  assert.match(speechCss(), /\.speech-overheads \{[^}]*z-index: -1;/);
  assert.doesNotMatch(speechCss(), /\.speech-box \{[^}]*z-index/);
});
