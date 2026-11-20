import assert from 'node:assert/strict';
import { test } from 'node:test';
import { birdAt, flockOf } from './birds.ts';

const CENTRE = [500, -300, 40] as const;

test('a flock is the same from the same seed and never two birds alike', () => {
  assert.deepEqual(flockOf(12, 30, 5), flockOf(12, 30, 5));
  assert.notDeepEqual(flockOf(12, 30, 5), flockOf(12, 30, 6));
  const flock = flockOf(40, 30, 5);
  const places = flock.map((bird) =>
    birdAt(bird, CENTRE, 10)
      .position.map((value) => value.toFixed(2))
      .join(),
  );
  assert.equal(new Set(places).size, 40);
});

test('every bird keeps within its radius of the flock’s centre and near its height', () => {
  for (const bird of flockOf(30, 25, 9)) {
    for (let seconds = 0; seconds < 120; seconds += 0.37) {
      const [x, y, z] = birdAt(bird, CENTRE, seconds).position;
      assert.ok(Math.hypot(x - CENTRE[0], y - CENTRE[1]) <= 25, 'outside its radius');
      assert.ok(Math.abs(z - CENTRE[2]) <= 25 * 0.25 + 3, 'too far above or below');
    }
  }
});

test('a bird flies round in loose circles, heading along its path', () => {
  const [bird] = flockOf(1, 30, 2);
  assert.ok(bird);
  const turns: number[] = [];
  for (let seconds = 0; seconds < 60; seconds += 0.1) {
    const now = birdAt(bird, CENTRE, seconds);
    const soon = birdAt(bird, CENTRE, seconds + 0.01);
    const travel = Math.atan2(soon.position[0] - now.position[0], -(soon.position[1] - now.position[1]));
    const off = Math.atan2(Math.sin(travel - now.heading), Math.cos(travel - now.heading));
    assert.ok(Math.abs(off) < 0.05, `heading off its path by ${off}`);
    turns.push(Math.atan2(now.position[1] - CENTRE[1], now.position[0] - CENTRE[0]));
  }
  const swept = turns.slice(1).reduce((sum, angle, index) => {
    const before = turns[index] ?? angle;
    return sum + Math.atan2(Math.sin(angle - before), Math.cos(angle - before));
  }, 0);
  assert.ok(Math.abs(swept) > Math.PI * 2, 'went round at least once a minute');
});

test('a bird both flaps and glides', () => {
  const [bird] = flockOf(1, 30, 3);
  assert.ok(bird);
  const wings = [...Array(600).keys()].map((step) => birdAt(bird, CENTRE, step / 20).wing);
  assert.ok(wings.some((wing) => wing > 0.9) && wings.some((wing) => wing < -0.9), 'flaps full strokes');
  const held = wings.filter((wing, index) => index > 0 && wing === wings[index - 1]);
  assert.ok(held.length > 60, 'glides with its wings held');
});
