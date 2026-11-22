import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swayedQuad } from './fpPlaces.ts';

test('a swaying picture never comes off an edge it is cut at, so no gap opens beside an arm or a gun', () => {
  const quadAt = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  const lag = [-12, -12] as const;
  // A gun flush in the bottom right corner: turning right would lag it left and up, showing its cut stock.
  const gun = swayedQuad(quadAt(220, 120, 100, 80), lag);
  assert.deepEqual([gun.x, gun.y], [220, 120], 'held at both cut edges');
  assert.deepEqual(
    [swayedQuad(quadAt(220, 120, 100, 80), [9, 5]).x, swayedQuad(quadAt(220, 120, 100, 80), [9, 5]).y],
    [229, 125],
  );
  // A sword lowered 60 below the foot rises as far as its overhang, and sways freely across the middle.
  const sword = swayedQuad(quadAt(150, 100, 80, 160), lag);
  assert.deepEqual([sword.x, sword.y], [138, 88]);
  const shield = swayedQuad(quadAt(-6, 110, 90, 90), [10, 0]);
  assert.equal(shield.x, 0, 'a shield cut at the left comes no further in than its overhang');
  assert.deepEqual(swayedQuad(quadAt(100, 50, 40, 40), lag, true), quadAt(100, 50, 40, 40), 'a hand on a wall stays');
});
