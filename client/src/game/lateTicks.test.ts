import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_MOST_S, TICKS_MOST_S, lateSeconds } from './lateTicks.ts';

test('a frame within the cap leaves nothing to make up', () => {
  assert.equal(lateSeconds(1 / 60), 0);
  assert.equal(lateSeconds(FRAME_MOST_S), 0);
  assert.equal(lateSeconds(-1), 0, 'nor a clock gone back');
});

test("a slow frame's time past the cap is made up, to the room's lag less its slack at most", () => {
  assert.ok(Math.abs(lateSeconds(0.25) - 0.15) < 1e-12);
  assert.equal(lateSeconds(5), TICKS_MOST_S - FRAME_MOST_S, 'a tab come back after seconds');
  // At the rooms' 60 ticks a second: crates/room/src/players.rs VIEW_LAG (24) less SLACK_TICKS (6).
  assert.equal(Math.round(TICKS_MOST_S * 60), 24 - 6);
});
