import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLD, falloff, flicker, lightAt } from './dungeonLight.ts';

test("a torch's light is all there at the torch and gone at its reach", () => {
  assert.equal(falloff(0, 8), 1);
  assert.equal(falloff(8, 8), 0);
  assert.equal(falloff(12, 8), 0);
  assert.ok(falloff(2, 8) > falloff(4, 8));
});

test('a torch flickers gently, and two never in step', () => {
  for (let time = 0; time < 10; time += 0.1) {
    assert.ok(flicker(time, 0) > 0.75 && flicker(time, 0) < 1.01);
  }
  assert.notEqual(flicker(1, 0), flicker(1, 1));
});

test('past every torch only the faint cold light is left; by one, its warm light', () => {
  const torches = [[0, 0, 2, 0]] as const;
  assert.deepEqual(lightAt(torches, 8, [20, 0, 1], 0), [...COLD]);
  const near = lightAt(torches, 8, [1, 0, 1.2], 0);
  assert.ok(near[0] > near[2] && near[0] > (COLD[0] ?? 0) * 5, 'warm, and far brighter');
});
