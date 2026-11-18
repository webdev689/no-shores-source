import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CROSSHAIR_REACH, crosshairPoint } from './crosshair.ts';

/** A view from 1.5 m up at the origin, looking north (`pitch` down positive). */
const looking = (pitch: number) => ({
  targetX: 0,
  targetY: -Math.cos(pitch),
  targetZ: 1.5 - Math.sin(pitch),
  yaw: 0,
  pitch,
  distance: 1,
});

test('the crosshair lies on the first body its line meets, before a block behind it', () => {
  const block = { minX: -2, minY: -21, maxX: 2, maxY: -20, top: 4 };
  const [x, y, z] = crosshairPoint(looking(0), 1, [block], [[0, -10, 0]]);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y + 9.65) < 1e-6 && Math.abs(z - 1.5) < 1e-6, `${x}, ${y}, ${z}`);
  const [, wall] = crosshairPoint(looking(0), 1, [block], []);
  assert.ok(Math.abs(wall + 20) < 1e-6, 'with no body, the block');
});

test('looking down it meets the ground, and with nothing ahead it lies at its reach', () => {
  const [, y, z] = crosshairPoint(looking(Math.atan2(1.5, 15)), 1, [], []);
  assert.ok(Math.abs(y + 15) < 1e-6 && Math.abs(z) < 1e-9);
  const [, far] = crosshairPoint(looking(-0.1), 1, [], []);
  assert.ok(Math.abs(far + CROSSHAIR_REACH * Math.cos(0.1)) < 1e-6);
});

test('on rising land it meets the ground where its line goes under it, not at height 0', () => {
  // Land rising 0.2 m a metre northward from 0 at the origin: a level look from 1.5 m up meets it 7.5 m out.
  const rising = (x: number, y: number) => -y * 0.2;
  const [, y, z] = crosshairPoint(looking(0), 1, [], [], rising);
  assert.ok(Math.abs(y + 7.5) < 1e-3 && Math.abs(z - 1.5) < 1e-3, `${y}, ${z}`);
  const [, level] = crosshairPoint(looking(Math.atan2(1.5, 15)), 1, [], [], () => null);
  assert.ok(Math.abs(level + 15) < 1e-3, 'where it knows no ground, at 0');
  const [, before] = crosshairPoint(looking(0), 1, [{ minX: -2, minY: -5, maxX: 2, maxY: -4, top: 4 }], [], rising);
  assert.ok(Math.abs(before + 4) < 1e-6, 'a block before the rise stops it first');
});
