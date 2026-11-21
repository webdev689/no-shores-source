import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flotsam } from './flotsam.ts';

test('what floats rides the drawn swell where it lies, drawn as large as the view draws the ships', () => {
  const flotsam = new Flotsam();
  flotsam.lay(1, [10, 20], 'crate');
  const swell = (x: number, y: number) => 0.01 * x + 0.02 * y;
  const [near, raised] = [flotsam.marks(0, 1, swell), flotsam.marks(0, 4, swell)];
  const [crate, raisedCrate] = [near[0], raised[0]];
  assert.equal(crate?.shape, 'box');
  assert.ok(crate && Math.abs(crate.z - (0.5 - crate.radius * 0.3)) < 1e-9, 'low in the water on the swell there');
  assert.ok(crate && raisedCrate && Math.abs(raisedCrate.radius - crate.radius * 4) < 1e-9);
});

test('over each piece stands a gold mark as large on the screen near or far, gone with the piece when gathered', () => {
  const flotsam = new Flotsam();
  flotsam.lay(2, [0, 0], 'chest');
  flotsam.lay(3, [400, 0], 'barrel');
  const eye = [0, -150, 40] as const;
  const marks = flotsam.marks(0, 1, () => 0, eye);
  const gold = marks.filter((mark) => mark.shape === undefined);
  assert.equal(gold.length, 2);
  const [near, far] = gold;
  const share = (mark: (typeof gold)[number]) =>
    mark.radius / Math.hypot(mark.x - eye[0], mark.y - eye[1], mark.z - eye[2]);
  assert.ok(near && far && Math.abs(share(near) - share(far)) < 1e-3, 'the same share of its distance');
  assert.ok(near && near.z > 2, 'standing over the chest');
  assert.deepEqual(flotsam.gather(2), [0, 0]);
  assert.equal(flotsam.gather(2), null, 'gathered once');
  assert.equal(flotsam.marks(0, 1, () => 0, eye).length, 2, 'the barrel and its mark');
});
