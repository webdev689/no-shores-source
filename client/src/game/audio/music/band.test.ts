import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEAR_M, QUIET_M, bandLevel, bandLevels, musiciansOf, themeUnder } from './band.ts';
import { INSTRUMENTS, bandParts } from './bandScore.ts';
import { PERCUSSION_CHANNEL } from './fmBank.ts';
import { songSeconds } from './score.ts';

test('an instrument sounds whole close by, quieter with distance, and silent past about 30 m', () => {
  assert.equal(bandLevel(0), 1);
  assert.equal(bandLevel(NEAR_M), 1);
  const levels = [6, 10, 15, 20, 25].map(bandLevel);
  levels.forEach((level, nth) => assert.ok(level < (levels[nth - 1] ?? 1) && level > 0, `${level} falls`));
  assert.ok(bandLevel(15) > 0.1 && bandLevel(15) < 0.4, `half way: ${bandLevel(15)}`);
  assert.equal(bandLevel(QUIET_M), 0);
  assert.equal(QUIET_M, 30);
  assert.equal(bandLevel(80), 0);
});

test('the musicians are those at an instrument’s move; each instrument heard by its nearest player', () => {
  const folk = [
    { anim: 'play_lute', x: 3, y: 0 },
    { anim: 'walk', x: 0, y: 1 },
    { anim: 'play_tambourine', x: 0, y: 12 },
    { anim: 'play_lute', x: 40, y: 0 },
    { anim: 'smith', x: 1, y: 1 },
  ];
  const musicians = musiciansOf(folk);
  assert.deepEqual(
    musicians.map((one) => one.instrument),
    ['lute', 'tambourine', 'lute'],
  );
  const levels = bandLevels({ musicians, listener: [0, 0] });
  assert.deepEqual(levels, { lute: 1, flute: 0, recorder: 0, tambourine: bandLevel(12) });
});

test('near the band the social space’s theme gives way, by quarters, never quite to nothing', () => {
  assert.equal(themeUnder(0), 1);
  assert.equal(themeUnder(bandLevel(25)), 1, 'the band faint, the theme whole');
  assert.equal(themeUnder(0.5), 0.5);
  assert.ok(themeUnder(1) > 0 && themeUnder(1) < 0.02, 'at the band, the band alone is heard');
});

test('the four play one tune together: each part its own instrument, all of one length', () => {
  const parts = bandParts();
  const lengths = INSTRUMENTS.map((instrument) => songSeconds(parts[instrument]));
  assert.ok(
    lengths.every((length) => length === lengths[0]),
    `${lengths}`,
  );
  for (const instrument of INSTRUMENTS) {
    const { notes, tracks } = parts[instrument];
    assert.ok(notes.length > 30, `${instrument} plays: ${notes.length} notes`);
    const channels = new Set(notes.map((note) => note.channel));
    assert.equal(channels.size, 1, `${instrument} alone in its part`);
    if (instrument === 'tambourine') assert.deepEqual([...channels], [PERCUSSION_CHANNEL]);
    else
      assert.deepEqual(
        [...channels],
        tracks.map((track) => track.channel),
      );
  }
  const flute = parts.flute.notes.map((note) => note.note);
  assert.ok(Math.min(...flute) >= 69 && Math.max(...flute) <= 83, 'the flute in its own range');
  const recorder = new Set(parts.recorder.notes.map((note) => note.note % 12));
  for (const key of recorder) assert.ok([1, 2, 4, 6, 7, 9, 11].includes(key), 'the recorder in D major');
});
