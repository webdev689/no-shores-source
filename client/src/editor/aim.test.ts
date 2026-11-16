import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIM_EYE, aimEye, lookBearing, lookRange, lookReach } from './aim.ts';

const near = (actual: number, wanted: number, within = 1e-9) => Math.abs(actual - wanted) <= within;

test('a look down onto the water lays where it meets it, and past the dip on at 30 m a degree', () => {
  const dip = (10 * Math.PI) / 180;
  assert.ok(near(lookReach(-dip, 5.5), 5.5 / Math.tan(dip)));
  const flat = lookReach(0, 5.5);
  const raised = lookReach((1 * Math.PI) / 180, 5.5);
  assert.ok(near(raised - flat, 30, 1e-6), `${raised - flat}`);
  assert.ok(near(lookReach(-dip, 0.1), 0.5 / Math.tan(dip)), 'an eye under half a metre is reckoned at half a metre');
});

test('a look bears off her bow in degrees, starboard positive', () => {
  assert.ok(near(lookBearing(Math.PI / 2, 0), 90));
  assert.ok(near(lookBearing(0, Math.PI / 2), -90));
  assert.ok(near(lookBearing(0.1, 2 * Math.PI - 0.1), (0.2 * 180) / Math.PI));
  assert.ok(near(lookBearing(Math.PI, 0), 180));
});

test('the aim eye stands out past her guns on the side looked at, up and aft', () => {
  // Heading north: starboard is east, aft is south.
  const [x, y, z] = aimEye({ x: 10, y: 20, heading: 0, heave: 0.5 }, 1);
  assert.ok(near(x, 10 + AIM_EYE.out) && near(y, 20 + AIM_EYE.aft) && near(z, 0.5 + AIM_EYE.up));
  assert.ok(near(aimEye({ x: 10, y: 20, heading: 0, heave: 0 }, -1)[0], 10 - AIM_EYE.out));
});

test("a look's range is how far out along her fire it meets the water, from her middle", () => {
  const ship = { x: 0, y: 0, heading: 0, heave: 0 };
  // Looking due east from the starboard eye, the water is met 50 m out from it.
  const eye = aimEye(ship, 1);
  const out = lookRange(ship, eye, Math.PI / 2, -Math.atan(eye[2] / 50));
  assert.ok(near(out, eye[0] + 50, 1e-6), `${out}`);
});
