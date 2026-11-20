import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockWords, secondsToMidnight, shapeSecondsLeft } from './npcClock.ts';

test('the daily keepers count down to the next midnight by the world clock', () => {
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 23, 59, 30)), 30);
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 0, 0, 0)), 0, 'at midnight, none: the wares turn');
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 19, 23, 59, 59, 500)), 1);
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 12, 0, 0, 500)), 43_200, 'a part second counts as one');
});

test('Shape’s time left runs by the world clock to Sunday 21:00 UTC, never below none', () => {
  // The 20th of November 2026 falls on a Friday.
  assert.equal(shapeSecondsLeft(Date.UTC(2026, 10, 20, 9, 0, 0)), 2 * 86_400 + 12 * 3_600, 'as he comes');
  assert.equal(shapeSecondsLeft(Date.UTC(2026, 10, 22, 20, 58, 30)), 90);
  assert.equal(shapeSecondsLeft(Date.UTC(2026, 10, 22, 21, 0, 0)), 0, 'as he goes');
  assert.equal(shapeSecondsLeft(Date.UTC(2026, 10, 22, 23, 0, 0)), 0, 'gone till Monday');
});

test('a countdown reads as hours, minutes and seconds, with whole days before them', () => {
  assert.equal(clockWords(0), '0:00:00');
  assert.equal(clockWords(35 * 60 + 47), '0:35:47');
  assert.equal(clockWords(3_600 + 41 * 60 + 9), '1:41:09');
  assert.equal(clockWords(86_400 + 3 * 3_600 + 57), '1 day 3:00:57');
  assert.equal(clockWords(2 * 86_400 + 17), '2 days 0:00:17');
});
