import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chordAt, keys, measured, progression, runsOf } from './craft.ts';

const CHORDS = { Em: 0, C: 0, D: 0 };

test('a progression splits a bar where its metre says, evenly where it does not, and refuses a chord unknown', () => {
  const [one, two, three] = progression('Em | C/D | C/D/Em', CHORDS, 3, { 2: [0, 1.5] });
  assert.deepEqual(one, [{ chord: 'Em', beat: 0, beats: 3 }]);
  assert.deepEqual(two, [
    { chord: 'C', beat: 0, beats: 1.5 },
    { chord: 'D', beat: 1.5, beats: 1.5 },
  ]);
  assert.deepEqual(
    three?.map(({ beat, beats }) => [beat, beats]),
    [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  );
  assert.equal(chordAt(two ?? [], 2), 'D');
  assert.throws(() => progression('Em | F', CHORDS, 3));
});

test('a chord that follows itself is held on, and a tune whose bar is the wrong length is refused', () => {
  const runs = runsOf(progression('Em | Em | C/Em | Em', CHORDS, 3, { 2: [0, 1.5] }), 3);
  assert.deepEqual(
    runs.map(({ chord, bar, beat, beats }) => [chord, bar, beat, beats]),
    [
      ['Em', 0, 0, 6],
      ['C', 2, 0, 1.5],
      ['Em', 2, 1.5, 4.5],
    ],
  );
  assert.deepEqual(keys('E2 B2'), [40, 47]);
  assert.equal(measured('E4:1.5 B4:1.5 | E5:3', 3).length, 2);
  assert.throws(() => measured('E4:1.5 B4:1 | E5:3', 3), /bar 1/);
});
