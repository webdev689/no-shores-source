import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEART_BEAT_S } from '../../cinema/ambience.ts';
import { blurAt, darkAt, OPEN_S, throbAt } from './waking.ts';

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
  // As the wake plays it, its time and the heart's one: it holds between beats, the throb aside.
  const between = [0.55, 0.62, 0.7, 0.76].map((into) => blurAt(2 * HEART_BEAT_S + into, 2 * HEART_BEAT_S + into));
  assert.ok(Math.max(...between) - Math.min(...between) < 0.15, `holding between beats: ${between}`);
  const across = [0.5, 0.75].map((into) => blurAt(3 * HEART_BEAT_S + into, 3 * HEART_BEAT_S + into));
  const stepped = blurAt(4 * HEART_BEAT_S + 0.5, 4 * HEART_BEAT_S + 0.5);
  assert.ok((across[1] ?? 0) - stepped > 4 * Math.abs((across[0] ?? 0) - (across[1] ?? 0)), 'a step at the beat');
  assert.ok(blurAt(1, 6) > blurAt(6, 6), 'held with the wake while the wreck comes');
  assert.equal(blurAt(OPEN_S + 1, OPEN_S + 1), 0, 'clear a second after the eyes are open');
});

test('the view darkens and lightens as the eyes blink open over the first seconds, then stays clear', () => {
  assert.equal(darkAt(0), 1);
  assert.ok(darkAt(1.1) < 0.5);
  assert.ok(darkAt(1.9) > 0.9, 'dark again');
  assert.equal(darkAt(OPEN_S), 0);
  assert.equal(darkAt(10), 0);
});

test('each beat of the heart pulses the view darker while the eyes open, less as they do, and none once open', () => {
  const lifted = (time: number) => darkAt(time, 0) - darkAt(time);
  assert.ok(lifted(1.1) > 0.1, 'a beat pulses it darker');
  assert.ok(lifted(5.2) < lifted(1.1), 'less as the eyes open');
  assert.ok(darkAt(1.1, 0.6) - darkAt(1.1) < 0.02, 'all but still between beats');
  assert.equal(darkAt(OPEN_S + 1, 0), 0, 'none once open');
  assert.ok(darkAt(0.05, 0) <= 1, 'never past black');
});
