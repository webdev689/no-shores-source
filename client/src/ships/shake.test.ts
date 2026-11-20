import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHAKE, Shake } from './shake.ts';

const size = (jar: ReturnType<Shake['at']>) => Math.hypot(jar.east, jar.south, jar.up);

test('with no kick the eye stands still', () => {
  assert.deepEqual(new Shake(1).at(3), { east: 0, south: 0, up: 0, yaw: 0, pitch: 0 });
});

test("a kick shakes the eye, swells over DFO's fade-in and dies away over its fade-out", () => {
  const shake = new Shake(2);
  shake.kick(1.6, 0);
  const most = Math.max(...Array.from({ length: 80 }, (unused, step) => size(shake.at(step / 100))));
  assert.ok(most > 0.02 && most <= 1.6 * SHAKE.metres * Math.sqrt(3) * 0.5 + 1e-9, `${most}`);
  assert.ok(Math.abs(shake.at(0.4).yaw) + Math.abs(shake.at(0.4).pitch) > 0, 'it turns the eye a little too');
  assert.deepEqual(shake.at(SHAKE.inS + SHAKE.outS + 0.01), { east: 0, south: 0, up: 0, yaw: 0, pitch: 0 });
});

test('a harder kick shakes harder, and none past the most', () => {
  const peak = (magnitude: number) => {
    const shake = new Shake(3);
    shake.kick(magnitude, 0);
    return Math.max(...Array.from({ length: 80 }, (unused, step) => size(shake.at(step / 100))));
  };
  assert.ok(peak(2.4) > peak(0.7) * 2);
  assert.equal(peak(50), peak(SHAKE.most));
});
