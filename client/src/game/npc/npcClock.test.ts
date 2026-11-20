import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockWords, secondsToMidnight, shapeSecondsLeft } from './npcClock.ts';

test('the daily keepers count down to the next midnight by the world clock', () => {
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 23, 59, 30)), 30);
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 0, 0, 0)), 86_400, 'at midnight, a whole day');
  assert.equal(secondsToMidnight(Date.UTC(2026, 10, 20, 12, 0, 0, 500)), 43_200, 'a part second counts as one');
});

test('Shape’s minutes left run down from when the room said them, never below none', () => {
  const heard = 1_000_000;
  assert.equal(shapeSecondsLeft(90, heard, heard), 5_400);
  assert.equal(shapeSecondsLeft(90, heard, heard + 61_000), 5_339);
  assert.equal(shapeSecondsLeft(1, heard, heard + 120_000), 0);
});

test('a countdown reads as hours, minutes and seconds, with whole days before them', () => {
  assert.equal(clockWords(0), '0:00:00');
  assert.equal(clockWords(35 * 60 + 47), '0:35:47');
  assert.equal(clockWords(3_600 + 41 * 60 + 9), '1:41:09');
  assert.equal(clockWords(86_400 + 3 * 3_600 + 57), '1 day 3:00:57');
  assert.equal(clockWords(2 * 86_400 + 17), '2 days 0:00:17');
});
