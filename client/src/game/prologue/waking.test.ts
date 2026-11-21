import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEART_BEAT_S } from '../../cinema/ambience.ts';
import { blurAt, lidsAt, lightAt, OPEN_S, throbAt } from './waking.ts';

test('the heart throbs at each thump of a beat and is still between them', () => {
  assert.equal(throbAt(0), 1);
  assert.ok(throbAt(0.28) > 0.6, 'the second thump');
  assert.ok(throbAt(0.6) < 0.1, 'still before the next beat');
  assert.ok(throbAt(HEART_BEAT_S * 3 + 1e-9) > 0.99, 'again at the third beat');
});

test('the view clears a step at each beat, never ahead of the wake, and is clear once the eyes are open', () => {
  const settled = (beat: number) => blurAt(99, beat * HEART_BEAT_S + 0.5);
  assert.ok(blurAt(0, 0) >= 9, 'blurred to begin');
  for (let beat = 0; beat < 7; beat++) assert.ok(settled(beat + 1) < settled(beat), `clearer after beat ${beat + 1}`);
  const between = [0.55, 0.62, 0.7, 0.76].map((into) => blurAt(99, 2 * HEART_BEAT_S + into));
  assert.ok(Math.max(...between) - Math.min(...between) < 0.15, `holding between beats: ${between}`);
  assert.ok(blurAt(1, 6) > blurAt(6, 6), 'held with the wake while the wreck comes');
  assert.equal(blurAt(OPEN_S + 1, 20), 0);
});

test('light comes through the lids with each beat, and the eyes open as before', () => {
  assert.ok(lightAt(0) > lightAt(0.6));
  assert.equal(lidsAt(0), 1);
  assert.equal(lidsAt(OPEN_S), 0);
});
