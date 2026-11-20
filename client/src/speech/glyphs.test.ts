import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMOTE_KINDS } from './cast.ts';
import { EMOTES, glyphMotion, glyphPixels, glyphSize } from './glyphs.ts';
import { TONES } from '../plus/tones.ts';

test('every feeling has a glyph, a sound and a life', () => {
  for (const kind of EMOTE_KINDS) {
    const emote = EMOTES[kind];
    assert.ok(emote.art.length > 0, kind);
    assert.ok(emote.sound.syllables >= 1 && emote.sound.voice.syllableS > 0, kind);
    assert.ok(emote.fadeInS + emote.fadeOutS < emote.lifeS, kind);
  }
});

test('each glyph is a whole grid: every row as wide as the first', () => {
  for (const kind of EMOTE_KINDS) {
    const width = EMOTES[kind].art[0].length;
    for (const row of EMOTES[kind].art) assert.equal(row.length, width, `${kind}: "${row}"`);
  }
});

test('a glyph is drawn at a whole multiple of its grid', () => {
  assert.deepEqual(glyphSize('alert', 1), [7, 15]);
  assert.deepEqual(glyphSize('alert', 3), [21, 45]);
  assert.deepEqual(glyphSize('fear', 2), [22, 28]);
  assert.deepEqual(glyphSize('silence', 3), [45, 15]);
  assert.deepEqual(glyphSize('anger', 3), [39, 39], 'its ring adds a cell each side');
});

test('no glyph is much smaller than its siblings', () => {
  const areas = EMOTE_KINDS.map((kind) => glyphSize(kind, 1)[0] * glyphSize(kind, 1)[1]);
  assert.ok(Math.min(...areas) * 3 >= Math.max(...areas), `areas ${areas.join(', ')}`);
});

test('art without an outline of its own is ringed in the page outline, so it reads over bright sky', () => {
  for (const kind of ['anger', 'cheer'] as const) {
    const pixels = glyphPixels(kind);
    const [width] = glyphSize(kind, 1);
    assert.ok(
      pixels.some((pixel) => pixel.row === 0 && pixel.colour === TONES.outline),
      kind,
    );
    assert.ok(
      !pixels.some((pixel) => pixel.column === 0 && pixel.row === 0),
      `${kind}: the ring keeps its corners clear`,
    );
    assert.ok(
      pixels.every((pixel) => pixel.column < width),
      kind,
    );
  }
  assert.ok(!glyphPixels('alert').some((pixel) => pixel.colour === TONES.outline), 'alert keeps its own outline alone');
});

test('every pixel of a glyph has a colour, and every colour is used', () => {
  for (const kind of EMOTE_KINDS) {
    const { art, palette } = EMOTES[kind];
    const used = new Set(art.join('').replaceAll('.', ''));
    assert.deepEqual([...used].sort(), Object.keys(palette).sort(), kind);
    for (const colour of Object.values(palette)) assert.match(colour, /^#[0-9a-f]{6}$/, kind);
  }
});

test('each feeling has a colour of its own', () => {
  const bodies = EMOTE_KINDS.map((kind) => EMOTES[kind].palette.M);
  assert.equal(new Set(bodies).size, EMOTE_KINDS.length);
});

test('the pixels laid down are the art, row by row, in its colours', () => {
  const pixels = glyphPixels('alert');
  assert.deepEqual(pixels[0], { column: 2, row: 0, colour: EMOTES.alert.palette.O });
  assert.equal(pixels.length, EMOTES.alert.art.join('').replaceAll('.', '').length);
  assert.ok(!pixels.some((pixel) => pixel.row === 10), 'the gap between bar and dot stays clear');
});

test('each glyph moves in whole pixels of its grid, and not at all when motion is reduced', () => {
  for (const kind of EMOTE_KINDS) {
    for (const age of [0, 0.13, 0.4, 0.9]) {
      const [across, down] = glyphMotion(kind, age, false);
      assert.ok(Number.isInteger(across) && Number.isInteger(down), kind);
      assert.ok(Math.abs(across) <= 2, kind);
      assert.deepEqual(glyphMotion(kind, age, true), [0, 0], kind);
    }
  }
});

test('fear bobs, anger shakes, cheer rises, silence stays still', () => {
  const ages = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const moves = (kind: (typeof EMOTE_KINDS)[number], axis: 0 | 1) =>
    new Set(ages.map((age) => glyphMotion(kind, age, false)[axis])).size > 1;
  assert.ok(moves('fear', 1) && !moves('fear', 0));
  assert.ok(moves('anger', 0) && !moves('anger', 1));
  assert.ok(glyphMotion('cheer', 1, false)[1] < glyphMotion('cheer', 0, false)[1]);
  assert.ok(!moves('silence', 0) && !moves('silence', 1));
});
