import assert from 'node:assert/strict';
import { test } from 'node:test';
import { around, lookAt, railMoved, railShot, smooth, type RailKey } from './rail.ts';

const KEYS: RailKey[] = [
  { at: 0, eye: [0, 0, 10], look: [0, -100, 0] },
  { at: 4, eye: [40, 0, 20], look: [40, -100, 0], fov: 0.6 },
  { at: 10, eye: [100, 0, 10], look: [100, -100, 0] },
];

test('a rail passes through every key at its time, exactly', () => {
  const late = railMoved(KEYS, [0.1, 0.2, 0.3], 7.3);
  for (const rail of [KEYS, late])
    for (const key of rail) assert.deepEqual(railShot(rail, key.at, 0.9, 'none').eye, key.eye);
  assert.equal(railShot(KEYS, 4, 0.9, 'none').fov, 0.6);
  assert.equal(railShot(KEYS, 10, 0.9, 'none').fov, 0.9, "a key's own lens, or the rail's");
});

test('before its first key and after its last a rail holds still, on that key exactly', () => {
  assert.deepEqual(railShot(KEYS, -3, 0.9).eye, railShot(KEYS, 0, 0.9).eye);
  assert.deepEqual(railShot(KEYS, 30, 0.9).eye, railShot(KEYS, 10, 0.9).eye);
  const late = railMoved(KEYS, [0.1, 0.2, 0.3], 7.3);
  for (const ease of ['both', 'in', 'out', 'none'] as const) {
    assert.deepEqual(railShot(late, 999, 0.9, ease).eye, late[late.length - 1]?.eye, ease);
    assert.deepEqual(railShot(late, -999, 0.9, ease).eye, late[0]?.eye, ease);
  }
});

test('an eased rail starts and ends at rest, and still reaches each end', () => {
  const step = 0.01;
  const speed = (time: number) => {
    const [a, b] = [railShot(KEYS, time, 0.9), railShot(KEYS, time + step, 0.9)];
    return Math.hypot(b.eye[0] - a.eye[0], b.eye[1] - a.eye[1], b.eye[2] - a.eye[2]) / step;
  };
  assert.ok(speed(0) < 0.5, `out of rest: ${speed(0)}`);
  assert.ok(speed(9.99 - step) < 0.5, `into rest: ${speed(9.99 - step)}`);
  assert.ok(speed(5) > 5, 'moving in the middle');
  assert.ok(Math.abs(railShot(KEYS, 10, 0.9).eye[0] - 100) < 1e-9);
});

test('the curve has no corner at a key', () => {
  const direction = (time: number) => {
    const [a, b] = [railShot(KEYS, time - 0.001, 0.9, 'none'), railShot(KEYS, time + 0.001, 0.9, 'none')];
    return Math.atan2(b.eye[2] - a.eye[2], b.eye[0] - a.eye[0]);
  };
  assert.ok(Math.abs(direction(3.99) - direction(4.01)) < 0.02);
});

test('a look north is bearing 0, east a quarter turn, and down is a positive pitch', () => {
  assert.ok(Math.abs(lookAt([0, 0, 0], [0, -10, 0]).yaw) < 1e-12);
  assert.ok(Math.abs(lookAt([0, 0, 0], [10, 0, 0]).yaw - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(lookAt([0, 0, 10], [0, -10, 0]).pitch - Math.PI / 4) < 1e-12);
});

test('a rail moves and delays whole', () => {
  const moved = railMoved(KEYS, [5, 6, 7], 2);
  assert.deepEqual(moved[0]?.eye, [5, 6, 17]);
  assert.equal(moved[2]?.at, 12);
  assert.deepEqual(around([0, 0, 0], Math.PI / 2, 10, 3), [10, -6.123233995736766e-16, 3]);
  assert.equal(smooth(-1), 0);
  assert.equal(smooth(0.5), 0.5);
});

test('a rail never passes its keys: after a long drop to a key it holds, the camera stays at or over it', () => {
  // The ram's shape: high over the sea, down sharply to the deck, then held there while the larger ship strikes.
  const drop: RailKey[] = [
    { at: 0, eye: [-60, -75, 40], look: [0, 25, 5] },
    { at: 1.2, eye: [-15, -2.4, 4.9], look: [0, 24, 9] },
    { at: 5.6, eye: [-14.5, -2.2, 4.9], look: [0, 20, 8] },
  ];
  for (let time = 0; time <= 5.6; time += 0.02) {
    const { eye } = railShot(drop, time, 0.85, 'none');
    assert.ok(eye[2] >= 4.9 - 1e-9, `at ${time.toFixed(2)} s the eye is ${eye[2].toFixed(2)} m up`);
    assert.ok(eye[2] <= 40 + 1e-9);
    assert.ok(eye[0] >= -60 - 1e-9 && eye[0] <= -14.5 + 1e-9, `at ${time.toFixed(2)} s across ${eye[0].toFixed(2)}`);
  }
});
